// Client-side mirror of the placeholder/HTML handling in frontend/api/_email.js —
// used for the template screen's live preview and to prefill the manual
// SendEmailModal. Keep the placeholder set and HTML rules in sync with the server.

const VALID_CURRENCIES = new Set(['ILS', 'USD', 'EUR', 'GBP']);
const PLACEHOLDER_RE = /\{(שם|סכום|קרן|תאריך)\}/g;

export const PLACEHOLDERS = ['{שם}', '{סכום}', '{קרן}', '{תאריך}'];

// Starting point for a mosad that has no template yet (new template in the
// settings tab, or a manual send for an institution without one).
export const DEFAULT_TEMPLATE = {
  subject: 'תודה על תרומתך',
  body: 'שלום {שם},\n\nתודה רבה על תרומתך בסך {סכום} עבור {קרן}.\nתרומתך מסייעת לנו להמשיך בפעילותנו.\n\nבברכה,\nסומך נופלים',
};

export function formatAmount(amount, currency) {
  if (amount == null) return '';
  const code = VALID_CURRENCIES.has(currency) ? currency : 'ILS';
  return new Intl.NumberFormat('he-IL', {
    style: 'currency',
    currency: code,
    maximumFractionDigits: 2,
  }).format(amount);
}

function templateValues(tx, fundName) {
  return {
    'שם': tx.client_name || 'תורם יקר',
    'סכום': formatAmount(tx.amount, tx.currency),
    'קרן': fundName || tx.group_name || '',
    'תאריך': tx.transaction_time_raw || '',
  };
}

export function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function isHtmlBody(text) {
  return /<[a-z][^>]*>/i.test(String(text || ''));
}

// Legacy plain-text template bodies → HTML, so the rich editor can host them.
export function ensureHtml(body) {
  if (isHtmlBody(body)) return body;
  return escapeHtml(body || '').replace(/\r?\n/g, '<br>');
}

// Plain-text fill (subjects).
export function fillTemplate(text, tx, fundName) {
  const values = templateValues(tx, fundName);
  return String(text || '').replace(PLACEHOLDER_RE, (_, key) => values[key]);
}

// HTML fill — placeholder values are escaped before substitution so donor
// names can't inject markup.
export function fillTemplateHtml(html, tx, fundName) {
  const values = templateValues(tx, fundName);
  return String(html || '').replace(PLACEHOLDER_RE, (_, key) => escapeHtml(values[key]));
}

export function htmlIsEmpty(html) {
  return !String(html || '')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .trim();
}
