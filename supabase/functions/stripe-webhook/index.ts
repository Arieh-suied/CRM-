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

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  const signature = req.headers.get('stripe-signature');
  if (!signature) {
    return new Response('Missing stripe-signature header', { status: 400 });
  }

  const body = await req.text();

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(
      body,
      signature,
      Deno.env.get('STRIPE_WEBHOOK_SECRET') ?? ''
    );
  } catch (err) {
    console.error('Signature verification failed:', err.message);
    return new Response(`Webhook Error: ${err.message}`, { status: 400 });
  }

  // Idempotency — skip already-processed events
  const { data: existing } = await supabase
    .from('stripe_webhook_events')
    .select('id')
    .eq('stripe_event_id', event.id)
    .maybeSingle();

  if (existing) {
    return json({ received: true, skipped: true });
  }

  // Persist raw event
  await supabase.from('stripe_webhook_events').insert({
    stripe_event_id: event.id,
    event_type:      event.type,
    processed:       false,
    raw_event:       event,
  });

  try {
    await handleEvent(event);
    await supabase
      .from('stripe_webhook_events')
      .update({ processed: true })
      .eq('stripe_event_id', event.id);
  } catch (err) {
    console.error(`Error handling ${event.type}:`, err);
  }

  return json({ received: true });
});

// ── Router ──────────────────────────────────────────────────────────────────

async function handleEvent(event: Stripe.Event) {
  switch (event.type) {
    case 'checkout.session.completed':
      return handleCheckoutSession(event.data.object as Stripe.Checkout.Session, event);
    case 'payment_intent.succeeded':
      return handlePaymentIntentSucceeded(event.data.object as Stripe.PaymentIntent, event);
    case 'payment_intent.payment_failed':
      return handlePaymentIntentFailed(event.data.object as Stripe.PaymentIntent, event);
    case 'invoice.paid':
      return handleInvoicePaid(event.data.object as Stripe.Invoice, event);
    case 'customer.created':
    case 'customer.updated':
      return handleCustomer(event.data.object as Stripe.Customer);
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted':
      return handleSubscription(event.data.object as Stripe.Subscription);
  }
}

// ── Handlers ─────────────────────────────────────────────────────────────────

async function handleCheckoutSession(session: Stripe.Checkout.Session, event: Stripe.Event) {
  const meta = session.metadata ?? {};
  await supabase.from('stripe_donations').upsert({
    stripe_payment_intent_id:    strId(session.payment_intent),
    stripe_checkout_session_id:  session.id,
    stripe_customer_id:          strId(session.customer),
    donor_email:                 session.customer_details?.email ?? null,
    donor_name:                  session.customer_details?.name  ?? null,
    donor_phone:                 session.customer_details?.phone ?? null,
    amount:                      (session.amount_total ?? 0) / 100,
    currency:                    upper(session.currency),
    status:                      session.payment_status === 'paid' ? 'succeeded' : session.payment_status,
    donation_source:             'stripe',
    institution_name:            meta.institution_name ?? null,
    receipt_type:                meta.receipt_type     ?? null,
    raw_event:                   event,
    raw_payment:                 session,
    paid_at:                     ts(event.created),
  }, { onConflict: 'stripe_payment_intent_id' });
}

async function handlePaymentIntentSucceeded(pi: Stripe.PaymentIntent, event: Stripe.Event) {
  const meta     = pi.metadata ?? {};
  const charge   = (pi as any).charges?.data?.[0] ?? null;
  const customerId = strId(pi.customer);

  // Fetch full customer from Stripe to get name/email/phone
  let stripeCustomer: Stripe.Customer | null = null;
  if (customerId) {
    const result = await stripe.customers.retrieve(customerId);
    if (!('deleted' in result && result.deleted)) {
      stripeCustomer = result as Stripe.Customer;
      await supabase.from('stripe_customers').upsert({
        stripe_customer_id: stripeCustomer.id,
        email:              stripeCustomer.email    ?? null,
        name:               stripeCustomer.name     ?? null,
        phone:              stripeCustomer.phone    ?? null,
        is_active:          true,
        customer_status:    'customer',
        default_currency:   stripeCustomer.currency ?? null,
        raw_customer:       stripeCustomer,
        updated_at:         new Date().toISOString(),
      }, { onConflict: 'stripe_customer_id' });
    }
  }

  const amount = pi.amount_received ? pi.amount_received / 100 : pi.amount / 100;

  const donorEmail =
    pi.receipt_email               ??
    charge?.receipt_email          ??
    charge?.billing_details?.email ??
    meta.donor_email               ??
    stripeCustomer?.email          ?? null;

  const donorName =
    meta.donor_name                ??
    charge?.billing_details?.name  ??
    stripeCustomer?.name           ?? null;

  const donorPhone =
    meta.donor_phone               ??
    charge?.billing_details?.phone ??
    stripeCustomer?.phone          ?? null;

  // Backfill existing donation row if it has no name yet
  if (donorName || donorEmail || donorPhone) {
    await supabase
      .from('stripe_donations')
      .update({
        ...(donorName  && { donor_name:  donorName  }),
        ...(donorEmail && { donor_email: donorEmail }),
        ...(donorPhone && { donor_phone: donorPhone }),
      })
      .eq('stripe_payment_intent_id', pi.id)
      .is('donor_name', null);
  }

  await supabase.from('stripe_donations').upsert({
    stripe_payment_intent_id: pi.id,
    stripe_charge_id:         strId(pi.latest_charge) ?? charge?.id ?? null,
    stripe_customer_id:       customerId,
    donor_email:              donorEmail,
    donor_name:               donorName,
    donor_phone:              donorPhone,
    amount,
    currency:                 upper(pi.currency),
    status:                   pi.status,
    donation_source:          'stripe',
    institution_name:         meta.institution_name ?? null,
    receipt_type:             meta.receipt_type     ?? null,
    raw_event:                event,
    raw_payment:              pi,
    paid_at:                  new Date(pi.created * 1000).toISOString(),
  }, { onConflict: 'stripe_payment_intent_id' });
}

async function handlePaymentIntentFailed(pi: Stripe.PaymentIntent, event: Stripe.Event) {
  await supabase.from('stripe_donations').upsert({
    stripe_payment_intent_id: pi.id,
    stripe_customer_id:       strId(pi.customer),
    amount:                   pi.amount / 100,
    currency:                 upper(pi.currency),
    status:                   'failed',
    donation_source:          'stripe',
    raw_event:                event,
    raw_payment:              pi,
  }, { onConflict: 'stripe_payment_intent_id' });
}

async function handleInvoicePaid(invoice: Stripe.Invoice, event: Stripe.Event) {
  const meta = (invoice as any).metadata ?? {};
  await supabase.from('stripe_donations').upsert({
    stripe_payment_intent_id: strId(invoice.payment_intent),
    stripe_customer_id:       strId(invoice.customer),
    donor_email:              invoice.customer_email ?? null,
    donor_name:               invoice.customer_name  ?? null,
    amount:                   (invoice.amount_paid ?? 0) / 100,
    currency:                 upper(invoice.currency),
    status:                   'succeeded',
    donation_source:          'stripe',
    institution_name:         meta.institution_name ?? null,
    receipt_type:             meta.receipt_type     ?? null,
    raw_event:                event,
    raw_payment:              invoice,
    paid_at:                  invoice.status_transitions?.paid_at
      ? ts(invoice.status_transitions.paid_at)
      : ts(event.created),
  }, { onConflict: 'stripe_payment_intent_id' });
}

async function handleCustomer(customer: Stripe.Customer) {
  await supabase.from('stripe_customers').upsert({
    stripe_customer_id: customer.id,
    email:              customer.email    ?? null,
    name:               customer.name     ?? null,
    phone:              customer.phone    ?? null,
    is_active:          !customer.deleted,
    customer_status:    customer.deleted ? 'deleted' : 'active',
    default_currency:   upper(customer.currency),
    raw_customer:       customer,
    updated_at:         new Date().toISOString(),
  }, { onConflict: 'stripe_customer_id' });
}

async function handleSubscription(sub: Stripe.Subscription) {
  const item      = sub.items.data[0];
  const productId = item?.price?.product;
  const customerId = strId(sub.customer);

  await supabase.from('stripe_subscriptions').upsert({
    stripe_subscription_id: sub.id,
    stripe_customer_id:     customerId,
    status:                 sub.status,
    price_id:               item?.price?.id   ?? null,
    product_id:             typeof productId === 'string' ? productId : (productId as any)?.id ?? null,
    current_period_start:   ts(sub.current_period_start),
    current_period_end:     ts(sub.current_period_end),
    cancel_at_period_end:   sub.cancel_at_period_end,
    raw_subscription:       sub,
    updated_at:             new Date().toISOString(),
  }, { onConflict: 'stripe_subscription_id' });

  if (customerId) {
    const isActive   = ['active', 'trialing'].includes(sub.status);
    const isCanceled = ['canceled', 'unpaid'].includes(sub.status);
    if (isActive || isCanceled) {
      await supabase
        .from('stripe_customers')
        .update({ is_active: isActive, updated_at: new Date().toISOString() })
        .eq('stripe_customer_id', customerId);
    }
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function strId(v: unknown): string | null {
  if (!v) return null;
  return typeof v === 'string' ? v : (v as any).id ?? null;
}

function upper(v?: string | null): string {
  return (v ?? 'ILS').toUpperCase();
}

function ts(unix: number): string {
  return new Date(unix * 1000).toISOString();
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
