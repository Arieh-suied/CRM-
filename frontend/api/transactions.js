import { getSupabase } from './_supabase.js';

const PAGE_SIZE = 50;
const SORTABLE = new Set(['transaction_time_iso', 'client_name', 'amount', 'transaction_type', 'group_name', 'mosad_number']);

function applyFilters(query, { mosad_number, transaction_type, group_name, date_from, date_to, search }) {
  if (mosad_number)     query = query.eq('mosad_number', mosad_number);
  if (transaction_type) query = query.eq('transaction_type', transaction_type);
  if (group_name)       query = query.eq('group_name', group_name);
  if (date_from)        query = query.gte('transaction_time_iso', date_from);
  if (date_to)          query = query.lte('transaction_time_iso', date_to + 'T23:59:59');
  if (search)           query = query.or(`client_name.ilike.%${search}%,phone.ilike.%${search}%,email.ilike.%${search}%,external_transaction_id.ilike.%${search}%`);
  return query;
}

async function handleSummary(req, res, supabase) {
  let query = supabase.from('transactions').select('amount, mosad_number, transaction_time_iso');
  query = applyFilters(query, req.query);
  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();
  const byInstitution = {};
  let monthlyTotal = 0, yearlyTotal = 0;

  for (const row of data) {
    const amt = parseFloat(row.amount) || 0;
    const key = row.mosad_number || '__unknown__';
    if (row.transaction_time_iso) {
      const d = new Date(row.transaction_time_iso);
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

  return res.json({ institutionBreakdown, monthlyTotal, yearlyTotal });
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
    const { action, page = 1, sort_by = 'transaction_time_iso', sort_dir = 'desc', ...filters } = req.query;

    if (action === 'summary') return await handleSummary(req, res, supabase);
    if (action === 'filters') return await handleFilters(req, res, supabase);

    const offset = (parseInt(page) - 1) * PAGE_SIZE;
    const column = SORTABLE.has(sort_by) ? sort_by : 'transaction_time_iso';

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
