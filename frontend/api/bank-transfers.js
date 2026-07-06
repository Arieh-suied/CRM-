import { getSupabase, ilikeOr } from './_supabase.js';
import { requireUser } from './_auth.js';

const PAGE_SIZE = 50;
const ALLOWED_SORT = new Set([
  'document_date', 'customer_name', 'customer_id_number',
  'customer_email', 'transfer_amount', 'bank_name', 'bank_branch',
  'bank_account', 'document_number', 'mosad_number',
]);

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const supabase = getSupabase();
    const user = await requireUser(req, res, supabase);
    if (!user) return;

    const { page = 1, search, mosad_number, sort_by = 'document_date', sort_dir = 'desc' } = req.query;
    const offset = (parseInt(page) - 1) * PAGE_SIZE;

    const col = ALLOWED_SORT.has(sort_by) ? sort_by : 'document_date';
    const asc = sort_dir === 'asc';

    let query = supabase
      .from('bank_transfers')
      .select('*', { count: 'exact' })
      .order(col, { ascending: asc, nullsLast: true })
      .range(offset, offset + PAGE_SIZE - 1);

    if (mosad_number) query = query.eq('mosad_number', mosad_number);
    if (search) {
      const orClause = ilikeOr(['customer_name', 'customer_email', 'customer_id_number', 'document_number'], search);
      if (orClause) query = query.or(orClause);
    }

    const { data, error, count } = await query;
    if (error) return res.status(500).json({ error: error.message });
    res.json({ data, total: count, page: parseInt(page), totalPages: Math.ceil(count / PAGE_SIZE) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
