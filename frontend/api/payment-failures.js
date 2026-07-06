import { getSupabase, ilikeOr } from './_supabase.js';
import { requireUser } from './_auth.js';

const PAGE_SIZE = 25;

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const supabase = getSupabase();
    const user = await requireUser(req, res, supabase);
    if (!user) return;

    const { page = 1, search } = req.query;
    const offset = (parseInt(page) - 1) * PAGE_SIZE;

    let query = supabase
      .from('payment_failures')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1);

    if (search) {
      const orClause = ilikeOr(['customer_name', 'institution_name', 'order_number', 'donor_email'], search);
      if (orClause) query = query.or(orClause);
    }

    const { data, error, count } = await query;
    if (error) return res.status(500).json({ error: error.message });
    res.json({ data, total: count, totalPages: Math.ceil(count / PAGE_SIZE) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
