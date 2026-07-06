// Normalizes group_name values in the transactions table:
//   - trims leading/trailing whitespace
//   - collapses repeated inner whitespace to a single space
// Values that become identical after normalization are merged into one.
//
// Usage:
//   node scripts/cleanGroupNames.js           # dry-run: show what would change
//   node scripts/cleanGroupNames.js --apply   # actually update the rows

import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../.env') });

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const APPLY = process.argv.includes('--apply');

const normalize = (s) => s.trim().replace(/\s+/g, ' ');

async function fetchDistinctGroupNames() {
  const CHUNK = 1000;
  const values = new Set();
  for (let from = 0; ; from += CHUNK) {
    const { data, error } = await supabase
      .from('transactions')
      .select('group_name')
      .not('group_name', 'is', null)
      .neq('group_name', '')
      .range(from, from + CHUNK - 1);
    if (error) throw new Error(error.message);
    for (const row of data) values.add(row.group_name);
    if (data.length < CHUNK) break;
  }
  return [...values];
}

const distinct = await fetchDistinctGroupNames();
const changes = distinct
  .map((original) => ({ original, normalized: normalize(original) }))
  .filter(({ original, normalized }) => normalized !== original);

if (changes.length === 0) {
  console.log('אין ערכים לניקוי — הכל כבר תקין.');
  process.exit(0);
}

// Show merges: normalized values that unify more than one original
const byNormalized = new Map();
for (const v of distinct) {
  const n = normalize(v);
  if (!byNormalized.has(n)) byNormalized.set(n, []);
  byNormalized.get(n).push(v);
}

console.log(`נמצאו ${changes.length} ערכים לניקוי (מתוך ${distinct.length} קבוצות):\n`);
let totalRows = 0;
for (const { original, normalized } of changes) {
  const { count, error } = await supabase
    .from('transactions')
    .select('id', { count: 'exact', head: true })
    .eq('group_name', original);
  if (error) throw new Error(error.message);
  totalRows += count;

  const mergesInto = byNormalized.get(normalized).length > 1 || distinct.includes(normalized);
  console.log(`${JSON.stringify(original)} → ${JSON.stringify(normalized)}  (${count} שורות${mergesInto ? ', יאוחד עם קבוצה קיימת' : ''})`);

  if (APPLY) {
    const { error: updErr } = await supabase
      .from('transactions')
      .update({ group_name: normalized })
      .eq('group_name', original);
    if (updErr) throw new Error(updErr.message);
  }
}

console.log(`\nסה"כ ${totalRows} שורות ${APPLY ? 'עודכנו' : 'יעודכנו'}.`);
if (!APPLY) console.log('זו הייתה הדמיה בלבד. להרצה אמיתית: node scripts/cleanGroupNames.js --apply');
