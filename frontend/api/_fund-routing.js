// Fund routing — reads rules from the `funds` table (see
// supabase/migrations/20260626000000_funds_table.sql) instead of a static
// list, so creating a fund from the CRM UI takes effect immediately.

function getField(row, field) {
  return row?.[field] ?? '';
}

function evalCondition(row, cond) {
  const value = String(getField(row, cond.field) || '');
  const target = cond.value;
  if (cond.op === 'eq') return value.trim() === target;
  if (cond.op === 'contains') return value.includes(target);
  if (cond.op === 'not_contains') return !value.includes(target);
  return false;
}

function matchesRules(row, matchRules) {
  // match_rules is an array of OR-groups; each group is an array of AND-conditions.
  return matchRules.some((group) => group.every((cond) => evalCondition(row, cond)));
}

function fee(amount, pct, mult) {
  const n = Number(amount) || 0;
  if (!pct) return n;
  return Math.round((n - n * pct * mult) * 100) / 100;
}

function buildRowValues(row, columns) {
  return columns.map((col) => {
    switch (col.type) {
      case 'date': return row.transaction_time_raw;
      case 'name': return row.client_name;
      case 'comments': return row.comments;
      case 'group_name': return row.group_name;
      case 'literal': return col.text;
      case 'amount': return fee(row.amount, col.fee_pct, col.fee_mult);
      default: return '';
    }
  });
}

export async function getMatchingFundRules(supabase, row) {
  const { data, error } = await supabase.from('funds').select('*');
  if (error || !data) return [];
  return data
    .filter((fund) => {
      try {
        return matchesRules(row, fund.match_rules);
      } catch {
        return false;
      }
    })
    .map((fund) => ({
      id: fund.id,
      name: fund.name,
      spreadsheetId: fund.spreadsheet_id,
      sheetName: fund.sheet_name,
      buildRow: (r) => buildRowValues(r, fund.columns),
    }));
}
