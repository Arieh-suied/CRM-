import { getSupabase } from './_supabase.js';

const PAGE_SIZE = 25;

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const { page = 1, search } = req.query;
    const offset = (parseInt(page) - 1) * PAGE_SIZE;
    const supabase = getSupabase();

    let query = supabase
      .from('payment_failures')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1);

    if (search) query = query.or(`customer_name.ilike.%${search}%,institution_name.ilike.%${search}%,order_number.ilike.%${search}%,donor_email.ilike.%${search}%`);

    const { data, error, count } = await query;
    if (error) return res.status(500).json({ error: error.message });
    res.json({ data, total: count, totalPages: Math.ceil(count / PAGE_SIZE) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
