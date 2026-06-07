import Stripe from 'https://esm.sh/stripe@14.21.0?target=deno&no-check';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', {
  apiVersion: '2023-10-16',
  httpClient: Stripe.createFetchHttpClient(),
});

const supabase = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
);

function ts(unix: number): string {
  return new Date(unix * 1000).toISOString();
}

async function fetchAll(status: 'active' | 'trialing'): Promise<Stripe.Subscription[]> {
  const results: Stripe.Subscription[] = [];
  let startingAfter: string | undefined;

  while (true) {
    const page = await stripe.subscriptions.list({
      status,
      limit: 100,
      expand: ['data.customer'],
      ...(startingAfter && { starting_after: startingAfter }),
    });
    results.push(...page.data);
    if (!page.has_more) break;
    startingAfter = page.data.at(-1)?.id;
  }
  return results;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  let customersCount     = 0;
  let subscriptionsCount = 0;
  const errors: string[] = [];

  const subscriptions = [
    ...await fetchAll('active'),
    ...await fetchAll('trialing'),
  ];

  for (const sub of subscriptions) {
    const customer = sub.customer as Stripe.Customer;
    if (!customer || typeof customer === 'string') {
      errors.push(`Missing expanded customer for subscription ${sub.id}`);
      continue;
    }

    try {
      await supabase.from('stripe_customers').upsert({
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
      customersCount++;

      const item      = sub.items.data[0];
      const productId = item?.price?.product;

      await supabase.from('stripe_subscriptions').upsert({
        stripe_subscription_id: sub.id,
        stripe_customer_id:     customer.id,
        status:                 sub.status,
        price_id:               item?.price?.id ?? null,
        product_id:             typeof productId === 'string' ? productId : (productId as any)?.id ?? null,
        current_period_start:   ts(sub.current_period_start),
        current_period_end:     ts(sub.current_period_end),
        cancel_at_period_end:   sub.cancel_at_period_end,
        raw_subscription:       sub,
        updated_at:             new Date().toISOString(),
      }, { onConflict: 'stripe_subscription_id' });
      subscriptionsCount++;

    } catch (err) {
      errors.push(`${customer.id}: ${err.message}`);
    }
  }

  return new Response(JSON.stringify({
    success:            true,
    customersUpdated:   customersCount,
    subscriptionsUpdated: subscriptionsCount,
    errorCount:         errors.length,
    errors:             errors.slice(0, 20),
  }), { headers: { 'Content-Type': 'application/json' } });
});
