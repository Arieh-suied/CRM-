import { getSupabase, ilikeOr, fetchAll } from './_supabase.js';
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

// Supabase caps each request at 1000 rows, so a single select over the whole
// table silently misses values — page through and collect distinct non-empty ones.
async function fetchDistinct(supabase, column) {
  const CHUNK = 1000;
  const values = new Set();
  for (let from = 0; ; from += CHUNK) {
    const { data, error } = await supabase
      .from('transactions')
      .select(column)
      .not(column, 'is', null)
      .neq(column, '')
      .range(from, from + CHUNK - 1);
    if (error) throw new Error(error.message);
    for (const row of data) {
      const v = row[column];
      if (v && v.trim()) values.add(v);
    }
    if (data.length < CHUNK) break;
  }
  return [...values].sort();
}

async function handleFilters(_req, res, supabase) {
  if (filterOptionsCache.data && filterOptionsCache.expires > Date.now()) {
    return res.json(filterOptionsCache.data);
  }

  const [transaction_types, group_names] = await Promise.all([
    fetchDistinct(supabase, 'transaction_type'),
    fetchDistinct(supabase, 'group_name'),
  ]);

  const payload = { transaction_types, group_names };
  filterOptionsCache = { data: payload, expires: Date.now() + FILTER_OPTIONS_TTL_MS };
  return res.json(payload);
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const supabase = getSupabase();
    const user = await requireUser(req, res, supabase);
    if (!user) return;

    const { action, page = 1, sort_by = 'transaction_time_iso', sort_dir = 'desc', all, ...filters } = req.query;

    if (action === 'filters') return await handleFilters(req, res, supabase);

    const offset = (parseInt(page) - 1) * PAGE_SIZE;
    const sortField = SORTABLE.has(sort_by) ? sort_by : 'transaction_time_iso';
    const column = SORT_COLUMN_MAP[sortField] ?? sortField;

    // all=1 → every matching row, for the Excel export
    if (all) {
      const rows = await fetchAll(() => applyFilters(
        supabase
          .from('transactions_with_parsed_time')
          .select('*')
          .order(column, { ascending: sort_dir === 'asc' }),
        filters
      ));
      return res.json({ data: rows, total: rows.length });
    }

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
