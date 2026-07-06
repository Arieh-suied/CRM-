import { issueReceipt } from './_receipts-core.js';
import { getSupabase } from './_supabase.js';
import { requireUser, WRITE_ROLES } from './_auth.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const user = await requireUser(req, res, getSupabase(), { roles: WRITE_ROLES });
    if (!user) return;

    const result = await issueReceipt(req.body);
    const { status, ...body } = result;
    return res.status(status).json(body);
  } catch (err) {
    console.error('receipts handler error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
}
