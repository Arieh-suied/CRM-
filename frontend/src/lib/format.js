// One formatting convention for the whole app:
//   amounts → "1,250 ₪" / "36.50 ₪" (decimals only when there are any)
//   dates   → "08/10/2026", with time "08/10/2026 14:32"

const KNOWN_CURRENCIES = new Set(['ILS', 'USD', 'EUR', 'GBP']);

export function formatCurrency(amount, currency = 'ILS') {
  if (amount === null || amount === undefined || amount === '') return '—';
  const n = Number(amount);
  if (!Number.isFinite(n)) return String(amount);
  const code = String(currency || 'ILS').toUpperCase();
  const fractionDigits = Number.isInteger(n) ? 0 : 2;
  try {
    return new Intl.NumberFormat('he-IL', {
      style: 'currency',
      currency: KNOWN_CURRENCIES.has(code) ? code : 'ILS',
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
    }).format(n);
  } catch {
    return `${n.toLocaleString('he-IL')} ${code}`;
  }
}

export function formatNumber(n) {
  if (n === null || n === undefined || n === '') return '—';
  const v = Number(n);
  return Number.isFinite(v) ? v.toLocaleString('he-IL') : String(n);
}

const pad = (n) => String(n).padStart(2, '0');
const dmy = (d) => `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
const hm = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

// Accepts a Date, an ISO timestamp, "YYYY-MM-DD", or the day-first strings the
// external sources send ("8/10/26", "08.10.2026", "08/10/2026 14:32").
// Returns null when it can't make sense of the value.
function parseDate(value) {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : { date: value, hasTime: true };
  const s = String(value).trim();

  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return { date: new Date(+m[1], +m[2] - 1, +m[3]), hasTime: false };

  m = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})(?:[ ,T]+(\d{1,2}):(\d{2}))?/);
  if (m) {
    const year = m[3].length === 2 ? 2000 + +m[3] : +m[3];
    const date = new Date(year, +m[2] - 1, +m[1], m[4] ? +m[4] : 0, m[5] ? +m[5] : 0);
    return { date, hasTime: Boolean(m[4]) };
  }

  if (/^\d{4}-\d{2}-\d{2}T/.test(s)) {
    const date = new Date(s);
    return Number.isNaN(date.getTime()) ? null : { date, hasTime: true };
  }
  return null;
}

export function formatDate(value) {
  if (!value) return '—';
  const p = parseDate(value);
  return p ? dmy(p.date) : String(value);
}

export function formatDateTime(value) {
  if (!value) return '—';
  const p = parseDate(value);
  if (!p) return String(value);
  return p.hasTime ? `${dmy(p.date)} ${hm(p.date)}` : dmy(p.date);
}

// "YYYY-MM-DD" in local time — for <input type="date"> values.
export function toInputDate(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
