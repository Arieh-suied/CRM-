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
//   GOOGLE_SHEETS_CLIENT_EMAIL / GOOGLE_SHEETS_PRIVATE_KEY

import { getSupabase } from './_supabase.js';
import { sendTelegramMessage } from './_telegram.js';
import { appendRow } from './_google-sheets.js';
import { getMatchingFundRules } from './_fund-routing.js';

// Institution names in the real `institutions` table aren't a fixed small
// set (e.g. "ישיבת אור אפרים", "ישיבת חכמי ירושלים - שכ\"ל", or even
// "יפה ותמה שע\"י ארגון צדקה וחסד סומך נופלים") — so bucket by substring
// rather than exact match.
function isYeshivotName(name) {
  return name?.includes('אור אפרים') || name?.includes('חכמי ירושלים');
}
function isSomechName(name) {
  return name?.includes('סומך');
}

async function resolveInstitution(row, supabase) {
  const { data } = await supabase
    .from('institutions')
    .select('mosad_name')
    .eq('mosad_number', row.mosad_number)
    .maybeSingle();
  const mosadName = data?.mosad_name || null;

  if (isSomechName(row.comments) || isSomechName(row.group_name) || isSomechName(mosadName)) {
    return { chatId: process.env.TELEGRAM_CHAT_SOMECH, mosadName: mosadName || 'סומך נופלים' };
  }
  if (isYeshivotName(mosadName)) {
    return { chatId: process.env.TELEGRAM_CHAT_YESHIVOT, mosadName };
  }
  return null;
}

// Institutions whose name carries a "שכ\"ל" (school-fee) suffix are tuition
// accounts; everything else routed here is a donation.
function paymentTypeFor(mosadName) {
  return mosadName?.includes('שכ"ל') || mosadName?.includes('שכר לימוד') ? 'שכר לימוד' : 'תרומה';
}

function receiptUrlFor(row) {
  return row.receipt_data ? `https://files.ezcount.co.il/front/documents/get/${row.receipt_data}` : null;
}

function buildTelegramText(row, mosadName) {
  return [
    `התקבלה עסקה ב${mosadName}`,
    '',
    `שם: ${row.client_name || '—'}`,
    `סכום: ${row.amount}₪`,
    `הערות: ${row.comments || ''}`,
    `קטגוריה: ${row.group_name || ''}`,
    `סוג תשלום: ${paymentTypeFor(mosadName)}`,
  ].join('\n');
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
    if (target?.chatId) {
      const text = buildTelegramText(record, target.mosadName);
      await sendTelegramMessage(target.chatId, text, { receiptUrl: receiptUrlFor(record) });
      results.telegram = { sent: true, channel: target.mosadName };
    } else {
      results.telegram = { sent: false, reason: 'no matching institution/channel' };
    }
  } catch (err) {
    console.error('transaction-routed telegram error:', err);
    results.telegram = { sent: false, error: err.message };
  }

  const matchingRules = getMatchingFundRules(record);
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
