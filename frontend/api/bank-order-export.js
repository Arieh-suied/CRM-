import { getSupabase } from './_supabase.js';

const BANK_URL = 'https://matara.pro/nedarimplus/Reports/Masav3.aspx';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const { mosad_number, type, from, to } = req.query;
  const { data: inst } = await getSupabase().from('institutions').select('mosad_number, api_password').eq('mosad_number', mosad_number).single();
  if (!inst?.api_password) return res.status(400).json({ error: 'No API password' });
  let params;
  if (type === 'history') {
    if (!from || !to) return res.status(400).json({ error: 'from and to required for history export' });
    params = new URLSearchParams({ Action: 'GetMasavHistoryCSVNew', MosadNumber: inst.mosad_number, ApiPassword: inst.api_password, From: from, To: to, ToMail: '0' });
  } else {
    params = new URLSearchParams({ Action: 'GetMasavCSV', MosadNumber: inst.mosad_number, ApiPassword: inst.api_password, ToMail: '0' });
  }
  const r = await fetch(BANK_URL, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: params.toString() });
  const buffer = Buffer.from(await r.arrayBuffer());
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="bank-${type}-${mosad_number}.csv"`);
  res.send(buffer);
}
