// Receives Nedarim Plus's native "עדכוני סירובים" (refusal updates) webhook —
// a separate Callback URL from the transaction webhook, configured by Nedarim
// support per institution (מסך עוד > Webhook, in their dashboard, not ours).
// Fires on every declined/failed transaction AND every failed הו"ק (standing
// order) charge attempt, including the robot's repeat monthly retries.
// Replaces/complements the Gmail-scraping sync (gmail-sync.js) for the same
// data, but delivered in real time instead of parsed out of an alert email.
// nedarim-refusal-recovery.js is this webhook's safety net, for when a call
// like this one fails (Nedarim has no retry) — it re-injects from the
// "תקלה בשליחת קאלבק" failure email Nedarim sends when that happens.
//
// No shared secret is supported by Nedarim for this webhook — the only
// verification they offer is a fixed sender-IP allowlist (their own
// recommendation), enforced below.
// 3.93.16.70 added 2026-09-11, also confirmed directly by Nedarim.
//
// Env vars: none new — reuses SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY,
// TELEGRAM_BOT_TOKEN, and the existing TELEGRAM_CHAT_REFUSALS_* /
// TELEGRAM_CHAT_BNOT_CHAYIL vars via refusalChatId() (see _refusal-ingest.js).

import { sendTelegramMessage } from './_telegram.js';
import { ingestRefusal } from './_refusal-ingest.js';
import { withErrorAlert } from './_error-alert.js';

const ALLOWED_IPS = ['18.196.146.117', '18.194.219.73', '3.93.16.70'];

function clientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  if (!fwd) return req.socket?.remoteAddress || null;
  return String(fwd).split(',')[0].trim();
}

async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // IP allowlist temporarily set to log-only (not blocking) as of 2026-09-11
  // after the nedarim-webhook JWT deploy incident spooked confidence in this
  // check — re-enable the `return res.status(403)...` below once confirmed safe.
  const ip = clientIp(req);
  if (ip && !ALLOWED_IPS.includes(ip)) {
    console.error(`nedarim-refusal-webhook: unexpected IP ${ip} (log-only, not blocking)`);
    const chatId = process.env.TELEGRAM_CHAT_SECURITY_ALERTS;
    if (chatId) {
      // Awaited (not fire-and-forget) — a Vercel serverless function can be
      // torn down right after the response is sent, which would silently
      // drop an un-awaited Telegram call.
      try {
        await sendTelegramMessage(chatId, `⚠️ עדכון סירובים מנדרים מכתובת IP לא מוכרת: ${ip} (לא נחסם, log-only)\nייתכן שזו כתובת חדשה של נדרים, כדאי לברר מולם. אם זה קורה שוב ושוב, ייתכן שזה ניסיון הונאה.`);
      } catch (err) {
        console.error('nedarim-refusal-webhook telegram error:', err);
      }
    }
    // return res.status(403).json({ error: 'Unauthorized source' });
  }

  const body = req.body || {};
  try {
    const id = await ingestRefusal(body);

    // Per Nedarim's spec: a JSON response containing a numeric WEBDocID gets
    // stored on their side and echoed back later as CallBackId in the
    // transaction-history screen, letting them cross-reference without us
    // keeping our own mapping.
    return res.status(200).json({ WEBDocID: id });
  } catch (err) {
    console.error('nedarim-refusal-webhook handler error:', err);
    return res.status(500).json({ error: err.message });
  }
}

export default withErrorAlert(handler, 'nedarim-refusal-webhook');
