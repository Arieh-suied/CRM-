// Server-side row scoping for the institution portal (see _auth.js's
// INSTITUTION_READ_ROLES). allowedMosadim/allowedGroupNames come from the
// caller's allowed_users row — null means "no restriction on this dimension"
// (used by staff roles, who always pass null for both).

// Applies mosad_number / group_name restrictions to a Supabase query builder.
// Call after any client-supplied filters so an institution caller can't widen
// their own scope via a query param.
export function applyScope(query, user, { mosadCol = 'mosad_number', groupCol = 'group_name' } = {}) {
  if (user.allowedMosadim?.length) query = query.in(mosadCol, user.allowedMosadim);
  if (user.allowedGroupNames?.length) query = query.in(groupCol, user.allowedGroupNames);
  return query;
}

// payment_failures rows carry a free-text institution_name (parsed from the
// refusal email), not mosad_number — resolve the caller's allowed mosad
// numbers to their institution name(s) so the same allowed_mosadim scoping
// can be applied there via `.in('institution_name', names)`.
export async function resolveInstitutionNames(supabase, mosadNumbers) {
  if (!mosadNumbers?.length) return [];
  const { data } = await supabase
    .from('institutions')
    .select('mosad_name')
    .in('mosad_number', mosadNumbers);
  return (data ?? []).map((r) => r.mosad_name).filter(Boolean);
}

// standing-orders.js / bank-orders.js proxy Nedarim's live GetKevaNew /
// GetMasavKevaNew responses as-is — a DataTables-shaped { data: [...] }
// where each row is a numeric-string-keyed object (row['5'] etc, no named
// fields). Nedarim has no per-category filter on these actions, so a
// sub-fund-scoped caller (allowed_group_names set) must be filtered
// in-memory by the category column, or they'd see every other fund's donor
// details (name, bank account, phone) under the same mosad.
export function filterRowsByColumn(rows, colIndex, allowedValues) {
  if (!allowedValues?.length) return rows;
  return (rows ?? []).filter((row) => allowedValues.includes(row[String(colIndex)]));
}
