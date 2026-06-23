// Grow webhook -> EZCount donation receipt for "סומך נופלים".
// Env vars required: EZCOUNT_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { getSupabase } from './_supabase.js';

const INSTITUTION_NAME = 'סומך נופלים';
const EZ_DOC_TYPE = 405; // קבלה לתרומה
const EZ_ITEM_DETAILS = 'תרומה';
const EZ_PAYMENT_TYPE_CREDIT_CARD = 3;

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

async function createEzcountReceipt(payload) {
  const apiKey = process.env.EZCOUNT_API_KEY;
  if (!apiKey) throw new Error('Missing env var: EZCOUNT_API_KEY');

  const ezPayload = {
    api_key: apiKey,
    type: EZ_DOC_TYPE,
    customer_name: payload.fullName || '',
    customer_phone: payload.payerPhone || '',
    customer_email: payload.payerEmail || '',
    forceItemsIntoNonItemsDocument: true,
    item: [{ details: EZ_ITEM_DETAILS, amount: '1', price: Number(payload.paymentSum) }],
    payment: [{ payment_type: EZ_PAYMENT_TYPE_CREDIT_CARD, payment_sum: Number(payload.paymentSum) }],
    comment: [payload.paymentDesc, payload.asmachta ? `אסמכתא: ${payload.asmachta}` : null]
      .filter(Boolean).join(' | '),
  };
  const issueDate = normalizeDate(payload.paymentDate);
  if (issueDate) ezPayload.date = issueDate;
  if (payload.invoiceLicenseNumber) ezPayload.customer_crn = payload.invoiceLicenseNumber;

  const ezRes = await fetch('https://api.ezcount.co.il/api/createDoc', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(ezPayload),
  });
  return ezRes.json();
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const {
    transactionCode, paymentSum, paymentType, paymentDate,
    asmachta, paymentDesc, fullName, payerPhone, payerEmail,
    cardSuffix, cardBrand, paymentSource,
  } = req.body || {};

  if (!transactionCode) {
    return res.status(400).json({ error: 'Missing transactionCode' });
  }

  const supabase = getSupabase();

  try {
    const { data: existing, error: fetchErr } = await supabase
      .from('grow_transactions')
      .select('id, status, ezcount_doc_number')
      .eq('transaction_code', String(transactionCode))
      .maybeSingle();
    if (fetchErr) throw fetchErr;

    if (existing && existing.ezcount_doc_number) {
      // Already processed — Grow retried the webhook, don't create a second receipt.
      return res.status(200).json({ success: true, duplicate: true, docNumber: existing.ezcount_doc_number });
    }

    let rowId = existing?.id;
    if (!rowId) {
      const { data: inserted, error: insertErr } = await supabase
        .from('grow_transactions')
        .insert({
          transaction_code: String(transactionCode),
          asmachta: asmachta || null,
          payment_sum: paymentSum != null ? Number(paymentSum) : null,
          payment_type: paymentType != null ? String(paymentType) : null,
          payment_date: paymentDate || null,
          full_name: fullName || null,
          payer_phone: payerPhone || null,
          payer_email: payerEmail || null,
          card_suffix: cardSuffix || null,
          card_brand: cardBrand || null,
          payment_source: paymentSource || null,
          institution_name: INSTITUTION_NAME,
          raw_payload: req.body,
          status: 'received',
        })
        .select('id')
        .single();
      if (insertErr) throw insertErr;
      rowId = inserted.id;
    }

    let ezData;
    try {
      ezData = await createEzcountReceipt({
        paymentSum, paymentDate, fullName, payerPhone, payerEmail, paymentDesc, asmachta,
        invoiceLicenseNumber: req.body?.invoiceLicenseNumber,
      });
    } catch (ezErr) {
      await supabase.from('grow_transactions').update({
        status: 'failed',
        ezcount_response: { error: ezErr.message },
        updated_at: new Date().toISOString(),
      }).eq('id', rowId);
      return res.status(500).json({ success: false, error: ezErr.message });
    }

    if (!ezData.success) {
      await supabase.from('grow_transactions').update({
        status: 'failed',
        ezcount_response: ezData,
        updated_at: new Date().toISOString(),
      }).eq('id', rowId);
      const msg = ezData.errMsg || ezData.error || 'שגיאה לא ידועה';
      return res.status(500).json({ success: false, error: `EZCount: ${msg}` });
    }

    const docNumber = ezData.doc_number;
    await supabase.from('grow_transactions').update({
      status: 'success',
      ezcount_doc_number: String(docNumber || ''),
      ezcount_response: ezData,
      updated_at: new Date().toISOString(),
    }).eq('id', rowId);

    return res.status(200).json({ success: true, docNumber, docUrl: ezData.pdf_link || ezData.doc_url || '' });

  } catch (err) {
    console.error('grow-webhook handler error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
}
