import { getSupabase, ilikeOr, fetchAll } from './_supabase.js';
import { requireUser } from './_auth.js';

const PAGE_SIZE = 25;
const SORTABLE = new Set([
  'created_at', 'institution_name', 'customer_name', 'customer_id_number',
  'amount', 'error_reason', 'order_number',
]);

// Distinct institution names change rarely — cache at module level (survives
// warm serverless invocations) instead of scanning the table on every load.
let institutionsCache = { data: null, expires: 0 };
const INSTITUTIONS_TTL_MS = 5 * 60 * 1000;

async function handleInstitutions(res, supabase) {
  if (institutionsCache.data && institutionsCache.expires > Date.now()) {
    return res.json(institutionsCache.data);
  }
  const rows = await fetchAll(() =>
    supabase.from('payment_failures').select('institution_name').not('institution_name', 'is', null)
  );
  const names = [...new Set(rows.map((r) => r.institution_name).filter(Boolean))].sort();
  const payload = { data: names };
  institutionsCache = { data: payload, expires: Date.now() + INSTITUTIONS_TTL_MS };
  res.json(payload);
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const supabase = getSupabase();
    const user = await requireUser(req, res, supabase);
    if (!user) return;

    const {
      action, page = 1, search, institution, date_from, date_to,
      sort_by = 'created_at', sort_dir = 'desc', all,
    } = req.query;

    if (action === 'institutions') return await handleInstitutions(res, supabase);

    const col = SORTABLE.has(sort_by) ? sort_by : 'created_at';
    const asc = sort_dir === 'asc';

    const buildQuery = (opts) => {
      let query = supabase
        .from('payment_failures')
        .select('*', opts)
        .order(col, { ascending: asc, nullsLast: true });
      if (institution) query = query.eq('institution_name', institution);
      if (date_from)   query = query.gte('created_at', date_from);
      if (date_to)     query = query.lte('created_at', date_to + 'T23:59:59');
      if (search) {
        const orClause = ilikeOr(['customer_name', 'institution_name', 'order_number', 'donor_email'], search);
        if (orClause) query = query.or(orClause);
      }
      return query;
    };

    // all=1 → every matching row, for the Excel export
    if (all) {
      const rows = await fetchAll(() => buildQuery());
      return res.json({ data: rows, total: rows.length });
    }

    const offset = (parseInt(page) - 1) * PAGE_SIZE;
    const { data, error, count } = await buildQuery({ count: 'exact' })
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) return res.status(500).json({ error: error.message });
    res.json({ data, total: count, totalPages: Math.ceil(count / PAGE_SIZE) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
