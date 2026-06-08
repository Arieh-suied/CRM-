// Proxy for parse-transfer Supabase Edge Function (multipart file upload)
// Requires env vars: RECEIPTS_SUPABASE_URL, RECEIPTS_SUPABASE_SERVICE_KEY

export const config = { api: { bodyParser: false } };

const RECEIPTS_URL = process.env.RECEIPTS_SUPABASE_URL;
const RECEIPTS_KEY = process.env.RECEIPTS_SUPABASE_SERVICE_KEY;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  if (!RECEIPTS_URL || !RECEIPTS_KEY) {
    return res.status(503).json({ error: 'שירות הניתוח לא מוגדר' });
  }

  try {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const rawBody = Buffer.concat(chunks);

    const r = await fetch(`${RECEIPTS_URL}/functions/v1/parse-transfer`, {
      method: 'POST',
      headers: {
        'Content-Type': req.headers['content-type'],
        'Authorization': `Bearer ${RECEIPTS_KEY}`,
      },
      body: rawBody,
    });
    const data = await r.json().catch(() => ({ success: false, error: 'Invalid response' }));
    return res.status(r.status).json(data);
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
}
