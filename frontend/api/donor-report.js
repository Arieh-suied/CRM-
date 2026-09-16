import { PDFDocument } from 'pdf-lib';
import { getSupabase, ilikeOr } from './_supabase.js';
import { requireUser } from './_auth.js';

import { withErrorAlert } from './_error-alert.js';

const ALLOWED_PDF_HOST = 'files.ezcount.co.il';

function buildQuery(supabase, { customerName, customerIdNumber, year }) {
  let query = supabase
    .from('issued_receipts')
    .select('receipt_number, institution_name, receipt_type, customer_name, amount, issue_date, pdf_url')
    .gte('issue_date', `${year}-01-01`)
    .lte('issue_date', `${year}-12-31`)
    .order('issue_date', { ascending: true });

  if (customerIdNumber) {
    query = query.eq('customer_id_number', customerIdNumber);
  } else {
    const orClause = ilikeOr(['customer_name'], customerName);
    query = orClause ? query.or(orClause) : query.eq('customer_name', '');
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
    const user = await requireUser(req, res, supabase);
    if (!user) return;

    const { customer_name, customer_id_number, year, format } = req.query;
    if (!customer_name && !customer_id_number) return res.status(400).json({ error: 'יש לציין שם תורם או מספר זהות' });
    if (!/^\d{4}$/.test(String(year || ''))) return res.status(400).json({ error: 'יש לציין שנה תקינה' });

    const { data, error } = await buildQuery(supabase, { customerName: customer_name, customerIdNumber: customer_id_number, year });
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
