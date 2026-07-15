// Supabase Database Webhook target — fires on every INSERT into `transactions`.
// For each new transaction: (1) notifies the matching institution's Telegram
// channel, (2) appends a row to every fund Google Sheet whose rule matches,
// and (3) sends the donor an automatic thank-you email (if enabled and the
// record has an email — dedup lives in email_log, see _email.js).
// Ported from the Make.com scenarios "יפה ותמה נדרים וקרנות" and
// "סומך נופלים והקרנות" — see _fund-routing.js for the fund rules.
//
// Env vars required:
//   SUPABASE_WEBHOOK_SECRET   — shared secret checked against the
//                               x-webhook-secret header (set the same value
//                               in the Supabase Database Webhook config)
//   TELEGRAM_BOT_TOKEN
//   TELEGRAM_CHAT_SOMECH      — chat id for the "סומך נופלים" channel
//   TELEGRAM_CHAT_YESHIVOT    — chat id for the "ישיבות" channel (אור אפרים + חכמי ירושלים)
//   TELEGRAM_CHAT_BNOT_CHAYIL — chat id for the "תולדות ניסים" channel (mosad 7016650, formerly "בנות חיל")
//   GOOGLE_SHEETS_CLIENT_EMAIL / GOOGLE_SHEETS_PRIVATE_KEY
//   GOOGLE_CLIENT_ID_SOM / GOOGLE_CLIENT_SECRET_SOM / GOOGLE_REDIRECT_URI_SOM /
//   GOOGLE_REFRESH_TOKEN_SOM  — donor thank-you emails (needs gmail.send scope)

import { getSupabase } from './_supabase.js';
import { routeTransaction } from './_transaction-route.js';
import { sendDonorThanksIfEnabled } from './_email.js';

// Telegram + N sheet appends + Gmail token exchange + send can brush against
// the 10s default on a cold start.
export const config = { maxDuration: 30 };

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const secret = process.env.SUPABASE_WEBHOOK_SECRET;
  if (!secret || req.headers['x-webhook-secret'] !== secret) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { type, table, record } = req.body || {};
  if (table !== 'transactions' || type !== 'INSERT' || !record) {
    return res.status(200).json({ skipped: true, reason: 'not an insert into transactions' });
  }

  const supabase = getSupabase();
  const results = await routeTransaction(supabase, record);

  // The thank-you email must never break the Telegram/Sheets flow — always 200.
  try {
    results.email = await sendDonorThanksIfEnabled(supabase, record);
  } catch (err) {
    console.error('transaction-routed auto-email error:', err);
    results.email = { sent: false, error: err.message };
  }

  return res.status(200).json(results);
}
