import { getSupabase } from './_supabase.js';

const CREDIT_URL = 'https://matara.pro/nedarimplus/Reports/Manage3.aspx';
const ACTION_MAP = { disable: 'DisableKeva', enable: 'EnableKevaNew', delete: 'DeleteKeva' };

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { mosad_number, keva_id, action } = req.body;
  const nedarimAction = ACTION_MAP[action];
  if (!nedarimAction) return res.status(400).json({ error: 'Invalid action' });
  const { data: inst } = await getSupabase().from('institutions').select('mosad_number, api_password').eq('mosad_number', mosad_number).single();
  if (!inst?.api_password) return res.status(400).json({ error: 'No API password' });
  const params = new URLSearchParams({ Action: nedarimAction, MosadNumber: inst.mosad_number, ApiPassword: inst.api_password, KevaId: keva_id });
  const r = await fetch(CREDIT_URL, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: params.toString() });
  const text = await r.text();
  try { res.json(JSON.parse(text)); }
  catch { res.json({ Result: text.trim().startsWith('OK') ? 'OK' : 'Error', Message: text.trim() }); }
}
