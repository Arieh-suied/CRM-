import { Router } from 'express';
import supabase from '../supabaseClient.js';

const router = Router();

const PAGE_SIZE = 50;

function applyFilters(query, { mosad_number, transaction_type, group_name, date_from, date_to, search }) {
  if (mosad_number) query = query.eq('mosad_number', mosad_number);
  if (transaction_type) query = query.eq('transaction_type', transaction_type);
  if (group_name) query = query.eq('group_name', group_name);
  if (date_from) query = query.gte('transaction_time_parsed', date_from);
  if (date_to) query = query.lte('transaction_time_parsed', date_to + 'T23:59:59');
  if (search) {
    query = query.or(
      `client_name.ilike.%${search}%,phone.ilike.%${search}%,email.ilike.%${search}%,external_transaction_id.ilike.%${search}%`
    );
  }
  return query;
}

// Supabase caps each request at 1000 rows, so a single select over the whole
// table silently misses values — page through and collect distinct non-empty ones.
async function fetchDistinct(column) {
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

async function getFilterOptions() {
  const [transaction_types, group_names] = await Promise.all([
    fetchDistinct('transaction_type'),
    fetchDistinct('group_name'),
  ]);
  return { transaction_types, group_names };
}

const SORTABLE_COLUMNS = new Set([
  'transaction_time_iso', 'client_name', 'amount',
  'transaction_type', 'group_name', 'mosad_number',
]);
const SORT_COLUMN_MAP = { transaction_time_iso: 'transaction_time_parsed' };

router.get('/', async (req, res) => {
  const { action, page = 1, sort_by = 'transaction_time_iso', sort_dir = 'desc', ...filters } = req.query;

  // ?action=summary
  if (action === 'summary') {
    let q = supabase.from('transactions_with_parsed_time').select('amount, mosad_number, transaction_time_parsed');
    q = applyFilters(q, filters);
    const { data, error } = await q;
    if (error) return res.status(500).json({ error: error.message });

    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();
    const byInstitution = {};
    let monthlyTotal = 0, yearlyTotal = 0;

    for (const row of data) {
      const amt = parseFloat(row.amount) || 0;
      const key = row.mosad_number || '__unknown__';
      if (row.transaction_time_parsed) {
        const d = new Date(row.transaction_time_parsed);
        if (d.getFullYear() === currentYear) {
          yearlyTotal += amt;
          if (d.getMonth() === currentMonth) {
            monthlyTotal += amt;
            byInstitution[key] = (byInstitution[key] || 0) + amt;
          }
        }
      }
    }

    return res.json({
      institutionBreakdown: Object.entries(byInstitution)
        .map(([mosad_number, total]) => ({ mosad_number, total }))
        .sort((a, b) => b.total - a.total),
      monthlyTotal,
      yearlyTotal,
    });
  }

  // ?action=filters
  if (action === 'filters') {
    try {
      return res.json(await getFilterOptions());
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  const offset = (parseInt(page) - 1) * PAGE_SIZE;
  const sortField = SORTABLE_COLUMNS.has(sort_by) ? sort_by : 'transaction_time_iso';
  const column = SORT_COLUMN_MAP[sortField] ?? sortField;

  let query = supabase
    .from('transactions_with_parsed_time')
    .select('*', { count: 'exact' })
    .order(column, { ascending: sort_dir === 'asc' })
    .range(offset, offset + PAGE_SIZE - 1);

  query = applyFilters(query, filters);

  const { data, error, count } = await query;
  if (error) return res.status(500).json({ error: error.message });

  res.json({
    data,
    total: count,
    page: parseInt(page),
    pageSize: PAGE_SIZE,
    totalPages: Math.ceil(count / PAGE_SIZE),
  });
});

router.get('/summary', async (req, res) => {
  let query = supabase
    .from('transactions_with_parsed_time')
    .select('amount, mosad_number, transaction_time_parsed');

  query = applyFilters(query, req.query);

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();

  const byInstitution = {};
  let monthlyTotal = 0;
  let yearlyTotal = 0;

  for (const row of data) {
    const amt = parseFloat(row.amount) || 0;
    const key = row.mosad_number || '__unknown__';

    if (row.transaction_time_parsed) {
      const d = new Date(row.transaction_time_parsed);
      if (d.getFullYear() === currentYear) {
        yearlyTotal += amt;
        if (d.getMonth() === currentMonth) {
          monthlyTotal += amt;
          byInstitution[key] = (byInstitution[key] || 0) + amt;
        }
      }
    }
  }

  const institutionBreakdown = Object.entries(byInstitution)
    .map(([mosad_number, total]) => ({ mosad_number, total }))
    .sort((a, b) => b.total - a.total);

  res.json({ institutionBreakdown, monthlyTotal, yearlyTotal });
});

router.get('/filters', async (_req, res) => {
  try {
    res.json(await getFilterOptions());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
