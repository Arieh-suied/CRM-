import { getSupabase, ilikeOr } from './_supabase.js';
import { requireUser } from './_auth.js';

const PAGE_SIZE = 50;
const SORTABLE = new Set(['transaction_time_iso', 'client_name', 'amount', 'transaction_type', 'group_name', 'mosad_number']);
const SORT_COLUMN_MAP = { transaction_time_iso: 'transaction_time_parsed' };

function applyFilters(query, { mosad_number, transaction_type, group_name, date_from, date_to, search }) {
  if (mosad_number)     query = query.eq('mosad_number', mosad_number);
  if (transaction_type) query = query.eq('transaction_type', transaction_type);
  if (group_name)       query = query.eq('group_name', group_name);
  if (date_from)        query = query.gte('transaction_time_parsed', date_from);
  if (date_to)          query = query.lte('transaction_time_parsed', date_to + 'T23:59:59');
  if (search) {
    const orClause = ilikeOr(['client_name', 'phone', 'email', 'external_transaction_id'], search);
    if (orClause) query = query.or(orClause);
  }
  return query;
}

// Distinct filter values change rarely, so cache them briefly at the module
// level (the cache survives across warm serverless invocations) instead of
// scanning the whole transactions table on every page load.
let filterOptionsCache = { data: null, expires: 0 };
const FILTER_OPTIONS_TTL_MS = 5 * 60 * 1000;

async function handleFilters(_req, res, supabase) {
  if (filterOptionsCache.data && filterOptionsCache.expires > Date.now()) {
    return res.json(filterOptionsCache.data);
  }

  const [typesRes, groupsRes] = await Promise.all([
    supabase.from('transactions').select('transaction_type').not('transaction_type', 'is', null),
    supabase.from('transactions').select('group_name').not('group_name', 'is', null),
  ]);
  if (typesRes.error) return res.status(500).json({ error: typesRes.error.message });
  if (groupsRes.error) return res.status(500).json({ error: groupsRes.error.message });

  const payload = {
    transaction_types: [...new Set(typesRes.data.map((r) => r.transaction_type))].sort(),
    group_names:       [...new Set(groupsRes.data.map((r) => r.group_name))].sort(),
  };
  filterOptionsCache = { data: payload, expires: Date.now() + FILTER_OPTIONS_TTL_MS };
  return res.json(payload);
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const supabase = getSupabase();
    const user = await requireUser(req, res, supabase);
    if (!user) return;

    const { action, page = 1, sort_by = 'transaction_time_iso', sort_dir = 'desc', ...filters } = req.query;

    if (action === 'filters') return await handleFilters(req, res, supabase);

    const offset = (parseInt(page) - 1) * PAGE_SIZE;
    const sortField = SORTABLE.has(sort_by) ? sort_by : 'transaction_time_iso';
    const column = SORT_COLUMN_MAP[sortField] ?? sortField;

    let query = supabase
      .from('transactions_with_parsed_time')
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
