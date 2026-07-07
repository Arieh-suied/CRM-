import { createClient } from '@supabase/supabase-js';

export function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing Supabase env vars');
  return createClient(url, key);
}

// Pages through a query in 1000-row chunks (Supabase caps each request at
// 1000 rows), for export endpoints that need every matching row. buildQuery
// must return a fresh query on each call — Supabase builders are single-use.
// Capped so an export can't scan a huge table forever.
export async function fetchAll(buildQuery, cap = 20000) {
  const CHUNK = 1000;
  const rows = [];
  for (let from = 0; from < cap; from += CHUNK) {
    const { data, error } = await buildQuery().range(from, from + CHUNK - 1);
    if (error) throw new Error(error.message);
    rows.push(...(data ?? []));
    if (!data || data.length < CHUNK) break;
  }
  return rows;
}

// Builds a safe PostgREST `.or()` clause for a free-text search across several
// columns. User input is stripped of the characters PostgREST treats as filter
// syntax ( , ( ) ) and of LIKE wildcards ( % * \ ), so a value like
// "a,phone.not.is.null" can't break out of the ilike expression and inject
// extra conditions. Returns null when there's nothing to search for.
export function ilikeOr(columns, search) {
  const clean = String(search ?? '').replace(/[,()*\\%]/g, ' ').trim();
  if (!clean) return null;
  return columns.map((c) => `${c}.ilike.%${clean}%`).join(',');
}
