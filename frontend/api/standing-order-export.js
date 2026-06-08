import { getSupabase } from './_supabase.js';

const CREDIT_URL = 'https://matara.pro/nedarimplus/Reports/Manage3.aspx';
const TYPE_MAP = { orders: 'GetKevaCSV', business: 'GetKevaCSVAsakim', refusals: 'GetErrorLogsCSV' };

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const { mosad_number, type } = req.query;
  const action = TYPE_MAP[type];
  if (!action) return res.status(400).json({ error: 'Invalid type. Use: orders, business, refusals' });
  const { data: inst } = await getSupabase().from('institutions').select('mosad_number, api_password').eq('mosad_number', mosad_number).single();
  if (!inst?.api_password) return res.status(400).json({ error: 'No API password' });
  const params = new URLSearchParams({ Action: action, MosadNumber: inst.mosad_number, ApiPassword: inst.api_password, ToMail: '0' });
  const r = await fetch(CREDIT_URL, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: params.toString() });
  const buffer = Buffer.from(await r.arrayBuffer());
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="credit-${type}-${mosad_number}.csv"`);
  res.send(buffer);
}
