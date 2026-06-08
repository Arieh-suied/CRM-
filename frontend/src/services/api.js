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

export function fetchStandingOrders(mosadNumber) {
  return request(`/standing-orders?mosad_number=${encodeURIComponent(mosadNumber)}`);
}

export function fetchStandingOrderDetail(mosadNumber, kevaId) {
  return request(`/standing-order-detail?mosad_number=${encodeURIComponent(mosadNumber)}&keva_id=${encodeURIComponent(kevaId)}`);
}

export function updateCreditOrder(mosadNumber, kevaId, fields) {
  return request('/standing-order-update', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mosad_number: mosadNumber, KevaId: kevaId, ...fields }) });
}

export function creditOrderAction(mosadNumber, kevaId, action) {
  return request('/standing-order-action', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mosad_number: mosadNumber, keva_id: kevaId, action }) });
}

export function chargeCreditOrder(mosadNumber, params) {
  return request('/standing-order-charge', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mosad_number: mosadNumber, ...params }) });
}

export async function exportCreditOrders(mosadNumber, type) {
  const res = await fetch(`/api/standing-order-export?mosad_number=${encodeURIComponent(mosadNumber)}&type=${type}`);
  if (!res.ok) throw new Error('Export failed');
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `credit-${type}-${mosadNumber}.csv`; a.click();
  URL.revokeObjectURL(url);
}

export function fetchBankOrderDetail(mosadNumber, masavId) {
  return request(`/bank-order-detail?mosad_number=${encodeURIComponent(mosadNumber)}&masav_id=${encodeURIComponent(masavId)}`);
}

export function updateBankOrder(mosadNumber, kevaId, fields) {
  return request('/bank-order-update', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mosad_number: mosadNumber, KevaId: kevaId, ...fields }) });
}

export function setBankStatus(mosadNumber, masavId, statusNumber, comments) {
  return request('/bank-order-status', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mosad_number: mosadNumber, masav_id: masavId, status_number: statusNumber, comments }) });
}

export function chargeBankOrder(mosadNumber, masavId, amount, date) {
  return request('/bank-order-charge', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mosad_number: mosadNumber, masav_id: masavId, amount, date }) });
}

export async function exportBankOrders(mosadNumber, type, from, to) {
  let url = `/api/bank-order-export?mosad_number=${encodeURIComponent(mosadNumber)}&type=${type}`;
  if (from) url += `&from=${encodeURIComponent(from)}`;
  if (to) url += `&to=${encodeURIComponent(to)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('Export failed');
  const blob = await res.blob();
  const blobUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = blobUrl; a.download = `bank-${type}-${mosadNumber}.csv`; a.click();
  URL.revokeObjectURL(blobUrl);
}
