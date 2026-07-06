import { createClient } from '@supabase/supabase-js';

export function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing Supabase env vars');
  return createClient(url, key);
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
