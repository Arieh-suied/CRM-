// Donor thank-you email sender, via the som.noflim@gmail.com Gmail account.
// Fills the editable per-mosad template from email_templates (placeholders
// {שם} {סכום} {קרן} {תאריך}), builds an RFC-822 HTML message (rich-text HTML
// bodies from the CRM editor, or legacy plain text) with any number of
// attachments (template file from Storage, EZCount receipt PDF, ad-hoc file)
// and sends it through the Gmail API. Used automatically by
// transaction-routed.js on every new transaction, and manually by
// send-email.js from the UI.
//
// Env vars required:
//   GOOGLE_CLIENT_ID_SOM, GOOGLE_CLIENT_SECRET_SOM, GOOGLE_REDIRECT_URI_SOM,
//   GOOGLE_REFRESH_TOKEN_SOM — must carry BOTH gmail.readonly and gmail.send
//   scopes (re-mint with backend/scripts/get-gmail-refresh-token-som.js)

import { getGmailAccessToken, gmailPost } from './_gmail.js';

const FROM_NAME = 'סומך נופלים';
const FROM_ADDRESS = 'som.noflim@gmail.com';
const VALID_CURRENCIES = new Set(['ILS', 'USD', 'EUR', 'GBP']);
const PLACEHOLDER_RE = /\{(שם|סכום|קרן|תאריך)\}/g;

export const ATTACHMENTS_BUCKET = 'email-attachments';
export const MAX_ATTACHMENT_BYTES = 3.5 * 1024 * 1024;  // per file
const MAX_TOTAL_ATTACHMENT_BYTES = 4 * 1024 * 1024;     // Gmail JSON send caps raw at ~5MB

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

function templateValues(tx, fundName) {
  return {
    'שם': tx.client_name || 'תורם יקר',
    'סכום': formatAmount(tx.amount, tx.currency),
    'קרן': fundName || tx.group_name || '',
    'תאריך': tx.transaction_time_raw || '',
  };
}

// Plain-text placeholder fill (subjects, legacy plain bodies). Output is plain
// text — callers must escape AFTER filling.
export function fillTemplate(text, tx, fundName) {
  const values = templateValues(tx, fundName);
  return String(text || '').replace(PLACEHOLDER_RE, (_, key) => values[key]);
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Rich-text bodies from the CRM editor are HTML; templates saved before the
// editor existed are plain text.
export function isHtmlBody(text) {
  return /<[a-z][^>]*>/i.test(String(text || ''));
}

function wrapRtl(html) {
  return `<div dir="rtl" style="font-family:Arial,sans-serif;font-size:15px;line-height:1.6;color:#222">${html}</div>`;
}

// Final email HTML for a body that has already had its placeholders filled
// (manual sends — the client fills before the user edits).
export function bodyToHtml(body) {
  if (isHtmlBody(body)) return wrapRtl(body);
  return wrapRtl(escapeHtml(body).replace(/\r?\n/g, '<br>'));
}

// Final email HTML for a raw template body + transaction (auto path). In HTML
// bodies the placeholder VALUES are escaped before substitution — the template
// itself is trusted (written by admin/editor), donor-controlled fields are not.
export function renderBody(body, tx, fundName) {
  const values = templateValues(tx, fundName);
  if (isHtmlBody(body)) {
    return wrapRtl(String(body).replace(PLACEHOLDER_RE, (_, key) => escapeHtml(values[key])));
  }
  const filled = String(body || '').replace(PLACEHOLDER_RE, (_, key) => values[key]);
  return wrapRtl(escapeHtml(filled).replace(/\r?\n/g, '<br>'));
}

// RFC 2045 caps base64 lines at 76 chars.
function b64lines(buffer) {
  return Buffer.from(buffer).toString('base64').replace(/(.{76})/g, '$1\r\n');
}

// The EZCount receipt PDF for a transaction's receipt_data id (same source as
// receipt-proxy.js). Returns a sendGmail attachment, throws on failure.
export async function fetchReceiptPdf(receiptData, docNum) {
  const res = await fetch(`https://files.ezcount.co.il/front/documents/get/${receiptData}`);
  if (!res.ok) throw new Error(`EZCount receipt fetch failed (${res.status})`);
  const buffer = Buffer.from(await res.arrayBuffer());
  if (!buffer.length) throw new Error('EZCount returned an empty receipt');
  if (buffer.length > MAX_ATTACHMENT_BYTES) throw new Error('Receipt PDF too large to attach');
  const safeDocNum = String(docNum || '').replace(/[^\w-]/g, '');
  return {
    filename: safeDocNum ? `receipt-${safeDocNum}.pdf` : 'receipt.pdf',
    mimeType: res.headers.get('content-type')?.split(';')[0] || 'application/pdf',
    content: buffer,
  };
}

// The template's stored file from the email-attachments Storage bucket.
// Returns null when the template has none, throws on download failure.
export async function fetchTemplateAttachment(supabase, tpl) {
  if (!tpl?.attachment_path) return null;
  const { data, error } = await supabase.storage
    .from(ATTACHMENTS_BUCKET)
    .download(tpl.attachment_path);
  if (error) throw new Error(`Storage download failed: ${error.message}`);
  const buffer = Buffer.from(await data.arrayBuffer());
  return {
    filename: tpl.attachment_name || 'attachment',
    mimeType: tpl.attachment_mime || 'application/octet-stream',
    content: buffer,
  };
}

export async function sendGmail({ to, subject, html, attachments = [] }) {
  const files = attachments.filter(Boolean);
  const total = files.reduce((sum, a) => sum + a.content.length, 0);
  if (total > MAX_TOTAL_ATTACHMENT_BYTES) {
    throw new Error('סך הקבצים המצורפים חורג מהמגבלה (4MB)');
  }

  const token = await getGmailAccessToken();
  const headers = [
    `To: ${to}`,
    `From: ${encodeHeaderWord(FROM_NAME)} <${FROM_ADDRESS}>`,
    `Subject: ${encodeHeaderWord(subject)}`,
    'MIME-Version: 1.0',
  ];
  const htmlPart = [
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    b64lines(Buffer.from(html, 'utf8')),
  ].join('\r\n');

  let mime;
  if (files.length) {
    const boundary = `----=_donorshub_${Date.now().toString(36)}`;
    const parts = [`--${boundary}`, htmlPart];
    for (const file of files) {
      // RFC 2231 for non-ASCII filenames; plain name kept as a fallback.
      const asciiName = file.filename.replace(/[^\x20-\x7e]/g, '_').replace(/"/g, "'");
      const encodedName = encodeURIComponent(file.filename);
      parts.push(
        `--${boundary}`,
        `Content-Type: ${file.mimeType}; name="${asciiName}"`,
        `Content-Disposition: attachment; filename="${asciiName}"; filename*=UTF-8''${encodedName}`,
        'Content-Transfer-Encoding: base64',
        '',
        b64lines(file.content),
      );
    }
    parts.push(`--${boundary}--`);
    mime = [
      ...headers,
      `Content-Type: multipart/mixed; boundary="${boundary}"`,
      '',
      ...parts,
    ].join('\r\n');
  } else {
    mime = [...headers, htmlPart].join('\r\n');
  }

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

// Automatic thank-you email for a freshly inserted transaction. Templates are
// per institution: only a transaction whose mosad_number has a template with
// auto_send=true triggers an email. Dedup works by claiming a row in email_log
// BEFORE sending: the partial unique index uq_email_log_auto rejects a second
// claim for the same transaction (Supabase webhook deliveries can be retried
// by pg_net), so at most one auto email ever goes out per transaction. A
// failed send stays claimed on purpose — no auto-retry that could spam a
// donor; it's visible in the log and can be re-sent manually from the UI.
export async function sendDonorThanksIfEnabled(supabase, record) {
  const to = String(record.email || '').trim();
  if (!to.includes('@')) return { sent: false, reason: 'no email' };

  const mosad = record.mosad_number ? String(record.mosad_number) : '';
  if (!mosad) return { sent: false, reason: 'no mosad_number' };

  const { data: tpl, error: tplErr } = await supabase
    .from('email_templates')
    .select('subject, body, auto_send, attach_receipt, attachment_path, attachment_name, attachment_mime')
    .eq('mosad_number', mosad)
    .maybeSingle();
  if (tplErr) throw tplErr;
  if (!tpl) return { sent: false, reason: 'no template for mosad' };
  if (!tpl.auto_send) return { sent: false, reason: 'auto_send disabled for mosad' };

  const dedupKey = record.external_transaction_id || String(record.id ?? '');
  if (!dedupKey) return { sent: false, reason: 'no dedup key' };

  const fundName = await lookupFundName(supabase, record).catch(() => '');
  const subject = fillTemplate(tpl.subject, record, fundName);
  const html = renderBody(tpl.body, record, fundName);

  const { data: claim, error: claimErr } = await supabase
    .from('email_log')
    .insert({
      dedup_key: dedupKey,
      transaction_id: String(record.id ?? ''),
      recipient: to,
      subject,
      body: tpl.body,
      trigger: 'auto',
      status: 'pending',
    })
    .select('id')
    .single();
  if (claimErr) {
    if (claimErr.code === '23505') return { sent: false, reason: 'already sent (dedup)' };
    throw claimErr;
  }

  // Attachments are best-effort on the auto path: a missing/failed file must
  // not cost the donor their thank-you email.
  const attachments = [];
  const attachErrors = [];
  if (tpl.attach_receipt && record.receipt_data) {
    try {
      attachments.push(await fetchReceiptPdf(record.receipt_data, record.receipt_doc_num));
    } catch (err) {
      attachErrors.push(`receipt: ${err.message}`);
      console.error(`auto-email receipt attach failed (tx ${dedupKey}):`, err);
    }
  }
  if (tpl.attachment_path) {
    try {
      attachments.push(await fetchTemplateAttachment(supabase, tpl));
    } catch (err) {
      attachErrors.push(`template file: ${err.message}`);
      console.error(`auto-email template attach failed (tx ${dedupKey}):`, err);
    }
  }

  try {
    const sent = await sendGmail({ to, subject, html, attachments });
    await supabase.from('email_log')
      .update({
        status: 'sent',
        gmail_message_id: sent.id,
        error: attachErrors.length ? `sent without: ${attachErrors.join('; ')}` : null,
      })
      .eq('id', claim.id);
    return { sent: true, recipient: to, gmailMessageId: sent.id, attachments: attachments.length, attachErrors };
  } catch (err) {
    await supabase.from('email_log')
      .update({ status: 'failed', error: err.message })
      .eq('id', claim.id);
    return { sent: false, error: err.message };
  }
}
