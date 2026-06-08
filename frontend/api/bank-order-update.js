import { getSupabase } from './_supabase.js';

const BANK_URL = 'https://matara.pro/nedarimplus/Reports/Masav3.aspx';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { mosad_number, KevaId, ...fields } = req.body;
  const { data: inst } = await getSupabase().from('institutions').select('mosad_number, api_password').eq('mosad_number', mosad_number).single();
  if (!inst?.api_password) return res.status(400).json({ error: 'No API password' });
  const params = new URLSearchParams({ Action: 'EditMasavKeva', MosadNumber: inst.mosad_number, ApiPassword: inst.api_password, KevaId });
  Object.entries(fields).forEach(([k, v]) => { if (v !== undefined && v !== '') params.append(k, v); });
  const r = await fetch(BANK_URL, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: params.toString() });
  res.json(await r.json());
}
