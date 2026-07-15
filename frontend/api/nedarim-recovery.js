// Safety net for lost Nedarim Plus transaction callbacks.
//
// Nedarim calls the nedarim-webhook Supabase Edge Function after every charge
// with a very short timeout and no retry — when the call fails they only send
// a "CallBack failed" email (containing the full transaction JSON) and the
// transaction never reaches the CRM. Observed 2026-07-15: a 5am charge was
// lost to a cold-start timeout.
//
// This cron does two things every run:
//   1. Pings the edge function (GET) to keep it warm between charges.
//   2. Scans the som.noflim mailbox for recent callback-failure emails,
//      extracts the JSON payload, and re-posts any transaction that is still
//      missing from the `transactions` table to the webhook. The webhook
//      upserts by external_transaction_id, so re-injection is idempotent, and
//      the insert fires the usual Database Webhook routing (Telegram/Sheets).
//
// No dedup table: an email whose transaction already exists is simply skipped
// on the next run, and the webhook writes in the background, so a just-injected
// transaction may be counted as injected once more before it lands — harmless.
//
// Env vars required:
//   GOOGLE_CLIENT_ID_SOM, GOOGLE_CLIENT_SECRET_SOM, GOOGLE_REDIRECT_URI_SOM, GOOGLE_REFRESH_TOKEN_SOM
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
//   CRON_SECRET (for the scheduled GET invocation)

import { getSupabase } from './_supabase.js';
import { requireUser } from './_auth.js';
import { getGmailAccessToken, gmailFetch, extractPlainText } from './_gmail.js';

const WEBHOOK_URL = 'https://qpzrwnukasfftcybznjv.supabase.co/functions/v1/nedarim-webhook';

// The failure email body: "CallBack URL: ...\nJson Data:\n{...}\nError: ..."
function extractPayload(text) {
  const afterLabel = text.slice(text.indexOf('Json Data'));
  const start = afterLabel.indexOf('{');
  const end = afterLabel.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  // htmlToText leaves &quot;-style entities decoded, but Nedarim double-encodes
  // some fields (&amp;quot;) — leave those as-is, they're inside string values.
  const raw = afterLabel
    .slice(start, end + 1)
    .replace(/[‎‏ ]/g, ' ') // RTL marks / nbsp break JSON.parse
    .replace(/\r?\n/g, ' ');
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export default async function handler(req, res) {
  // GET → Vercel Cron (authenticated via Authorization: Bearer <CRON_SECRET>).
  // POST → manual trigger, must be a logged-in user.
  if (req.method === 'GET') {
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret && req.headers.authorization !== `Bearer ${cronSecret}`) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  } else if (req.method === 'POST') {
    const user = await requireUser(req, res, getSupabase());
    if (!user) return;
  } else {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const result = { warmPing: false, emailsFound: 0, injected: [], existing: 0, unparsed: 0 };

  try {
    // 1. Keep the edge function warm.
    try {
      const ping = await fetch(WEBHOOK_URL);
      result.warmPing = ping.ok;
    } catch (err) {
      console.error('nedarim-recovery warm ping failed:', err);
    }

    // 2. Recover transactions from callback-failure emails.
    const supabase = getSupabase();
    const token = await getGmailAccessToken();
    const list = await gmailFetch(
      `messages?q=${encodeURIComponent('"CallBack URL" "Json Data" newer_than:3d')}&maxResults=20`,
      token
    );
    const messages = list.messages || [];
    result.emailsFound = messages.length;

    for (const msg of messages) {
      try {
        const full = await gmailFetch(`messages/${msg.id}?format=full`, token);
        const payload = extractPayload(extractPlainText(full.payload));
        if (!payload?.TransactionId) {
          result.unparsed++;
          console.error(`nedarim-recovery: could not parse payload from email ${msg.id}`);
          continue;
        }

        const { data: existing, error } = await supabase
          .from('transactions')
          .select('id')
          .eq('external_transaction_id', payload.TransactionId)
          .limit(1);
        if (error) throw error;
        if (existing?.length) {
          result.existing++;
          continue;
        }

        const resp = await fetch(WEBHOOK_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!resp.ok) throw new Error(`webhook responded ${resp.status}`);
        result.injected.push(payload.TransactionId);
        console.log(`nedarim-recovery: re-injected lost transaction ${payload.TransactionId}`);
      } catch (err) {
        result.unparsed++;
        console.error(`nedarim-recovery email ${msg.id} error:`, err);
      }
    }

    return res.json(result);
  } catch (err) {
    console.error('nedarim-recovery handler error:', err);
    return res.status(500).json({ error: err.message, ...result });
  }
}
