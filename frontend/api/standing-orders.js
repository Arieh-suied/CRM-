import { getSupabase } from './_supabase.js';

const CREDIT_URL = 'https://matara.pro/nedarimplus/Reports/Manage3.aspx';
const BANK_URL   = 'https://matara.pro/nedarimplus/Reports/Masav3.aspx';

async function fetchFromNedarim(url, action, mosadNumber, apiPassword) {
  const body = new URLSearchParams({ Action: action, MosadNumber: mosadNumber, ApiPassword: apiPassword });
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  if (!res.ok) throw new Error(`nedarim HTTP ${res.status}`);
  return res.json();
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { mosad_number } = req.query;
  if (!mosad_number) return res.status(400).json({ error: 'mosad_number is required' });

  const supabase = getSupabase();
  const { data: inst, error } = await supabase
    .from('institutions')
    .select('mosad_number, mosad_name, api_password')
    .eq('mosad_number', mosad_number)
    .single();

  if (error || !inst) return res.status(404).json({ error: 'Institution not found' });
  if (!inst.api_password) return res.status(400).json({ error: 'No API password configured for this institution' });

  const [creditResult, bankResult] = await Promise.allSettled([
    fetchFromNedarim(CREDIT_URL, 'GetKevaNew',      inst.mosad_number, inst.api_password),
    fetchFromNedarim(BANK_URL,   'GetMasavKevaNew', inst.mosad_number, inst.api_password),
  ]);

  res.json({
    credit: creditResult.status === 'fulfilled' ? creditResult.value : { error: creditResult.reason?.message },
    bank:   bankResult.status   === 'fulfilled' ? bankResult.value   : { error: bankResult.reason?.message },
  });
}
