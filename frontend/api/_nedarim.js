import { getSupabase } from './_supabase.js';

export const CREDIT_URL = 'https://matara.pro/nedarimplus/Reports/Manage3.aspx';
export const BANK_URL   = 'https://matara.pro/nedarimplus/Reports/Masav3.aspx';

export async function getInstitution(mosad_number) {
  const { data } = await getSupabase().from('institutions').select('mosad_number, api_password').eq('mosad_number', mosad_number).single();
  if (!data?.api_password) throw new Error('No API password configured');
  return data;
}

export async function callNedarim(url, params) {
  const body = new URLSearchParams(params);
  return fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: body.toString() });
}
