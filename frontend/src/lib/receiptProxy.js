import { supabase } from './supabase.js';

// receipt-proxy.js is hit via direct browser navigation (<iframe>/<a>), which
// can't carry an Authorization header — so the session token rides along as
// a query param instead (see _auth.js's getRequestUser).
export async function buildReceiptProxyUrl(url, filename) {
  const { data: { session } } = await supabase.auth.getSession();
  const params = new URLSearchParams({ url, filename: filename || 'קבלה' });
  if (session?.access_token) params.set('token', session.access_token);
  return `/api/receipt-proxy?${params.toString()}`;
}
