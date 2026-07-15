// Manual donor email — sends the user-edited subject/body (prefilled from the
// template client-side) to a single recipient via the som.noflim Gmail
// account, and records the send in email_log (trigger='manual', so the
// one-auto-email-per-transaction dedup index does not apply).
//
// Env vars required: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
//   GOOGLE_CLIENT_ID_SOM / GOOGLE_CLIENT_SECRET_SOM / GOOGLE_REDIRECT_URI_SOM /
//   GOOGLE_REFRESH_TOKEN_SOM (needs gmail.send scope)

import { getSupabase } from './_supabase.js';
import { requireUser, WRITE_ROLES } from './_auth.js';
import { sendGmail, bodyToHtml } from './_email.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const supabase = getSupabase();
  const user = await requireUser(req, res, supabase, { roles: WRITE_ROLES });
  if (!user) return;

  const { transactionId, to, subject, body } = req.body || {};
  const recipient = String(to || '').trim();
  if (!recipient.includes('@')) return res.status(400).json({ error: 'כתובת מייל לא תקינה' });
  if (!subject?.trim()) return res.status(400).json({ error: 'חסר נושא למייל' });
  if (!body?.trim()) return res.status(400).json({ error: 'חסר תוכן להודעה' });

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
    const sent = await sendGmail({ to: recipient, subject: subject.trim(), html: bodyToHtml(body) });
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
