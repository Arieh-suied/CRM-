// Proxy for create-receipt Supabase Edge Function
// Requires env vars: RECEIPTS_SUPABASE_URL, RECEIPTS_SUPABASE_SERVICE_KEY

const RECEIPTS_URL = process.env.RECEIPTS_SUPABASE_URL;
const RECEIPTS_KEY = process.env.RECEIPTS_SUPABASE_SERVICE_KEY;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  if (!RECEIPTS_URL || !RECEIPTS_KEY) {
    return res.status(503).json({ error: 'שירות הקבלות לא מוגדר - נדרש RECEIPTS_SUPABASE_URL ו-RECEIPTS_SUPABASE_SERVICE_KEY' });
  }

  try {
    const r = await fetch(`${RECEIPTS_URL}/functions/v1/create-receipt`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${RECEIPTS_KEY}`,
      },
      body: JSON.stringify(req.body),
    });
    const data = await r.json().catch(() => ({ error: 'Invalid JSON response' }));
    return res.status(r.status).json(data);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
