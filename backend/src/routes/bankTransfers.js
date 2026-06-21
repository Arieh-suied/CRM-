import { Router } from 'express';
import supabase from '../supabaseClient.js';

const router = Router();
const PAGE_SIZE = 50;

router.get('/', async (req, res) => {
  const { page = 1, search, mosad_number } = req.query;
  const offset = (parseInt(page) - 1) * PAGE_SIZE;

  let query = supabase
    .from('bank_transfers')
    .select('*', { count: 'exact' })
    .order('document_date', { ascending: false })
    .range(offset, offset + PAGE_SIZE - 1);

  if (mosad_number) query = query.eq('mosad_number', mosad_number);

  if (search) {
    query = query.or(
      `customer_name.ilike.%${search}%,customer_email.ilike.%${search}%,customer_id_number.ilike.%${search}%,document_number.ilike.%${search}%`
    );
  }

  const { data, error, count } = await query;
  if (error) return res.status(500).json({ error: error.message });

  res.json({
    data,
    total: count,
    page: parseInt(page),
    totalPages: Math.ceil(count / PAGE_SIZE),
  });
});

export default router;
