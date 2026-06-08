import { getSupabase } from './_supabase.js';

const BANK_URL = 'https://matara.pro/nedarimplus/Reports/Masav3.aspx';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { mosad_number, masav_id, amount, date } = req.body;
  if (!amount || !date) return res.status(400).json({ error: 'amount and date are required' });
  const { data: inst } = await getSupabase().from('institutions').select('mosad_number, api_password').eq('mosad_number', mosad_number).single();
  if (!inst?.api_password) return res.status(400).json({ error: 'No API password' });
  const params = new URLSearchParams({ Action: 'MasavBoded', MosadNumber: inst.mosad_number, ApiPassword: inst.api_password, MasavId: masav_id, Amount: amount, Date: date, AjaxId: Date.now().toString() });
  const r = await fetch(BANK_URL, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: params.toString() });
  const text = await r.text();
  try { res.json(JSON.parse(text)); } catch { res.json({ Result: text.trim().startsWith('OK') ? 'OK' : 'Error', Message: text.trim() }); }
}
