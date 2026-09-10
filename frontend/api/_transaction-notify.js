// Shared Telegram message formatting for a transaction row — used by both
// the automatic Database Webhook router (transaction-routed.js) and the
// AI assistant's manual "send to Telegram" tool, so both produce identical
// messages.

import { convertToIls, CURRENCY_SYMBOLS } from './_exchange-rate.js';

export function isYeshivotName(name) {
  return name?.includes('אור אפרים') || name?.includes('חכמי ירושלים');
}
export function isSomechName(name) {
  // "יפה ותמה" is a סומך נופלים sub-fund — its name alone doesn't contain
  // "סומך", so it needs an explicit override (confirmed with the user).
  return name?.includes('סומך') || name?.includes('יפה ותמה');
}
// מוסד 7016650 — "תולדות נסים", formerly named "בנות חיל". Refusal emails label
// it inconsistently (e.g. "Toldot Nissim - תולדות נסים", and the Hebrew is
// spelled both נסים and ניסים), so match on the distinctive "תולדות"/"Toldot"
// token rather than an exact string, and still accept the old "בנות חיל".
export function isToldotNisimName(name) {
  if (!name) return false;
  return name.includes('תולדות') || name.toLowerCase().includes('toldot') || name.includes('בנות חיל');
}

// Institutions whose name carries a "שכ\"ל" (school-fee) suffix are tuition
// accounts; everything else is a donation.
export function paymentTypeFor(mosadName) {
  return mosadName?.includes('שכ"ל') || mosadName?.includes('שכר לימוד') ? 'שכר לימוד' : 'תרומה';
}

// Routes refusal alerts (both Gmail credit-card refusals and the monthly bank
// standing-order report) to the Telegram channel matching the institution.
export function refusalChatId(institutionName) {
  if (isSomechName(institutionName)) return process.env.TELEGRAM_CHAT_REFUSALS_SOMECH;
  if (isYeshivotName(institutionName)) return process.env.TELEGRAM_CHAT_REFUSALS_YESHIVOT;
  // תולדות ניסים (מוסד 7016650) refusals go to the same channel as its
  // successful transactions (TELEGRAM_CHAT_BNOT_CHAYIL).
  if (isToldotNisimName(institutionName)) return process.env.TELEGRAM_CHAT_BNOT_CHAYIL;
  return null;
}

// Routes an institution (matched by name, e.g. from a Gmail standing-order
// email that has no mosad number) to its *transaction* Telegram channel — the
// same channel its successful transactions go to, not the refusals channel.
export function transactionChatIdByName(institutionName) {
  if (isSomechName(institutionName)) return process.env.TELEGRAM_CHAT_SOMECH;
  if (isYeshivotName(institutionName)) return process.env.TELEGRAM_CHAT_YESHIVOT;
  if (isToldotNisimName(institutionName)) return process.env.TELEGRAM_CHAT_BNOT_CHAYIL;
  return null;
}

export function receiptUrlFor(row) {
  return row.receipt_data ? `https://files.ezcount.co.il/front/documents/get/${row.receipt_data}` : null;
}

async function buildAmountLines(row) {
  const currency = row.currency && row.currency !== 'ILS' ? row.currency : null;
  if (!currency) return [`סכום: ${row.amount}₪`];

  const symbol = CURRENCY_SYMBOLS[currency] || currency + ' ';
  const lines = [`סכום: ${symbol}${row.amount}`];
  try {
    const ilsAmount = await convertToIls(row.amount, currency);
    lines.push(`שווה ערך: ${ilsAmount}₪`);
  } catch (err) {
    console.error('buildAmountLines exchange rate error:', err);
  }
  return lines;
}

export async function buildTelegramText(row, mosadName) {
  // transaction_kind lets a caller override the generic "עסקה" header — e.g.
  // the external bank-transfer approval flow (toldot-submissions.js) passes
  // 'העברה בנקאית' so the channel message reads correctly; the automatic
  // transactions webhook leaves it unset and keeps the original wording.
  const kind = row.transaction_kind || 'עסקה';
  const amountLines = await buildAmountLines(row);
  return [
    `התקבלה ${kind} ב${mosadName}`,
    '',
    `שם: ${row.client_name || '—'}`,
    ...amountLines,
    `הערות: ${row.comments || ''}`,
    `קטגוריה: ${row.group_name || ''}`,
    `סוג תשלום: ${paymentTypeFor(mosadName)}`,
  ].join('\n');
}

export async function resolveInstitution(row, supabase) {
  const { data } = await supabase
    .from('institutions')
    .select('mosad_name')
    .eq('mosad_number', row.mosad_number)
    .maybeSingle();
  const mosadName = data?.mosad_name || null;

  if (String(row.mosad_number) === '7016650') {
    return { bucket: 'תולדות ניסים', mosadName: mosadName || 'תולדות ניסים' };
  }
  // A transaction from any *other* mosad whose category (group_name) names
  // תולדות נסים (e.g. "Toldot Nissim - תולדות נסים") routes to the same
  // channel/sheet; label it תולדות ניסים rather than the source mosad so the
  // channel message reads consistently.
  if (isToldotNisimName(row.group_name)) {
    return { bucket: 'תולדות ניסים', mosadName: 'תולדות ניסים' };
  }
  if (isSomechName(row.comments) || isSomechName(row.group_name) || isSomechName(mosadName)) {
    return { bucket: 'סומך נופלים', mosadName: mosadName || 'סומך נופלים' };
  }
  if (isYeshivotName(mosadName)) {
    return { bucket: 'ישיבות', mosadName };
  }
  return null;
}
