import { issueReceipt } from './_receipts-core.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const result = await issueReceipt(req.body);
    const { status, ...body } = result;
    return res.status(status).json(body);
  } catch (err) {
    console.error('receipts handler error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
}
