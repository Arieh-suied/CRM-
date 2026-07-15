// Client-side mirror of the placeholder filling in frontend/api/_email.js —
// used for the template screen's live preview and to prefill the manual
// SendEmailModal. Keep the placeholder set in sync with the server.

const VALID_CURRENCIES = new Set(['ILS', 'USD', 'EUR', 'GBP']);

export const PLACEHOLDERS = ['{שם}', '{סכום}', '{קרן}', '{תאריך}'];

export function formatAmount(amount, currency) {
  if (amount == null) return '';
  const code = VALID_CURRENCIES.has(currency) ? currency : 'ILS';
  return new Intl.NumberFormat('he-IL', {
    style: 'currency',
    currency: code,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function fillTemplate(text, tx, fundName) {
  const values = {
    'שם': tx.client_name || 'תורם יקר',
    'סכום': formatAmount(tx.amount, tx.currency),
    'קרן': fundName || tx.group_name || '',
    'תאריך': tx.transaction_time_raw || '',
  };
  return String(text || '').replace(/\{(שם|סכום|קרן|תאריך)\}/g, (_, key) => values[key]);
}
