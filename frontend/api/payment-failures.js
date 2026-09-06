import { getSupabase, ilikeOr, fetchAll } from './_supabase.js';
import { requireUser, WRITE_ROLES, INSTITUTION_READ_ROLES } from './_auth.js';
import { resolveInstitutionNames } from './_scope.js';
import { isSomechName, isYeshivotName, isToldotNisimName } from './_transaction-notify.js';

import { withErrorAlert } from './_error-alert.js';
const PAGE_SIZE = 25;
const SORTABLE = new Set([
  'created_at', 'institution_name', 'customer_name', 'customer_id_number',
  'amount', 'error_reason', 'order_number',
]);

// payment_failures.institution_name is free text parsed from the refusal
// email and doesn't always match institutions.mosad_name exactly — e.g.
// Toldot Nisim's refusal emails read "Toldot Nissim - תולדות נסים". Widen
// the exact institutions.mosad_name match using the same bucket matchers
// _transaction-notify.js uses for routing, but only for the bucket the
// caller's own resolved mosad name(s) actually fall into — a fund's
// `category` can coincidentally repeat across unrelated institutions (e.g.
// "יחי ראובן" also exists as a category under an entirely unrelated
// institution), so this still must be AND'd with the category filter by the
// caller, never relied on alone.
function bucketMatcher(mosadName) {
  if (isSomechName(mosadName)) return isSomechName;
  if (isYeshivotName(mosadName)) return isYeshivotName;
  if (isToldotNisimName(mosadName)) return isToldotNisimName;
  return null;
}

async function expandInstitutionNames(supabase, exactNames) {
  const matchers = exactNames.map(bucketMatcher).filter(Boolean);
  if (!matchers.length) return exactNames;
  const { data } = await supabase.from('payment_failures').select('institution_name').not('institution_name', 'is', null);
  const expanded = new Set(exactNames);
  for (const row of data ?? []) {
    if (matchers.some((m) => m(row.institution_name))) expanded.add(row.institution_name);
  }
  return [...expanded];
}

// Distinct institution names change rarely — cache at module level (survives
// warm serverless invocations) instead of scanning the table on every load.
let institutionsCache = { data: null, expires: 0 };
const INSTITUTIONS_TTL_MS = 5 * 60 * 1000;

async function handleInstitutions(res, supabase, allowedNames) {
  // Scoped callers (role='institution') never see the shared unscoped cache.
  if (!allowedNames) {
    if (institutionsCache.data && institutionsCache.expires > Date.now()) {
      return res.json(institutionsCache.data);
    }
  }
  const rows = await fetchAll(() =>
    supabase.from('payment_failures').select('institution_name').not('institution_name', 'is', null)
  );
  let names = [...new Set(rows.map((r) => r.institution_name).filter(Boolean))].sort();
  if (allowedNames) names = names.filter((n) => allowedNames.includes(n));
  const payload = { data: names };
  if (!allowedNames) institutionsCache = { data: payload, expires: Date.now() + INSTITUTIONS_TTL_MS };
  res.json(payload);
}

// Roles allowed to mark a refusal resolved: staff writers, plus the
// institution role itself (its own scope only — checked below), since
// following up on a refusal is exactly what an institution owner does here.
const RESOLVE_ROLES = [...WRITE_ROLES, 'institution'];

async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'PUT') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const supabase = getSupabase();
    const user = await requireUser(req, res, supabase, { roles: req.method === 'GET' ? INSTITUTION_READ_ROLES : RESOLVE_ROLES });
    if (!user) return;

    // payment_failures rows carry a free-text institution_name/category
    // (parsed from the refusal email), not mosad_number — resolve the
    // caller's allowed mosadim to institution name(s) to scope by. Always
    // computed (even when the caller is also category-scoped) — a
    // category value like "יחי ראובן" isn't guaranteed unique across
    // institutions, so both filters are required together, never category alone.
    const allowedNames = user.allowedMosadim?.length
      ? await expandInstitutionNames(supabase, await resolveInstitutionNames(supabase, user.allowedMosadim))
      : null;

    // Both filters apply together when both are set: institution_name
    // narrows to the caller's own institution (widened for known label
    // variants), and category further narrows to their specific sub-fund
    // when they're scoped to one (e.g. יחי ראובן under סומך נופלים).
    const applyOwnerScope = (query) => {
      if (allowedNames) query = query.in('institution_name', allowedNames);
      if (user.allowedGroupNames?.length) query = query.in('category', user.allowedGroupNames);
      return query;
    };

    if (req.method === 'PUT') {
      const { id } = req.query;
      const { resolved } = req.body ?? {};
      if (!id || typeof resolved !== 'boolean') return res.status(400).json({ error: 'id and resolved (boolean) are required' });

      // An institution caller may only resolve rows within their own scope —
      // staff (admin/editor) can resolve any row, matching their GET access.
      if (user.role === 'institution') {
        const { data: owned } = await applyOwnerScope(supabase.from('payment_failures').select('id').eq('id', id)).maybeSingle();
        if (!owned) return res.status(403).json({ error: 'אין לך הרשאה לעדכן שורה זו' });
      }

      const { data, error } = await supabase
        .from('payment_failures')
        .update({ resolved, resolved_at: resolved ? new Date().toISOString() : null })
        .eq('id', id)
        .select()
        .single();
      if (error) return res.status(500).json({ error: error.message });
      return res.json(data);
    }

    const {
      action, page = 1, search, institution, date_from, date_to, resolved,
      sort_by = 'created_at', sort_dir = 'desc', all,
    } = req.query;

    if (action === 'institutions') return await handleInstitutions(res, supabase, allowedNames);

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
      if (resolved === 'true' || resolved === 'false') query = query.eq('resolved', resolved === 'true');
      if (search) {
        const orClause = ilikeOr(['customer_name', 'institution_name', 'order_number', 'donor_email'], search);
        if (orClause) query = query.or(orClause);
      }
      return applyOwnerScope(query);
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

export default withErrorAlert(handler, 'payment-failures');
