// Shared Telegram message formatting for a transaction row — used by both
// the automatic Database Webhook router (transaction-routed.js) and the
// AI assistant's manual "send to Telegram" tool, so both produce identical
// messages.

export function isYeshivotName(name) {
  return name?.includes('אור אפרים') || name?.includes('חכמי ירושלים');
}
export function isSomechName(name) {
  // "יפה ותמה" is a סומך נופלים sub-fund — its name alone doesn't contain
  // "סומך", so it needs an explicit override (confirmed with the user).
  return name?.includes('סומך') || name?.includes('יפה ותמה');
}
// מוסד 7016650 — "תולדות ניסים", formerly named "בנות חיל"; refusal emails may
// still carry either label, so match both.
export function isToldotNisimName(name) {
  return name?.includes('תולדות ניסים') || name?.includes('בנות חיל');
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

export function receiptUrlFor(row) {
  return row.receipt_data ? `https://files.ezcount.co.il/front/documents/get/${row.receipt_data}` : null;
}

export function buildTelegramText(row, mosadName) {
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
  if (isSomechName(row.comments) || isSomechName(row.group_name) || isSomechName(mosadName)) {
    return { bucket: 'סומך נופלים', mosadName: mosadName || 'סומך נופלים' };
  }
  if (isYeshivotName(mosadName)) {
    return { bucket: 'ישיבות', mosadName };
  }
  return null;
}
