import { getSupabase } from './_supabase.js';

const BANK_URL = 'https://matara.pro/nedarimplus/Reports/Masav3.aspx';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const { mosad_number, masav_id } = req.query;
  if (!mosad_number || !masav_id) return res.status(400).json({ error: 'mosad_number and masav_id are required' });
  const { data: inst } = await getSupabase().from('institutions').select('mosad_number, api_password').eq('mosad_number', mosad_number).single();
  if (!inst?.api_password) return res.status(400).json({ error: 'No API password' });
  const params = new URLSearchParams({ Action: 'GetMasavId', MosadNumber: inst.mosad_number, ApiPassword: inst.api_password, MasavId: masav_id });
  const r = await fetch(BANK_URL, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: params.toString() });
  const text = await r.text();
  try { res.json(JSON.parse(text)); } catch { res.json({ error: text }); }
}
