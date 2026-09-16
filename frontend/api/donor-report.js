import { PDFDocument } from 'pdf-lib';
import { getSupabase, ilikeOr } from './_supabase.js';
import { requireUser, INSTITUTION_READ_ROLES } from './_auth.js';
import { resolveInstitutionNames } from './_scope.js';

import { withErrorAlert } from './_error-alert.js';

const ALLOWED_PDF_HOST = 'files.ezcount.co.il';

// Nedarim auto-issues a real EZCount receipt for most standing-order/one-off
// transactions and stores the reference (receipt_data = EZCount doc id,
// receipt_doc_num = human doc number) directly on the transaction row — this
// happens entirely outside _receipts-core.js's own issueReceipt() flow, so
// those receipts never make it into issued_receipts. A donor report built
// only from issued_receipts misses the large majority of real receipts
// (~93% of all transactions carry a non-empty receipt_data).
function ezcountUrlFromReceiptData(receiptData) {
  return `https://files.ezcount.co.il/front/documents/get/${receiptData}`;
}

// Opt-in per institution user (like 'bank-refusals'/'keva') — this report
// isn't granted blanket to every institution-role account, only ones an
// admin explicitly scoped to a fund/category for it.
const INSTITUTION_TAB = 'donor-report';

async function fetchIssuedReceipts(supabase, { customerName, customerIdNumber, year, user }) {
  let query = supabase
    .from('issued_receipts')
    .select('receipt_number, institution_name, receipt_type, category, customer_name, amount, issue_date, pdf_url');

  query = query.gte('issue_date', `${year}-01-01`).lte('issue_date', `${year}-12-31`);

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

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({
    receipt_number: r.receipt_number,
    institution_name: r.institution_name,
    category: r.category,
    receipt_type: r.receipt_type,
    customer_name: r.customer_name,
    amount: Number(r.amount) || 0,
    issue_date: r.issue_date,
    pdf_url: r.pdf_url,
  }));
}

// Nedarim's own auto-issued receipts, tracked on the transaction row itself
// (see the comment above ezcountUrlFromReceiptData) rather than in
// issued_receipts — the far larger and more complete source of a donor's
// actual receipts.
async function fetchTransactionReceipts(supabase, { customerName, customerIdNumber, year, user }) {
  if (user.role === 'institution' && !user.allowedMosadim?.length) return [];

  let query = supabase
    .from('transactions_with_parsed_time')
    .select('client_name, zeout, mosad_number, group_name, amount, receipt_data, receipt_doc_num, transaction_time_parsed')
    .not('receipt_data', 'is', null)
    .neq('receipt_data', '')
    .gte('transaction_time_parsed', `${year}-01-01`)
    .lt('transaction_time_parsed', `${Number(year) + 1}-01-01`);

  if (customerIdNumber) {
    query = query.eq('zeout', customerIdNumber);
  } else {
    const orClause = ilikeOr(['client_name'], customerName);
    query = orClause ? query.or(orClause) : query.eq('client_name', '');
  }

  if (user.role === 'institution') query = query.in('mosad_number', user.allowedMosadim);

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  let rows = data ?? [];

  // group_name has occasional stray whitespace in the source data — trim
  // before comparing so an institution's allowed_group_names still matches.
  rows = rows.map((r) => ({ ...r, group_name: (r.group_name || '').trim() || null }));
  if (user.role === 'institution' && user.allowedGroupNames?.length) {
    rows = rows.filter((r) => user.allowedGroupNames.includes(r.group_name));
  }

  const mosadNumbers = [...new Set(rows.map((r) => r.mosad_number).filter(Boolean))];
  let nameByMosad = {};
  if (mosadNumbers.length) {
    const { data: institutions } = await supabase.from('institutions').select('mosad_number, mosad_name').in('mosad_number', mosadNumbers);
    nameByMosad = Object.fromEntries((institutions ?? []).map((i) => [i.mosad_number, i.mosad_name]));
  }

  return rows.map((r) => ({
    receipt_number: r.receipt_doc_num,
    institution_name: nameByMosad[r.mosad_number] || r.mosad_number,
    category: r.group_name,
    receipt_type: 'קבלה (הוראת קבע)',
    customer_name: r.client_name,
    amount: Number(r.amount) || 0,
    issue_date: r.transaction_time_parsed ? String(r.transaction_time_parsed).slice(0, 10) : null,
    pdf_url: ezcountUrlFromReceiptData(r.receipt_data),
  }));
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

    const params = { customerName: customer_name, customerIdNumber: customer_id_number, year, user };
    const [issued, fromTransactions] = await Promise.all([
      fetchIssuedReceipts(supabase, params),
      fetchTransactionReceipts(supabase, params),
    ]);

    // Dedupe on pdf_url — the rare case where the same EZCount document ended
    // up referenced from both a manually-issued row and its source transaction.
    const seen = new Set();
    const receipts = [...issued, ...fromTransactions]
      .filter((r) => {
        if (!r.pdf_url) return true;
        if (seen.has(r.pdf_url)) return false;
        seen.add(r.pdf_url);
        return true;
      })
      .sort((a, b) => (a.issue_date || '').localeCompare(b.issue_date || ''));

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
