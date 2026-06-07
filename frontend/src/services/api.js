const BASE = '/api';

async function request(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, options);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || 'Request failed');
  }
  return res.json();
}

export function fetchTransactions(params = {}) {
  const qs = new URLSearchParams(
    Object.fromEntries(Object.entries(params).filter(([, v]) => v !== '' && v != null))
  ).toString();
  return request(`/transactions${qs ? '?' + qs : ''}`);
}

export function fetchSummary(params = {}) {
  const qs = new URLSearchParams(
    Object.fromEntries(Object.entries(params).filter(([, v]) => v !== '' && v != null))
  ).toString();
  return request(`/transactions/summary${qs ? '?' + qs : ''}`);
}

export function fetchFilterOptions() {
  return request('/transactions/filters');
}

export function fetchInstitutions() {
  return request('/institutions');
}

export function createInstitution(body) {
  return request('/institutions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export function syncGmailFailures() {
  return request('/gmail-sync', { method: 'POST' });
}

export function fetchPaymentFailures(params = {}) {
  const qs = new URLSearchParams(
    Object.fromEntries(Object.entries(params).filter(([, v]) => v !== '' && v != null))
  ).toString();
  return request(`/payment-failures${qs ? '?' + qs : ''}`);
}
