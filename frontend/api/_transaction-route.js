// Shared routing for a transaction-shaped record: notifies the matching
// institution's Telegram channel and appends a row to every fund Google Sheet
// whose rule matches. Used by the automatic Database Webhook (transaction-routed.js)
// and by the Toldot Nisim approval flow (toldot-submissions.js), so both produce
// identical channel messages and sheet rows.
//
// Env vars: TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_SOMECH, TELEGRAM_CHAT_YESHIVOT,
//           TELEGRAM_CHAT_BNOT_CHAYIL, GOOGLE_SHEETS_CLIENT_EMAIL/PRIVATE_KEY

import { sendTelegramMessage } from './_telegram.js';
import { appendRow } from './_google-sheets.js';
import { getMatchingFundRules } from './_fund-routing.js';
import { resolveInstitution, buildTelegramText, receiptUrlFor } from './_transaction-notify.js';

export function chatIdForBucket(bucket) {
  if (bucket === 'סומך נופלים') return process.env.TELEGRAM_CHAT_SOMECH;
  if (bucket === 'ישיבות') return process.env.TELEGRAM_CHAT_YESHIVOT;
  if (bucket === 'תולדות ניסים') return process.env.TELEGRAM_CHAT_BNOT_CHAYIL;
  return null;
}

export async function routeTransaction(supabase, record) {
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
    console.error('routeTransaction telegram error:', err);
    results.telegram = { sent: false, error: err.message };
  }

  const matchingRules = await getMatchingFundRules(supabase, record);
  for (const rule of matchingRules) {
    try {
      await appendRow(rule.spreadsheetId, rule.sheetName, rule.buildRow(record));
      results.sheets.push({ fund: rule.name, ok: true });
    } catch (err) {
      console.error(`routeTransaction sheets error [${rule.id}]:`, err);
      results.sheets.push({ fund: rule.name, ok: false, error: err.message });
    }
  }

  return results;
}
