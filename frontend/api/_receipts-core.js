// Direct EZCount API integration — no Lovable dependency
// Env vars required: EZCOUNT_API_KEY, EZCOUNT_API_KEY_OR_EFRAIM, EZCOUNT_API_KEY_CHACHMEI
//
// docType 405 = קבלה על תרומה (donation receipt). docType 400 = קבלה רגילה —
// used both for the שכ"ל (tuition) branches and for the plain "קבלה רגיל"
// branches added for institutions that need a non-donation receipt option
// (confirmed with the user: 400 is EZCount's plain-receipt type, not tied to
// tuition specifically — `receiptTypeLabel` records what each branch's 400
// actually represents so issued_receipts.receipt_type reads correctly for both).

import { getSupabase } from './_supabase.js';

export const BRANCH_CONFIG = {
  'סומך נופלים':             { envKey: 'EZCOUNT_API_KEY',           docType: 405, itemDetails: 'תרומה',      mosadNumber: '7001671', receiptTypeLabel: 'קבלה על תרומה' },
  'אור אפרים':               { envKey: 'EZCOUNT_API_KEY_OR_EFRAIM', docType: 405, itemDetails: 'תרומה',      mosadNumber: '7001725', receiptTypeLabel: 'קבלה על תרומה' },
  'אור אפרים שכ"ל':         { envKey: 'EZCOUNT_API_KEY_OR_EFRAIM', docType: 400, itemDetails: 'שכר לימוד', mosadNumber: '7003860', receiptTypeLabel: 'חשבונית מס קבלה' },
  'אור אפרים קבלה רגיל':    { envKey: 'EZCOUNT_API_KEY_OR_EFRAIM', docType: 400, itemDetails: 'תרומה',      mosadNumber: '7001725', receiptTypeLabel: 'קבלה רגילה' },
  'חכמי ירושלים':            { envKey: 'EZCOUNT_API_KEY_CHACHMEI',  docType: 405, itemDetails: 'תרומה',      mosadNumber: '7001916', receiptTypeLabel: 'קבלה על תרומה' },
  'חכמי ירושלים שכ"ל':      { envKey: 'EZCOUNT_API_KEY_CHACHMEI',  docType: 400, itemDetails: 'שכר לימוד', mosadNumber: '7003862', receiptTypeLabel: 'חשבונית מס קבלה' },
  'חכמי ירושלים קבלה רגיל': { envKey: 'EZCOUNT_API_KEY_CHACHMEI',  docType: 400, itemDetails: 'תרומה',      mosadNumber: '7001916', receiptTypeLabel: 'קבלה רגילה' },
};

export function branchByMosadNumber(mosadNumber) {
  const entry = Object.entries(BRANCH_CONFIG).find(([, c]) => c.mosadNumber === String(mosadNumber));
  return entry ? entry[0] : null;
}

function normalizeDate(d) {
  if (!d) return undefined;
  const s = String(d).trim();
  if (!s) return undefined;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  if (/^\d{2}\/\d{2}\/(\d{2}|\d{4})$/.test(s)) return s;
  const m = s.match(/^(\d{1,2})[.\-\/](\d{1,2})[.\-\/](\d{2}|\d{4})$/);
  if (m) return `${m[1].padStart(2, '0')}/${m[2].padStart(2, '0')}/${m[3]}`;
  return s;
}

function toIso(raw) {
  if (!raw) return null;
  const n = normalizeDate(raw);
  if (!n) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(n)) return n;
  const m = n.match(/^(\d{2})\/(\d{2})\/(\d{2}|\d{4})$/);
  if (m) {
    const yyyy = m[3].length === 2 ? `20${m[3]}` : m[3];
    return `${yyyy}-${m[2]}-${m[1]}`;
  }
  return null;
}

function buildPayment(pm, sum, bankName, bankBranch, bankAccount, checkNumber, transferDate) {
  const p = { payment_type: pm, payment_sum: sum };
  const td = normalizeDate(transferDate);
  if (pm === 2) {
    if (bankName)    p.checks_bank_name    = bankName;
    if (bankBranch)  p.checks_bank_branch  = bankBranch;
    if (bankAccount) p.checks_bank_account = bankAccount;
    if (checkNumber) p.checks_number       = checkNumber;
    if (td)          p.date                = td;
  } else if (pm === 4) {
    if (bankName)    p.bt_bank_name    = bankName;
    if (bankBranch)  p.bt_bank_branch  = bankBranch;
    if (bankAccount) p.bt_bank_account = bankAccount;
    if (td)          p.date            = td;
  }
  return p;
}

// payload mirrors the /api/receipts POST body shape
export async function issueReceipt(payload) {
  const {
    customerName, customerId, customerPhone, customerEmail, customerAddress,
    amount, branch,
    payments: paymentEntries,
    paymentMethod, bankName, bankBranch, bankAccount, checkNumber, transferDate,
    notes,
  } = payload;

  if (!customerName || typeof customerName !== 'string' || customerName.trim().length < 2) {
    return { success: false, error: 'שם לקוח לא תקין', status: 400 };
  }
  if (!amount || typeof amount !== 'number' || amount <= 0) {
    return { success: false, error: 'סכום לא תקין', status: 400 };
  }

  const config = BRANCH_CONFIG[branch];
  if (!config) return { success: false, error: 'מוסד לא תקין', status: 400 };

  const apiKey = process.env[config.envKey];
  if (!apiKey) {
    console.error(`Missing env var: ${config.envKey}`);
    return { success: false, error: `מפתח API חסר עבור ${branch} — הגדר ${config.envKey} ב-Vercel`, status: 503 };
  }

  let paymentArray;
  let firstTransferDate;
  if (Array.isArray(paymentEntries) && paymentEntries.length > 0) {
    paymentArray = paymentEntries.map((pe) => {
      if (pe.transferDate && !firstTransferDate) firstTransferDate = pe.transferDate;
      return buildPayment(pe.paymentMethod, pe.amount, pe.bankName, pe.bankBranch, pe.bankAccount, pe.checkNumber, pe.transferDate);
    });
  } else {
    if (transferDate) firstTransferDate = transferDate;
    paymentArray = [buildPayment(paymentMethod, amount, bankName, bankBranch, bankAccount, checkNumber, transferDate)];
  }

  const ezPayload = {
    api_key: apiKey,
    type: config.docType,
    customer_name: customerName.trim(),
    customer_phone: customerPhone || '',
    customer_email: customerEmail || '',
    customer_address: customerAddress || '',
    forceItemsIntoNonItemsDocument: true,
    item: [{ details: config.itemDetails, amount: '1', price: amount }],
    payment: paymentArray,
    comment: notes || '',
  };
  if (customerId) ezPayload.customer_crn = customerId;
  if (firstTransferDate) ezPayload.date = normalizeDate(firstTransferDate);

  const ezRes = await fetch('https://api.ezcount.co.il/api/createDoc', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(ezPayload),
  });

  const ezData = await ezRes.json();
  if (!ezData.success) {
    const msg = ezData.errMsg || ezData.error || 'שגיאה לא ידועה';
    return { success: false, error: `EZCount: ${msg}`, status: 400 };
  }

  const docNumber = ezData.doc_number;
  const docUrl    = ezData.pdf_link || ezData.doc_url || '';
  const receiptId = docUrl ? (docUrl.split('/').pop() || String(docNumber)) : String(docNumber);

  try {
    const supabase = getSupabase();
    const firstPayment    = Array.isArray(paymentEntries) && paymentEntries.length > 0 ? paymentEntries[0] : null;
    const saveBankName    = firstPayment?.bankName    || bankName    || null;
    const saveBankBranch  = firstPayment?.bankBranch  || bankBranch  || null;
    const saveBankAccount = firstPayment?.bankAccount || bankAccount || null;
    const rawDate         = firstTransferDate || null;
    const issueDateIso    = toIso(rawDate);

    const mosadNumber = config.mosadNumber ?? null;

    const { error: btErr } = await supabase.from('bank_transfers').insert({
      customer_name:       customerName.trim(),
      customer_email:      customerEmail || null,
      customer_id_number:  customerId    || null,
      transfer_amount:     amount,
      currency:            'ILS',
      bank_name:           saveBankName,
      bank_branch:         saveBankBranch,
      bank_account:        saveBankAccount,
      document_number:     String(docNumber || ''),
      document_date:       issueDateIso,
      document_date_raw:   rawDate,
      document_note:       notes || null,
      receipt_id:          receiptId,
      mosad_number:        mosadNumber,
    });
    if (btErr) console.error('bank_transfers insert error:', btErr.message);

    const { error: irErr } = await supabase.from('issued_receipts').upsert({
      external_receipt_id: `ezcount-${branch}-${docNumber}`,
      receipt_number:      String(docNumber || ''),
      institution_name:    branch,
      receipt_type:        config.receiptTypeLabel || (config.docType === 400 ? 'חשבונית מס קבלה' : 'קבלה לתרומה'),
      customer_name:       customerName.trim(),
      customer_id_number:  customerId || null,
      customer_email:      customerEmail || null,
      amount,
      issue_date:          issueDateIso,
      issue_date_raw:      rawDate,
      bank_number:         saveBankName,
      branch_number:       saveBankBranch,
      account_number:      saveBankAccount,
      notes:               notes || null,
      status:              'issued',
      pdf_url:             docUrl || null,
      raw_payload:         payload,
      updated_at:          new Date().toISOString(),
    }, { onConflict: 'external_receipt_id' });
    if (irErr) console.error('issued_receipts upsert error:', irErr.message);

    const customerData = { name: customerName.trim() };
    if (customerId)      customerData.id_number    = customerId;
    if (customerPhone)   customerData.phone        = customerPhone;
    if (customerEmail)   customerData.email        = customerEmail;
    if (saveBankName)    customerData.bank_name    = saveBankName;
    if (saveBankBranch)  customerData.bank_branch  = saveBankBranch;
    if (saveBankAccount) customerData.bank_account = saveBankAccount;
    await supabase.from('customers').upsert(customerData, { onConflict: 'name' });

  } catch (dbErr) {
    console.error('DB persist error:', dbErr);
  }

  return { success: true, docNumber, docUrl, receiptId, status: 200 };
}
