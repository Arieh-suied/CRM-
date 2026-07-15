// Donor thank-you email sender, via the som.noflim@gmail.com Gmail account.
// Fills the editable template from email_templates (placeholders {שם} {סכום}
// {קרן} {תאריך}), builds an RFC-822 HTML message and sends it through the
// Gmail API. Used automatically by transaction-routed.js on every new
// transaction, and manually by send-email.js from the UI.
//
// Env vars required:
//   GOOGLE_CLIENT_ID_SOM, GOOGLE_CLIENT_SECRET_SOM, GOOGLE_REDIRECT_URI_SOM,
//   GOOGLE_REFRESH_TOKEN_SOM — must carry BOTH gmail.readonly and gmail.send
//   scopes (re-mint with backend/scripts/get-gmail-refresh-token-som.js)

import { getGmailAccessToken, gmailPost } from './_gmail.js';

const FROM_NAME = 'סומך נופלים';
const FROM_ADDRESS = 'som.noflim@gmail.com';
const VALID_CURRENCIES = new Set(['ILS', 'USD', 'EUR', 'GBP']);

// RFC 2047 encoded-word for non-ASCII header values (Subject/From). Each word
// is capped at 75 chars, so chunk the UTF-8 bytes — stepping back when a chunk
// boundary would split a multibyte character.
function encodeHeaderWord(text) {
  if (/^[\x20-\x7e]*$/.test(text)) return text;
  const bytes = Buffer.from(text, 'utf8');
  const CHUNK = 42; // 42 raw bytes → 56 base64 chars → whole word stays < 75
  const words = [];
  for (let i = 0; i < bytes.length; ) {
    let end = Math.min(i + CHUNK, bytes.length);
    while (end > i && end < bytes.length && (bytes[end] & 0xc0) === 0x80) end--;
    words.push(`=?UTF-8?B?${bytes.slice(i, end).toString('base64')}?=`);
    i = end;
  }
  return words.join('\r\n ');
}

export function formatAmount(amount, currency) {
  if (amount == null) return '';
  const code = VALID_CURRENCIES.has(currency) ? currency : 'ILS';
  return new Intl.NumberFormat('he-IL', {
    style: 'currency',
    currency: code,
    maximumFractionDigits: 2,
  }).format(amount);
}

// Fills {שם} {סכום} {קרן} {תאריך} from a transactions row. Output is plain
// text — callers must escape AFTER filling (donor-controlled client_name must
// never reach the HTML unescaped).
export function fillTemplate(text, tx, fundName) {
  const values = {
    'שם': tx.client_name || 'תורם יקר',
    'סכום': formatAmount(tx.amount, tx.currency),
    'קרן': fundName || tx.group_name || '',
    'תאריך': tx.transaction_time_raw || '',
  };
  return String(text || '').replace(/\{(שם|סכום|קרן|תאריך)\}/g, (_, key) => values[key]);
}

function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function bodyToHtml(filledText) {
  const escaped = escapeHtml(filledText).replace(/\r?\n/g, '<br>');
  return `<div dir="rtl" style="font-family:Arial,sans-serif;font-size:15px;line-height:1.6;color:#222">${escaped}</div>`;
}

export async function sendGmail({ to, subject, html }) {
  const token = await getGmailAccessToken();
  const mime = [
    `To: ${to}`,
    `From: ${encodeHeaderWord(FROM_NAME)} <${FROM_ADDRESS}>`,
    `Subject: ${encodeHeaderWord(subject)}`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    Buffer.from(html, 'utf8').toString('base64'),
  ].join('\r\n');
  const raw = Buffer.from(mime).toString('base64url');
  return gmailPost('messages/send', token, { raw }); // → { id, threadId }
}

async function lookupFundName(supabase, record) {
  if (record.group_name) return record.group_name;
  if (!record.mosad_number) return '';
  const { data } = await supabase
    .from('institutions')
    .select('mosad_name')
    .eq('mosad_number', record.mosad_number)
    .maybeSingle();
  return data?.mosad_name || '';
}

// Automatic thank-you email for a freshly inserted transaction. Dedup works by
// claiming a row in email_log BEFORE sending: the partial unique index
// uq_email_log_auto rejects a second claim for the same transaction (Supabase
// webhook deliveries can be retried by pg_net), so at most one auto email ever
// goes out per transaction. A failed send stays claimed on purpose — no
// auto-retry that could spam a donor; it's visible in the log and can be
// re-sent manually from the UI.
export async function sendDonorThanksIfEnabled(supabase, record) {
  const to = String(record.email || '').trim();
  if (!to.includes('@')) return { sent: false, reason: 'no email' };

  const { data: tpl, error: tplErr } = await supabase
    .from('email_templates')
    .select('subject, body, auto_send')
    .eq('id', 'donor_thanks')
    .maybeSingle();
  if (tplErr) throw tplErr;
  if (!tpl?.auto_send) return { sent: false, reason: 'auto_send disabled' };

  const dedupKey = record.external_transaction_id || String(record.id ?? '');
  if (!dedupKey) return { sent: false, reason: 'no dedup key' };

  const fundName = await lookupFundName(supabase, record).catch(() => '');
  const subject = fillTemplate(tpl.subject, record, fundName);
  const body = fillTemplate(tpl.body, record, fundName);

  const { data: claim, error: claimErr } = await supabase
    .from('email_log')
    .insert({
      dedup_key: dedupKey,
      transaction_id: String(record.id ?? ''),
      recipient: to,
      subject,
      body,
      trigger: 'auto',
      status: 'pending',
    })
    .select('id')
    .single();
  if (claimErr) {
    if (claimErr.code === '23505') return { sent: false, reason: 'already sent (dedup)' };
    throw claimErr;
  }

  try {
    const sent = await sendGmail({ to, subject, html: bodyToHtml(body) });
    await supabase.from('email_log')
      .update({ status: 'sent', gmail_message_id: sent.id })
      .eq('id', claim.id);
    return { sent: true, recipient: to, gmailMessageId: sent.id };
  } catch (err) {
    await supabase.from('email_log')
      .update({ status: 'failed', error: err.message })
      .eq('id', claim.id);
    return { sent: false, error: err.message };
  }
}
