import { getSupabase } from './_supabase.js';

const PAGE_SIZE = 50;
const SORTABLE = new Set(['transaction_time_iso', 'client_name', 'amount', 'transaction_type', 'group_name', 'mosad_number']);

function applyFilters(query, { mosad_number, transaction_type, group_name, search }) {
  if (mosad_number)     query = query.eq('mosad_number', mosad_number);
  if (transaction_type) query = query.eq('transaction_type', transaction_type);
  if (group_name)       query = query.eq('group_name', group_name);
  if (search)           query = query.or(`client_name.ilike.%${search}%,phone.ilike.%${search}%,email.ilike.%${search}%,external_transaction_id.ilike.%${search}%`);
  return query;
}

const FETCH_CHUNK = 1000; // PostgREST default row cap per request

// Supabase/PostgREST caps a single response at 1000 rows — page through
// with .range() until we've collected every matching row.
async function fetchAll(buildQuery) {
  const rows = [];
  for (let offset = 0; ; offset += FETCH_CHUNK) {
    const { data, error } = await buildQuery().order('id', { ascending: true }).range(offset, offset + FETCH_CHUNK - 1);
    if (error) throw error;
    rows.push(...data);
    if (data.length < FETCH_CHUNK) break;
  }
  return rows;
}

// transaction_time_raw is stored as text 'DD/MM/YYYY HH:MM:SS' and is the
// column actually populated for every row (transaction_time_iso is often null).
function parseTransactionDate(row) {
  const raw = row.transaction_time_raw;
  if (!raw) return null;
  const [datePart, timePart = '00:00:00'] = raw.split(' ');
  const [day, month, year] = datePart.split('/').map(Number);
  const [hh = 0, mm = 0, ss = 0] = timePart.split(':').map(Number);
  if (!day || !month || !year) return null;
  return new Date(year, month - 1, day, hh, mm, ss);
}

function inDateRange(date, date_from, date_to) {
  if (!date) return false;
  if (date_from && date < new Date(`${date_from}T00:00:00`)) return false;
  if (date_to && date > new Date(`${date_to}T23:59:59`)) return false;
  return true;
}

function buildSummary(rows) {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();
  const byInstitution = {};
  let monthlyTotal = 0, yearlyTotal = 0;

  for (const row of rows) {
    const amt = parseFloat(row.amount) || 0;
    const key = row.mosad_number || '__unknown__';
    const d = parseTransactionDate(row);
    if (d && d.getFullYear() === currentYear) {
      yearlyTotal += amt;
      if (d.getMonth() === currentMonth) {
        monthlyTotal += amt;
        byInstitution[key] = (byInstitution[key] || 0) + amt;
      }
    }
  }

  return {
    institutionBreakdown: Object.entries(byInstitution)
      .map(([mosad_number, total]) => ({ mosad_number, total }))
      .sort((a, b) => b.total - a.total),
    monthlyTotal,
    yearlyTotal,
  };
}

async function handleSummary(req, res, supabase) {
  const { date_from, date_to, ...filters } = req.query;
  let data;
  try {
    data = await fetchAll(() => applyFilters(supabase.from('transactions').select('amount, mosad_number, transaction_time_raw'), filters));
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }

  const rows = date_from || date_to
    ? data.filter((row) => inDateRange(parseTransactionDate(row), date_from, date_to))
    : data;

  return res.json(buildSummary(rows));
}

async function handleFilters(_req, res, supabase) {
  const [typesRes, groupsRes] = await Promise.all([
    supabase.from('transactions').select('transaction_type').not('transaction_type', 'is', null),
    supabase.from('transactions').select('group_name').not('group_name', 'is', null),
  ]);
  if (typesRes.error) return res.status(500).json({ error: typesRes.error.message });
  if (groupsRes.error) return res.status(500).json({ error: groupsRes.error.message });

  return res.json({
    transaction_types: [...new Set(typesRes.data.map((r) => r.transaction_type))].sort(),
    group_names:       [...new Set(groupsRes.data.map((r) => r.group_name))].sort(),
  });
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const supabase = getSupabase();
    const { action, page = 1, sort_by = 'transaction_time_iso', sort_dir = 'desc', date_from, date_to, ...filters } = req.query;

    if (action === 'summary') return await handleSummary(req, res, supabase);
    if (action === 'filters') return await handleFilters(req, res, supabase);

    let data;
    try {
      data = await fetchAll(() => applyFilters(supabase.from('transactions').select('*'), filters));
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }

    let rows = data.map((row) => ({ ...row, _date: parseTransactionDate(row) }));
    if (date_from || date_to) rows = rows.filter((row) => inDateRange(row._date, date_from, date_to));

    const sortByDate = !SORTABLE.has(sort_by) || sort_by === 'transaction_time_iso';
    rows.sort((a, b) => {
      let cmp;
      if (sortByDate) cmp = (a._date?.getTime() || 0) - (b._date?.getTime() || 0);
      else if (sort_by === 'amount') cmp = (parseFloat(a.amount) || 0) - (parseFloat(b.amount) || 0);
      else cmp = String(a[sort_by] ?? '').localeCompare(String(b[sort_by] ?? ''));
      return sort_dir === 'asc' ? cmp : -cmp;
    });

    const total = rows.length;
    const offset = (parseInt(page) - 1) * PAGE_SIZE;
    const pageRows = rows.slice(offset, offset + PAGE_SIZE).map(({ _date, ...r }) => r);

    res.json({ data: pageRows, total, page: parseInt(page), pageSize: PAGE_SIZE, totalPages: Math.ceil(total / PAGE_SIZE) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
