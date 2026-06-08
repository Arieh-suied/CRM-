import { getSupabase } from './_supabase.js';

const PAGE_SIZE = 50;
const ALLOWED_SORT = new Set([
  'document_date', 'customer_name', 'customer_id_number',
  'customer_email', 'transfer_amount', 'bank_name', 'bank_branch',
  'bank_account', 'document_number', 'mosad_number',
]);

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const { page = 1, search, mosad_number, sort_by = 'document_date', sort_dir = 'desc' } = req.query;
    const offset = (parseInt(page) - 1) * PAGE_SIZE;
    const supabase = getSupabase();

    const col = ALLOWED_SORT.has(sort_by) ? sort_by : 'document_date';
    const asc = sort_dir === 'asc';

    let query = supabase
      .from('bank_transfers')
      .select('*', { count: 'exact' })
      .order(col, { ascending: asc, nullsLast: true })
      .range(offset, offset + PAGE_SIZE - 1);

    if (mosad_number) query = query.eq('mosad_number', mosad_number);
    if (search) query = query.or(`customer_name.ilike.%${search}%,customer_email.ilike.%${search}%,customer_id_number.ilike.%${search}%,document_number.ilike.%${search}%`);

    const { data, error, count } = await query;
    if (error) return res.status(500).json({ error: error.message });
    res.json({ data, total: count, page: parseInt(page), totalPages: Math.ceil(count / PAGE_SIZE) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
