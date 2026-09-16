import { PDFDocument } from 'pdf-lib';
import { getSupabase, ilikeOr } from './_supabase.js';
import { requireUser, INSTITUTION_READ_ROLES } from './_auth.js';
import { resolveInstitutionNames } from './_scope.js';

import { withErrorAlert } from './_error-alert.js';

const ALLOWED_PDF_HOST = 'files.ezcount.co.il';

// Opt-in per institution user (like 'bank-refusals'/'keva') — this report
// isn't granted blanket to every institution-role account, only ones an
// admin explicitly scoped to a fund/category for it.
const INSTITUTION_TAB = 'donor-report';

async function buildQuery(supabase, { customerName, customerIdNumber, year, user }) {
  let query = supabase
    .from('issued_receipts')
    .select('receipt_number, institution_name, receipt_type, category, customer_name, amount, issue_date, pdf_url')
    .gte('issue_date', `${year}-01-01`)
    .lte('issue_date', `${year}-12-31`)
    .order('issue_date', { ascending: true });

  if (customerIdNumber) {
    query = query.eq('customer_id_number', customerIdNumber);
  } else {
    const orClause = ilikeOr(['customer_name'], customerName);
    query = orClause ? query.or(orClause) : query.eq('customer_name', '');
  }

  // An institution caller only ever sees receipts within their own scope,
  // regardless of which donor they searched for — mirrors payment-failures.js's
  // applyOwnerScope (AND, never OR, since a category string like "יחי ראובן"
  // isn't guaranteed unique across institutions).
  if (user.role === 'institution') {
    const names = user.allowedMosadim?.length ? await resolveInstitutionNames(supabase, user.allowedMosadim) : [];
    query = query.in('institution_name', names.length ? names : ['__none__']);
    if (user.allowedGroupNames?.length) query = query.in('category', user.allowedGroupNames);
  }

  return query;
}

async function mergePdfs(receipts) {
  const buffers = await Promise.all(receipts.map(async (r) => {
    if (!r.pdf_url) return null;
    let parsed;
    try { parsed = new URL(r.pdf_url); } catch { return null; }
    if (parsed.hostname !== ALLOWED_PDF_HOST) return null;
    try {
      const response = await fetch(r.pdf_url);
      if (!response.ok) return null;
      return await response.arrayBuffer();
    } catch {
      return null;
    }
  }));

  const merged = await PDFDocument.create();
  for (const buf of buffers) {
    if (!buf) continue;
    try {
      const src = await PDFDocument.load(buf);
      const pages = await merged.copyPages(src, src.getPageIndices());
      pages.forEach((p) => merged.addPage(p));
    } catch {
      // skip a receipt whose PDF can't be parsed — best-effort merge
    }
  }
  return merged.getPageCount() > 0 ? await merged.save() : null;
}

async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const supabase = getSupabase();
    const user = await requireUser(req, res, supabase, { roles: INSTITUTION_READ_ROLES });
    if (!user) return;
    if (user.role === 'institution' && !user.extraTabs?.includes(INSTITUTION_TAB)) {
      return res.status(403).json({ error: 'אין לך הרשאה לדוח זה' });
    }

    const { customer_name, customer_id_number, year, format } = req.query;
    if (!customer_name && !customer_id_number) return res.status(400).json({ error: 'יש לציין שם תורם או מספר זהות' });
    if (!/^\d{4}$/.test(String(year || ''))) return res.status(400).json({ error: 'יש לציין שנה תקינה' });

    const { data, error } = await buildQuery(supabase, { customerName: customer_name, customerIdNumber: customer_id_number, year, user });
    if (error) return res.status(500).json({ error: error.message });
    const receipts = data ?? [];

    if (format === 'merged') {
      const pdfBytes = await mergePdfs(receipts);
      if (!pdfBytes) return res.status(404).json({ error: 'לא נמצאו קבלות תקינות למיזוג' });
      const donorLabel = (customer_name || customer_id_number || 'תורם').trim();
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(`דוח-${donorLabel}-${year}.pdf`)}`);
      return res.send(Buffer.from(pdfBytes));
    }

    const total = receipts.reduce((sum, r) => sum + (Number(r.amount) || 0), 0);
    res.json({ receipts, total, count: receipts.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

export default withErrorAlert(handler, 'donor-report');
