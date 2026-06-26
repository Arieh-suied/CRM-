// Shared Telegram message formatting for a transaction row — used by both
// the automatic Database Webhook router (transaction-routed.js) and the
// AI assistant's manual "send to Telegram" tool, so both produce identical
// messages.

export function isYeshivotName(name) {
  return name?.includes('אור אפרים') || name?.includes('חכמי ירושלים');
}
export function isSomechName(name) {
  return name?.includes('סומך');
}

// Institutions whose name carries a "שכ\"ל" (school-fee) suffix are tuition
// accounts; everything else is a donation.
export function paymentTypeFor(mosadName) {
  return mosadName?.includes('שכ"ל') || mosadName?.includes('שכר לימוד') ? 'שכר לימוד' : 'תרומה';
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

  if (isSomechName(row.comments) || isSomechName(row.group_name) || isSomechName(mosadName)) {
    return { bucket: 'סומך נופלים', mosadName: mosadName || 'סומך נופלים' };
  }
  if (isYeshivotName(mosadName)) {
    return { bucket: 'ישיבות', mosadName };
  }
  return null;
}
