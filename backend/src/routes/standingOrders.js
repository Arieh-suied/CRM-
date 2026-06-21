import { Router } from 'express';
import supabase from '../supabaseClient.js';

const router = Router();

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

// GET /api/standing-orders?mosad_number=xxx
router.get('/', async (req, res) => {
  const { mosad_number } = req.query;
  if (!mosad_number) return res.status(400).json({ error: 'mosad_number is required' });

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
});

export default router;
