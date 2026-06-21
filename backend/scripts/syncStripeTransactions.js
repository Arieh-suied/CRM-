import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../.env') });

import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

function ts(unix) {
  if (!unix) return null;
  return new Date(unix * 1000).toISOString();
}

function strId(v) {
  if (!v) return null;
  return typeof v === 'string' ? v : v.id ?? null;
}

function upper(v) {
  return (v ?? 'ILS').toUpperCase();
}

function mapCharge(charge) {
  const billing = charge.billing_details ?? {};
  const meta    = charge.metadata ?? {};
  return {
    stripe_charge_id:         charge.id,
    stripe_payment_intent_id: strId(charge.payment_intent),
    stripe_customer_id:       strId(charge.customer),
    donor_email:              billing.email ?? charge.receipt_email ?? null,
    donor_name:               billing.name  ?? meta.donor_name      ?? null,
    donor_phone:              billing.phone ?? meta.donor_phone      ?? null,
    amount:                   charge.amount / 100,
    currency:                 upper(charge.currency),
    status:                   charge.status,
    donation_source:          'stripe',
    institution_name:         meta.institution_name ?? null,
    receipt_type:             meta.receipt_type     ?? null,
    raw_payment:              charge,
    paid_at:                  ts(charge.created),
  };
}

async function main() {
  const apiKey = process.env.STRIPE_API_KEY;
  if (!apiKey) { console.error('❌ STRIPE_API_KEY חסר ב-.env'); process.exit(1); }

  const stripe   = new Stripe(apiKey);
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

  const yearStart = Math.floor(new Date(new Date().getFullYear(), 0, 1).getTime() / 1000);

  console.log(`🔄 מייבא עסקאות מ-${new Date().getFullYear()} (מ-Stripe)...\n`);

  let charges = [];
  let startingAfter;

  while (true) {
    const page = await stripe.charges.list({
      limit: 100,
      created: { gte: yearStart },
      ...(startingAfter && { starting_after: startingAfter }),
    });

    charges.push(...page.data);
    process.stdout.write(`  הובאו ${charges.length} עסקאות...\r`);

    if (!page.has_more) break;
    startingAfter = page.data.at(-1).id;
  }

  console.log(`\nסה"כ ${charges.length} עסקאות. שומר ל-Supabase...\n`);

  let inserted = 0, errors = 0;

  // Process in batches of 50
  for (let i = 0; i < charges.length; i += 50) {
    const batch = charges.slice(i, i + 50).map(mapCharge);

    const { error } = await supabase
      .from('stripe_donations')
      .upsert(batch, { onConflict: 'stripe_charge_id', ignoreDuplicates: true });

    if (error) {
      console.error(`  ✗ שגיאה בbatch ${i / 50 + 1}: ${error.message}`);
      errors += batch.length;
    } else {
      inserted += batch.length;
      process.stdout.write(`  ✓ ${inserted} / ${charges.length} נשמרו\r`);
    }
  }

  console.log('\n\n══════════════════════════════');
  console.log('✅ ייבוא הסתיים');
  console.log(`   עסקאות שנוספו/עודכנו: ${inserted}`);
  console.log(`   שגיאות:                ${errors}`);
  console.log('══════════════════════════════\n');
}

main().catch((err) => {
  console.error('שגיאה קריטית:', err.message);
  process.exit(1);
});
