// Safety net for lost Nedarim Plus refusal-webhook callbacks.
//
// Nedarim calls nedarim-refusal-webhook.js after every declined transaction
// and failed הו"ק charge, with no retry on failure — when the call fails
// they only send a "תקלה בשליחת קאלבק סירוב" email (containing the failed
// row(s) as inline JSON; up to 50 rows batched into one email per
// institution) and the refusal never reaches the CRM. Confirmed missing
// 2026-09-13: a webhook call that took 10.7s and 500'd was never recorded.
//
// This cron scans the som.noflim mailbox for recent failure emails, pulls
// every JSON block out of each (an email can bundle multiple failed rows),
// and re-ingests any refusal not already in `payment_failures` — via the
// same ingestRefusal() the live webhook uses, not by re-POSTing over HTTP,
// so this doesn't depend on the webhook's own IP allowlist or availability.
//
// Dedup key: Nedarim's ErrorTime (a refusal never gets a TransactionId,
// unlike a successful transaction) — see refusalExists() in
// _refusal-ingest.js.
//
// Env vars required:
//   GOOGLE_CLIENT_ID_SOM, GOOGLE_CLIENT_SECRET_SOM, GOOGLE_REDIRECT_URI_SOM, GOOGLE_REFRESH_TOKEN_SOM
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
//   CRON_SECRET (for the scheduled GET invocation)

import { requireUser } from './_auth.js';
import { getSupabase } from './_supabase.js';
import { getGmailAccessToken, gmailFetch, extractPlainText } from './_gmail.js';
import { ingestRefusal, refusalExists } from './_refusal-ingest.js';
import { withErrorAlert } from './_error-alert.js';

// Failure emails place each failed row's JSON directly in the body (no
// "Json Data:" label like the transaction-callback failure email has), and
// one email can bundle up to 50 rows — so scan for every top-level {...}
// block rather than assuming a single payload. These objects are flat (no
// nested braces), so a simple first-'{' to next-'}' scan is safe.
function extractRefusalPayloads(text) {
  const payloads = [];
  let idx = 0;
  while (true) {
    const start = text.indexOf('{', idx);
    if (start === -1) break;
    const end = text.indexOf('}', start);
    if (end === -1) break;
    const raw = text
      .slice(start, end + 1)
      .replace(/[‎‏ ]/g, ' ') // RTL marks break JSON.parse
      .replace(/\r?\n/g, ' ');
    try {
      const obj = JSON.parse(raw);
      if (obj && obj.Status === 'Error') payloads.push(obj);
    } catch {
      // not a valid JSON object (or not one of ours) — skip
    }
    idx = end + 1;
  }
  return payloads;
}

async function handler(req, res) {
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

  const result = { emailsFound: 0, payloadsFound: 0, injected: [], existing: 0, unparsed: 0 };

  try {
    const token = await getGmailAccessToken();
    const list = await gmailFetch(
      `messages?q=${encodeURIComponent('subject:"תקלה בשליחת קאלבק סירוב" newer_than:3d')}&maxResults=20`,
      token
    );
    const messages = list.messages || [];
    result.emailsFound = messages.length;

    for (const msg of messages) {
      try {
        const full = await gmailFetch(`messages/${msg.id}?format=full`, token);
        const payloads = extractRefusalPayloads(extractPlainText(full.payload));
        if (!payloads.length) {
          result.unparsed++;
          console.error(`nedarim-refusal-recovery: no parseable payload in email ${msg.id}`);
          continue;
        }
        result.payloadsFound += payloads.length;

        for (const payload of payloads) {
          try {
            if (await refusalExists(payload.ErrorTime)) {
              result.existing++;
              continue;
            }
            const id = await ingestRefusal(payload);
            result.injected.push({ id, errorTime: payload.ErrorTime, mosad: payload.MosadNumber });
            console.log(`nedarim-refusal-recovery: re-injected lost refusal ${payload.ErrorTime} (mosad ${payload.MosadNumber})`);
          } catch (err) {
            console.error(`nedarim-refusal-recovery payload (${payload.ErrorTime}) error:`, err);
          }
        }
      } catch (err) {
        result.unparsed++;
        console.error(`nedarim-refusal-recovery email ${msg.id} error:`, err);
      }
    }

    return res.json(result);
  } catch (err) {
    console.error('nedarim-refusal-recovery handler error:', err);
    return res.status(500).json({ error: err.message, ...result });
  }
}

export default withErrorAlert(handler, 'nedarim-refusal-recovery');
