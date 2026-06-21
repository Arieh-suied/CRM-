import { Router } from 'express';
import supabase from '../supabaseClient.js';

const router = Router();

router.get('/', async (req, res) => {
  const { page = 1, search = '' } = req.query;
  const limit = 25;
  const offset = (Number(page) - 1) * limit;

  let query = supabase
    .from('payment_failures')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (search) {
    query = query.or(
      `customer_name.ilike.%${search}%,institution_name.ilike.%${search}%,order_number.ilike.%${search}%,donor_email.ilike.%${search}%`
    );
  }

  const { data, error, count } = await query;
  if (error) return res.status(500).json({ error: error.message });

  res.json({ data, total: count, totalPages: Math.ceil(count / limit) });
});

export default router;
