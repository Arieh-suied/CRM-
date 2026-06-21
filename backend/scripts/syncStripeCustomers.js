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

async function fetchAll(stripe, status) {
  const results = [];
  let startingAfter;

  while (true) {
    const page = await stripe.subscriptions.list({
      status,
      limit: 100,
      expand: ['data.customer'],
      ...(startingAfter && { starting_after: startingAfter }),
    });

    results.push(...page.data);
    process.stdout.write(`  [${status}] ${results.length} מנויים\r`);

    if (!page.has_more) break;
    startingAfter = page.data.at(-1).id;
  }

  return results;
}

async function main() {
  const apiKey = process.env.STRIPE_API_KEY;
  if (!apiKey) {
    console.error('❌ STRIPE_API_KEY חסר ב-.env');
    process.exit(1);
  }

  const stripe   = new Stripe(apiKey);
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
  );

  console.log('🔄 מתחיל סנכרון לקוחות ומנויים פעילים מ-Stripe...\n');

  const subscriptions = [
    ...await fetchAll(stripe, 'active'),
    ...await fetchAll(stripe, 'trialing'),
  ];

  console.log(`\nסה"כ ${subscriptions.length} מנויים. שומר ל-Supabase...\n`);

  let customersCount = 0, subscriptionsCount = 0, errors = 0;

  for (const sub of subscriptions) {
    const customer = sub.customer;

    if (!customer || typeof customer === 'string') {
      console.warn(`  ⚠️  customer לא הורחב עבור subscription ${sub.id}`);
      errors++;
      continue;
    }

    try {
      const { error: ce } = await supabase.from('stripe_customers').upsert({
        stripe_customer_id: customer.id,
        email:              customer.email    ?? null,
        name:               customer.name     ?? null,
        phone:              customer.phone    ?? null,
        is_active:          true,
        customer_status:    sub.status,
        default_currency:   customer.currency?.toUpperCase() ?? null,
        raw_customer:       customer,
        updated_at:         new Date().toISOString(),
      }, { onConflict: 'stripe_customer_id' });

      if (ce) throw new Error(ce.message);
      customersCount++;

      const item      = sub.items.data[0];
      const productId = item?.price?.product;

      const { error: se } = await supabase.from('stripe_subscriptions').upsert({
        stripe_subscription_id: sub.id,
        stripe_customer_id:     customer.id,
        status:                 sub.status,
        price_id:               item?.price?.id ?? null,
        product_id:             typeof productId === 'string' ? productId : productId?.id ?? null,
        current_period_start:   ts(sub.current_period_start),
        current_period_end:     ts(sub.current_period_end),
        cancel_at_period_end:   sub.cancel_at_period_end,
        raw_subscription:       sub,
        updated_at:             new Date().toISOString(),
      }, { onConflict: 'stripe_subscription_id' });

      if (se) throw new Error(se.message);
      subscriptionsCount++;

    } catch (err) {
      console.error(`  ✗ שגיאה (${customer.id}): ${err.message}`);
      errors++;
    }
  }

  console.log('\n══════════════════════════════');
  console.log('✅ סנכרון הסתיים');
  console.log(`   לקוחות שנוספו/עודכנו:  ${customersCount}`);
  console.log(`   מנויים שנוספו/עודכנו:   ${subscriptionsCount}`);
  console.log(`   שגיאות:                  ${errors}`);
  console.log('══════════════════════════════\n');
}

main().catch((err) => {
  console.error('שגיאה קריטית:', err.message);
  process.exit(1);
});
