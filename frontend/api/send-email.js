// Manual donor email — sends the user-edited subject/body (prefilled from the
// mosad template client-side; rich-text HTML or plain) to a single recipient
// via the som.noflim Gmail account, and records the send in email_log
// (trigger='manual', so the one-auto-email-per-transaction dedup index does
// not apply). The recipient may be a donor picked from the system or any
// free-typed address. Optional attachments: the transaction's EZCount receipt,
// the mosad template's stored file, and/or one ad-hoc uploaded file.
//
// Env vars required: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
//   GOOGLE_CLIENT_ID_SOM / GOOGLE_CLIENT_SECRET_SOM / GOOGLE_REDIRECT_URI_SOM /
//   GOOGLE_REFRESH_TOKEN_SOM (needs gmail.send scope)

import { getSupabase } from './_supabase.js';
import { requireUser, WRITE_ROLES } from './_auth.js';
import {
  sendGmail,
  bodyToHtml,
  fetchReceiptPdf,
  fetchTemplateAttachment,
  MAX_ATTACHMENT_BYTES,
} from './_email.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const supabase = getSupabase();
  const user = await requireUser(req, res, supabase, { roles: WRITE_ROLES });
  if (!user) return;

  const { transactionId, to, subject, body, attachReceipt, attachTemplateFile, mosadNumber, customFile } = req.body || {};
  const recipient = String(to || '').trim();
  if (!recipient.includes('@')) return res.status(400).json({ error: 'כתובת מייל לא תקינה' });
  if (!subject?.trim()) return res.status(400).json({ error: 'חסר נושא למייל' });
  if (!body?.trim()) return res.status(400).json({ error: 'חסר תוכן להודעה' });

  // Attachments were explicitly requested — unlike the auto path, fail loudly
  // instead of silently sending without them.
  const attachments = [];

  if (attachReceipt) {
    if (!transactionId) return res.status(400).json({ error: 'צירוף קבלה דורש עסקה מהמערכת' });
    const { data: tx, error: txErr } = await supabase
      .from('transactions')
      .select('receipt_data, receipt_doc_num')
      .eq('id', transactionId)
      .maybeSingle();
    if (txErr) return res.status(500).json({ error: txErr.message });
    if (!tx?.receipt_data) return res.status(400).json({ error: 'לעסקה הזו אין קבלה במערכת' });
    try {
      attachments.push(await fetchReceiptPdf(tx.receipt_data, tx.receipt_doc_num));
    } catch (err) {
      return res.status(502).json({ error: `משיכת הקבלה נכשלה: ${err.message}` });
    }
  }

  if (attachTemplateFile) {
    if (!mosadNumber) return res.status(400).json({ error: 'צירוף קובץ תבנית דורש מוסד' });
    const { data: tpl, error: tplErr } = await supabase
      .from('email_templates')
      .select('attachment_path, attachment_name, attachment_mime')
      .eq('mosad_number', String(mosadNumber))
      .maybeSingle();
    if (tplErr) return res.status(500).json({ error: tplErr.message });
    if (!tpl?.attachment_path) return res.status(400).json({ error: 'לתבנית של המוסד אין קובץ מצורף' });
    try {
      attachments.push(await fetchTemplateAttachment(supabase, tpl));
    } catch (err) {
      return res.status(502).json({ error: `משיכת קובץ התבנית נכשלה: ${err.message}` });
    }
  }

  if (customFile?.dataBase64) {
    const buffer = Buffer.from(customFile.dataBase64, 'base64');
    if (!buffer.length) return res.status(400).json({ error: 'הקובץ המצורף ריק' });
    if (buffer.length > MAX_ATTACHMENT_BYTES) {
      return res.status(400).json({ error: 'הקובץ המצורף גדול מדי (מקסימום 3.5MB)' });
    }
    attachments.push({
      filename: String(customFile.name || 'attachment').slice(0, 120),
      mimeType: customFile.mime || 'application/octet-stream',
      content: buffer,
    });
  }

  const { data: logRow, error: logErr } = await supabase
    .from('email_log')
    .insert({
      dedup_key: transactionId ? String(transactionId) : `manual-${Date.now()}`,
      transaction_id: transactionId ? String(transactionId) : null,
      recipient,
      subject: subject.trim(),
      body,
      trigger: 'manual',
      status: 'pending',
      sent_by: user.email,
    })
    .select('id')
    .single();
  if (logErr) return res.status(500).json({ error: logErr.message });

  try {
    const sent = await sendGmail({ to: recipient, subject: subject.trim(), html: bodyToHtml(body), attachments });
    await supabase.from('email_log')
      .update({ status: 'sent', gmail_message_id: sent.id })
      .eq('id', logRow.id);
    return res.json({ success: true, gmailMessageId: sent.id });
  } catch (err) {
    await supabase.from('email_log')
      .update({ status: 'failed', error: err.message })
      .eq('id', logRow.id);
    return res.status(500).json({ error: `שליחת המייל נכשלה: ${err.message}` });
  }
}
