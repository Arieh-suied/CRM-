import { getSupabase } from './_supabase.js';

const CREDIT_URL = 'https://matara.pro/nedarimplus/Reports/Manage3.aspx';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { mosad_number, keva_id } = req.query;
  if (!mosad_number || !keva_id) return res.status(400).json({ error: 'mosad_number and keva_id are required' });

  const supabase = getSupabase();
  const { data: inst, error } = await supabase
    .from('institutions')
    .select('mosad_number, api_password')
    .eq('mosad_number', mosad_number)
    .single();

  if (error || !inst) return res.status(404).json({ error: 'Institution not found' });
  if (!inst.api_password) return res.status(400).json({ error: 'No API password configured' });

  const body = new URLSearchParams({
    Action: 'GetKevaId',
    MosadId: inst.mosad_number,
    ApiPassword: inst.api_password,
    KevaId: keva_id,
  });

  const nedarimRes = await fetch(CREDIT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!nedarimRes.ok) return res.status(502).json({ error: `nedarim HTTP ${nedarimRes.status}` });

  const data = await nedarimRes.json();
  res.json(data);
}
