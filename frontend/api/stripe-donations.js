import { getSupabase } from './_supabase.js';

const PAGE_SIZE = 50;

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const { page = 1, search } = req.query;
    const offset = (parseInt(page) - 1) * PAGE_SIZE;
    const supabase = getSupabase();

    let query = supabase
      .from('stripe_donations_enriched')
      .select('*', { count: 'exact' })
      .order('paid_at', { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1);

    if (search) query = query.or(`donor_name.ilike.%${search}%,donor_email.ilike.%${search}%,stripe_customer_id.ilike.%${search}%,stripe_payment_intent_id.ilike.%${search}%`);

    const { data, error, count } = await query;
    if (error) return res.status(500).json({ error: error.message });
    res.json({ data, total: count, page: parseInt(page), totalPages: Math.ceil(count / PAGE_SIZE) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
