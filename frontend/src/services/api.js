import { supabase } from '../lib/supabase.js';

const BASE = '/api';

async function request(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, options);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || 'Request failed');
  }
  return res.json();
}

async function adminRequest(path, options = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  return request(path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
}

// ── Admin user management ──────────────────────────────────────────────────────

export function fetchAdminUsers() {
  return adminRequest('/admin/users');
}

export function createAdminUser(body) {
  return adminRequest('/admin/users', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function updateAdminUser(id, body) {
  return adminRequest(`/admin/users/${id}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  });
}

export function deleteAdminUser(id) {
  return adminRequest(`/admin/users/${id}`, { method: 'DELETE' })
    .catch(() => {}); // 204 No Content has no body — ignore parse error
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

const postJson = (path, body) =>
  request(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

// Standing orders — credit + bank list (fetched in parallel)
export async function fetchStandingOrders(mosadNumber) {
  const enc = encodeURIComponent(mosadNumber);
  const [c, b] = await Promise.allSettled([
    request(`/standing-orders?mosad_number=${enc}`),
    request(`/bank-orders?mosad_number=${enc}`),
  ]);
  return {
    credit: c.status === 'fulfilled' ? c.value : { error: c.reason?.message },
    bank:   b.status === 'fulfilled' ? b.value : { error: b.reason?.message },
  };
}

// Credit operations — all go through /standing-orders
export function fetchStandingOrderDetail(mosadNumber, kevaId) {
  return request(`/standing-orders?mosad_number=${encodeURIComponent(mosadNumber)}&keva_id=${encodeURIComponent(kevaId)}`);
}

export function updateCreditOrder(mosadNumber, kevaId, fields) {
  return postJson('/standing-orders', { action: 'update', mosad_number: mosadNumber, KevaId: kevaId, ...fields });
}

export function creditOrderAction(mosadNumber, kevaId, action) {
  return postJson('/standing-orders', { action, mosad_number: mosadNumber, keva_id: kevaId });
}

export function chargeCreditOrder(mosadNumber, params) {
  return postJson('/standing-orders', { action: 'charge', mosad_number: mosadNumber, ...params });
}

export async function exportCreditOrders(mosadNumber, type) {
  const res = await fetch(`/api/standing-orders?mosad_number=${encodeURIComponent(mosadNumber)}&export=${type}`);
  if (!res.ok) throw new Error('Export failed');
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `credit-${type}-${mosadNumber}.csv`; a.click();
  URL.revokeObjectURL(url);
}

// Bank operations — all go through /bank-orders
export function fetchBankOrderDetail(mosadNumber, masavId) {
  return request(`/bank-orders?mosad_number=${encodeURIComponent(mosadNumber)}&masav_id=${encodeURIComponent(masavId)}`);
}

export function updateBankOrder(mosadNumber, kevaId, fields) {
  return postJson('/bank-orders', { action: 'update', mosad_number: mosadNumber, KevaId: kevaId, ...fields });
}

export function setBankStatus(mosadNumber, masavId, statusNumber, comments) {
  return postJson('/bank-orders', { action: 'status', mosad_number: mosadNumber, masav_id: masavId, status_number: statusNumber, comments });
}

export function chargeBankOrder(mosadNumber, masavId, amount, date) {
  return postJson('/bank-orders', { action: 'charge', mosad_number: mosadNumber, masav_id: masavId, amount, date });
}

export async function exportBankOrders(mosadNumber, type, from, to) {
  let url = `/api/bank-orders?mosad_number=${encodeURIComponent(mosadNumber)}&export=${type}`;
  if (from) url += `&from=${encodeURIComponent(from)}`;
  if (to)   url += `&to=${encodeURIComponent(to)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('Export failed');
  const blob = await res.blob();
  const blobUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = blobUrl; a.download = `bank-${type}-${mosadNumber}.csv`; a.click();
  URL.revokeObjectURL(blobUrl);
}
