// Bank of Israel official representative rate (שער יציג) — free, no API key,
// updated once daily by the bank. Cached in-memory per warm serverless
// instance to avoid hitting it on every transaction.

const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6h — plenty since BOI updates once/day
const cache = new Map(); // currency -> { rate, fetchedAt }

export async function getIlsRate(currency) {
  if (!currency || currency === 'ILS') return 1;

  const cached = cache.get(currency);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.rate;
  }

  const res = await fetch(`https://www.boi.org.il/PublicApi/GetExchangeRate?key=${currency}`);
  if (!res.ok) throw new Error(`BOI exchange rate request failed: ${res.status}`);
  const data = await res.json();
  if (!data?.currentExchangeRate) {
    throw new Error(`BOI has no exchange rate for currency "${currency}"`);
  }

  const rate = data.currentExchangeRate / (data.unit || 1);
  cache.set(currency, { rate, fetchedAt: Date.now() });
  return rate;
}

export async function convertToIls(amount, currency) {
  const rate = await getIlsRate(currency);
  return Math.round(Number(amount) * rate * 100) / 100;
}

export const CURRENCY_SYMBOLS = { USD: '$', EUR: '€', GBP: '£' };
