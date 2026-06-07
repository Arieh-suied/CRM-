import { getSupabase } from './_supabase.js';

const PAGE_SIZE = 50;
const SORTABLE = new Set(['transaction_time_iso', 'client_name', 'amount', 'transaction_type', 'group_name', 'mosad_number']);

function applyFilters(query, { mosad_number, transaction_type, group_name, date_from, date_to, search }) {
  if (mosad_number)      query = query.eq('mosad_number', mosad_number);
  if (transaction_type)  query = query.eq('transaction_type', transaction_type);
  if (group_name)        query = query.eq('group_name', group_name);
  if (date_from)         query = query.gte('transaction_time_iso', date_from);
  if (date_to)           query = query.lte('transaction_time_iso', date_to + 'T23:59:59');
  if (search)            query = query.or(`client_name.ilike.%${search}%,phone.ilike.%${search}%,email.ilike.%${search}%,external_transaction_id.ilike.%${search}%`);
  return query;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const { page = 1, sort_by = 'transaction_time_iso', sort_dir = 'desc', ...filters } = req.query;
    const offset = (parseInt(page) - 1) * PAGE_SIZE;
    const column = SORTABLE.has(sort_by) ? sort_by : 'transaction_time_iso';
    const supabase = getSupabase();

    let query = supabase
      .from('transactions')
      .select('*', { count: 'exact' })
      .order(column, { ascending: sort_dir === 'asc' })
      .range(offset, offset + PAGE_SIZE - 1);

    query = applyFilters(query, filters);
    const { data, error, count } = await query;
    if (error) return res.status(500).json({ error: error.message });

    res.json({ data, total: count, page: parseInt(page), pageSize: PAGE_SIZE, totalPages: Math.ceil(count / PAGE_SIZE) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
