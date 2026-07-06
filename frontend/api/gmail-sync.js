// Syncs payment-failure emails from Gmail into `payment_failures`, and sends a
// Telegram notification to the matching institution's "סירובים" channel
// (סומך נופלים / ישיבות — same two-channel split as successful transactions)
// for every newly-saved failure.
// Ported from backend/src/routes/gmailSync.js (an old Express route that was
// never carried over to the Vercel functions, leaving the "סנכרן" button in
// PaymentFailures.jsx pointing at a 404).
//
// Env vars required:
//   GMAIL_USER_SOM, GOOGLE_CLIENT_ID_SOM, GOOGLE_CLIENT_SECRET_SOM, GOOGLE_REDIRECT_URI_SOM, GOOGLE_REFRESH_TOKEN_SOM
//   (dedicated to the som.noflim@gmail.com mailbox/OAuth client — kept separate
//   from the older GOOGLE_*/GMAIL_USER vars, which belong to a different account)
//   TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_REFUSALS_SOMECH, TELEGRAM_CHAT_REFUSALS_YESHIVOT

import { getSupabase } from './_supabase.js';
import { requireUser } from './_auth.js';
import { sendTelegramMessage } from './_telegram.js';
import { refusalChatId } from './_transaction-notify.js';

async function getGmailAccessToken() {
  const { GOOGLE_CLIENT_ID_SOM, GOOGLE_CLIENT_SECRET_SOM, GOOGLE_REDIRECT_URI_SOM, GOOGLE_REFRESH_TOKEN_SOM } = process.env;
  if (!GOOGLE_CLIENT_ID_SOM || !GOOGLE_CLIENT_SECRET_SOM || !GOOGLE_REDIRECT_URI_SOM || !GOOGLE_REFRESH_TOKEN_SOM) {
    throw new Error('Missing Gmail/Google env vars (GOOGLE_CLIENT_ID_SOM/SECRET_SOM/REDIRECT_URI_SOM/REFRESH_TOKEN_SOM)');
  }
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID_SOM,
      client_secret: GOOGLE_CLIENT_SECRET_SOM,
      redirect_uri: GOOGLE_REDIRECT_URI_SOM,
      refresh_token: GOOGLE_REFRESH_TOKEN_SOM,
      grant_type: 'refresh_token',
    }),
  });
  const data = await res.json();
  if (!data.access_token) throw new Error(`Gmail auth error: ${JSON.stringify(data)}`);
  return data.access_token;
}

async function gmailFetch(path, token) {
  const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Gmail API error: ${data.error?.message || JSON.stringify(data)}`);
  return data;
}

function decodeBase64Url(data) {
  if (!data) return '';
  return Buffer.from(data.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
}

function htmlToText(html) {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(div|p)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

function extractPlainText(payload) {
  if (!payload) return '';
  if (payload.mimeType === 'text/plain' && payload.body?.data) return decodeBase64Url(payload.body.data);
  // Some failure emails (e.g. the som.noflim mailbox) have only a text/html
  // body, no text/plain alternative — strip tags down to plain text instead.
  if (payload.mimeType === 'text/html' && payload.body?.data) return htmlToText(decodeBase64Url(payload.body.data));
  if (payload.parts) {
    for (const part of payload.parts) {
      const result = extractPlainText(part);
      if (result) return result;
    }
  }
  return '';
}

function findHeader(headers, name) {
  return headers?.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value || '';
}

function extractField(text, label) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = text.match(new RegExp(`${escaped}:\\s*(.*)`));
  return match ? match[1].trim() : null;
}

function parseAmount(raw) {
  if (!raw) return null;
  const cleaned = raw.replace(/[^\d.]/g, '');
  return cleaned ? Number(cleaned) : null;
}

function extractInstitution(text) {
  // Two observed formats: "עבור: <מוסד>" (colon right after the label) and
  // "עבור <מוסד>:" (colon after the value instead — the som.noflim mailbox).
  let match = text.match(/עבור:\s*(.+)/);
  if (match) return match[1].trim();
  match = text.match(/עבור\s+(.+?):/);
  return match ? match[1].trim() : null;
}

function parseFailureEmail(message) {
  const headers = message.payload.headers || [];
  const text = extractPlainText(message.payload);
  const subject = findHeader(headers, 'subject');
  const institution = extractInstitution(text);
  // Some failure emails don't have a "תשלומים:" line — the kind (e.g. "הו"ק")
  // is in the subject instead, e.g. "שגיאה / סירוב הו"ק".
  const subjectKind = subject.replace(/^.*סירוב\s*/, '').trim() || null;

  return {
    gmail_message_id: message.id,
    external_ref: findHeader(headers, 'message-id') || extractField(text, 'מספר הוראה'),
    source: 'gmail_failure',
    institution_name: institution,
    order_number: extractField(text, 'מספר הוראה'),
    customer_id_number: extractField(text, 'מספר זהות'),
    customer_name: extractField(text, 'שם תורם') || extractField(text, 'שם לקוח'),
    address: extractField(text, 'כתובת'),
    donor_phone: extractField(text, 'טלפון'),
    donor_email: extractField(text, 'מייל'),
    amount: parseAmount(extractField(text, 'סכום')),
    payment_kind: extractField(text, 'תשלומים') || subjectKind,
    category: extractField(text, 'קטגוריה'),
    notes: extractField(text, 'הערות'),
    last4: extractField(text, '4 ספרות אחרונות'),
    card_expiry: extractField(text, 'תוקף'),
    error_reason: extractField(text, 'סיבת שגיאה'),
    terminal_location: extractField(text, 'מיקום מסוף'),
    email_subject: subject,
    email_body: text,
    raw_payload: message,
  };
}

function buildRefusalText(record) {
  const lines = [`⚠️ סירוב תשלום${record.institution_name ? ' ב' + record.institution_name : ''}`];
  lines.push(`שם: ${record.customer_name || '—'}`);
  lines.push(`סכום: ${record.amount ?? '—'}₪`);
  lines.push(`סיבה: ${record.error_reason || '—'}`);
  if (record.payment_kind) lines.push(`סוג: ${record.payment_kind}`);
  if (record.order_number) lines.push(`מספר הוראה: ${record.order_number}`);
  return lines.join('\n');
}

async function notifyRefusal(record) {
  const chatId = refusalChatId(record.institution_name);
  if (!chatId) return; // unrecognized institution, or not configured yet — skip rather than fail the sync
  try {
    await sendTelegramMessage(chatId, buildRefusalText(record));
  } catch (err) {
    console.error('gmail-sync telegram error:', err);
  }
}

export default async function handler(req, res) {
  // Manual "סנכרן" button in PaymentFailures.jsx calls this with POST.
  // Vercel Cron always calls scheduled paths with GET, authenticated via
  // an Authorization: Bearer <CRON_SECRET> header it adds automatically —
  // verify that for GET so this can't be triggered by anyone with the URL.
  if (req.method === 'GET') {
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret && req.headers.authorization !== `Bearer ${cronSecret}`) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  } else if (req.method === 'POST') {
    // Manual "סנכרן" button — must be a logged-in user, not an anonymous caller.
    const user = await requireUser(req, res, getSupabase());
    if (!user) return;
  } else {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const supabase = getSupabase();
    const token = await getGmailAccessToken();

    const list = await gmailFetch(
      `messages?q=${encodeURIComponent('subject:"שגיאה / סירוב" newer_than:30d')}&maxResults=20`,
      token
    );
    const messages = list.messages || [];

    let synced = 0;
    let failed = 0;

    for (const msg of messages) {
      try {
        const { data: existing } = await supabase
          .from('payment_failures')
          .select('id')
          .eq('gmail_message_id', msg.id)
          .maybeSingle();

        const full = await gmailFetch(`messages/${msg.id}?format=full`, token);
        const record = parseFailureEmail(full);

        const { error } = await supabase.from('payment_failures').upsert(record, { onConflict: 'gmail_message_id' });
        if (error) throw error;

        if (!existing) await notifyRefusal(record);
        synced++;
      } catch (err) {
        console.error(`gmail-sync message ${msg.id} error:`, err);
        failed++;
      }
    }

    return res.json({ synced, failed, total: messages.length });
  } catch (err) {
    console.error('gmail-sync handler error:', err);
    res.status(500).json({ error: err.message });
  }
}
