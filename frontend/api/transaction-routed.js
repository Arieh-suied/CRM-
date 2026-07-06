// Supabase Database Webhook target — fires on every INSERT into `transactions`.
// For each new transaction: (1) notifies the matching institution's Telegram
// channel, and (2) appends a row to every fund Google Sheet whose rule matches.
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
//   TELEGRAM_CHAT_BNOT_CHAYIL — chat id for the "בנות חיל" channel (mosad 7016650)
//   GOOGLE_SHEETS_CLIENT_EMAIL / GOOGLE_SHEETS_PRIVATE_KEY

import { getSupabase } from './_supabase.js';
import { sendTelegramMessage } from './_telegram.js';
import { appendRow } from './_google-sheets.js';
import { getMatchingFundRules } from './_fund-routing.js';
import { resolveInstitution, buildTelegramText, receiptUrlFor } from './_transaction-notify.js';

function chatIdForBucket(bucket) {
  if (bucket === 'סומך נופלים') return process.env.TELEGRAM_CHAT_SOMECH;
  if (bucket === 'ישיבות') return process.env.TELEGRAM_CHAT_YESHIVOT;
  if (bucket === 'בנות חיל') return process.env.TELEGRAM_CHAT_BNOT_CHAYIL;
  return null;
}

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
  const results = { telegram: null, sheets: [] };

  try {
    const target = await resolveInstitution(record, supabase);
    const chatId = target && chatIdForBucket(target.bucket);
    if (chatId) {
      const text = buildTelegramText(record, target.mosadName);
      await sendTelegramMessage(chatId, text, { receiptUrl: receiptUrlFor(record) });
      results.telegram = { sent: true, channel: target.mosadName };
    } else {
      results.telegram = { sent: false, reason: 'no matching institution/channel' };
    }
  } catch (err) {
    console.error('transaction-routed telegram error:', err);
    results.telegram = { sent: false, error: err.message };
  }

  const matchingRules = await getMatchingFundRules(supabase, record);
  for (const rule of matchingRules) {
    try {
      await appendRow(rule.spreadsheetId, rule.sheetName, rule.buildRow(record));
      results.sheets.push({ fund: rule.name, ok: true });
    } catch (err) {
      console.error(`transaction-routed sheets error [${rule.id}]:`, err);
      results.sheets.push({ fund: rule.name, ok: false, error: err.message });
    }
  }

  return res.status(200).json(results);
}
