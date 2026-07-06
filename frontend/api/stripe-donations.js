import { getSupabase, ilikeOr } from './_supabase.js';
import { requireUser, WRITE_ROLES } from './_auth.js';

const PAGE_SIZE = 50;
const ALLOWED_SORT = new Set(['resolved_name', 'donor_email', 'amount', 'paid_at', 'stripe_customer_id']);

// GET                          → paginated donations list
// GET ?view=subscriptions       → active subscriptions list
// POST                          → sync customer names from Stripe
// POST ?action=subscriptions    → sync active subscriptions from Stripe
export default async function handler(req, res) {
  const user = await requireUser(req, res, getSupabase(), req.method === 'GET' ? {} : { roles: WRITE_ROLES });
  if (!user) return;

  if (req.method === 'GET')  return handleGet(req, res);
  if (req.method === 'POST') {
    if (req.query.action === 'subscriptions') return handleSyncSubscriptions(req, res);
    return handleSync(req, res);
  }
  return res.status(405).json({ error: 'Method not allowed' });
}

async function handleGet(req, res) {
  if (req.query.view === 'subscriptions') return handleSubscriptions(req, res);

  try {
    const { page = 1, search, sort_by = 'paid_at', sort_dir = 'desc' } = req.query;
    const offset = (parseInt(page) - 1) * PAGE_SIZE;
    const supabase = getSupabase();

    const col = ALLOWED_SORT.has(sort_by) ? sort_by : 'paid_at';
    const asc = sort_dir === 'asc';

    let query = supabase
      .from('stripe_donations_enriched')
      .select('*', { count: 'exact' })
      .order(col, { ascending: asc, nullsLast: true })
      .range(offset, offset + PAGE_SIZE - 1);

    if (search) {
      const orClause = ilikeOr(['donor_name', 'donor_email', 'stripe_customer_id', 'stripe_payment_intent_id'], search);
      if (orClause) query = query.or(orClause);
    }

    const { data, error, count } = await query;
    if (error) return res.status(500).json({ error: error.message });
    res.json({ data, total: count, page: parseInt(page), totalPages: Math.ceil(count / PAGE_SIZE) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function handleSubscriptions(req, res) {
  try {
    const supabase = getSupabase();

    // Step 1: fetch active subscriptions
    const { data: subs, error: subsErr } = await supabase
      .from('stripe_subscriptions')
      .select('*')
      .in('status', ['active', 'trialing'])
      .order('current_period_end', { ascending: true });

    if (subsErr) return res.status(500).json({ error: subsErr.message });
    if (!subs?.length) return res.json({ data: [], total: 0 });

    // Step 2: fetch customer names for those IDs
    const cids = [...new Set(subs.map(s => s.stripe_customer_id).filter(Boolean))];
    let customerMap = {};
    if (cids.length) {
      const { data: customers } = await supabase
        .from('stripe_customers')
        .select('stripe_customer_id, name, email, phone')
        .in('stripe_customer_id', cids);
      customerMap = Object.fromEntries((customers ?? []).map(c => [c.stripe_customer_id, c]));
    }

    const rows = subs.map(s => {
      const c     = customerMap[s.stripe_customer_id] ?? {};
      const raw   = s.raw_subscription ?? {};
      const item  = raw.items?.data?.[0];
      const price = item?.price ?? {};
      const amount   = price.unit_amount ? price.unit_amount / 100 : null;
      const currency = (price.currency ?? 'ILS').toUpperCase();
      const interval = price.recurring?.interval ?? null;
      const metadata = raw.metadata ?? {};
      const totalCycles = raw.billing_cycle_count ?? metadata.total_charges ?? null;
      return {
        id:                   s.stripe_subscription_id,
        customer_id:          s.stripe_customer_id,
        name:                 c.name  ?? null,
        email:                c.email ?? null,
        phone:                c.phone ?? null,
        status:               s.status,
        amount, currency, interval,
        next_billing:         s.current_period_end,
        cancel_at_period_end: s.cancel_at_period_end,
        total_cycles:         totalCycles,
      };
    });

    res.json({ data: rows, total: rows.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function handleSync(req, res) {
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) return res.status(503).json({ error: 'STRIPE_SECRET_KEY לא מוגדר ב-Vercel' });

  try {
    const supabase = getSupabase();
    const auth = { Authorization: `Bearer ${stripeKey}` };
    let updated = 0;
    let errors  = 0;

    // ── 1. Backfill from Stripe customers table ──────────────────────────
    const { data: withCustomer } = await supabase
      .from('stripe_donations')
      .select('stripe_customer_id')
      .not('stripe_customer_id', 'is', null)
      .is('donor_name', null);

    const customerIds = [...new Set((withCustomer ?? []).map(r => r.stripe_customer_id).filter(Boolean))];

    for (const cid of customerIds) {
      try {
        const r = await fetch(`https://api.stripe.com/v1/customers/${cid}`, { headers: auth });
        if (!r.ok) { errors++; continue; }
        const c = await r.json();
        if (!c.name && !c.email) continue;
        await supabase.from('stripe_customers').upsert(
          { stripe_customer_id: cid, name: c.name || null, email: c.email || null, phone: c.phone || null },
          { onConflict: 'stripe_customer_id' }
        );
        updated++;
      } catch { errors++; }
    }

    // ── 2. Backfill via payment intent billing_details (no customer ID) ──
    const { data: missing } = await supabase
      .from('stripe_donations')
      .select('id, stripe_payment_intent_id')
      .is('donor_name', null)
      .not('stripe_payment_intent_id', 'is', null);

    for (const row of (missing ?? [])) {
      try {
        const r = await fetch(
          `https://api.stripe.com/v1/payment_intents/${row.stripe_payment_intent_id}?expand[]=charges`,
          { headers: auth }
        );
        if (!r.ok) { errors++; continue; }
        const pi = await r.json();

        const charge = pi.charges?.data?.[0];
        const name   = pi.metadata?.donor_name  ?? charge?.billing_details?.name  ?? null;
        const email  = pi.receipt_email          ?? charge?.billing_details?.email ?? pi.metadata?.donor_email ?? null;
        const phone  = pi.metadata?.donor_phone  ?? charge?.billing_details?.phone ?? null;

        if (!name && !email) continue;

        const { error: upErr } = await supabase
          .from('stripe_donations')
          .update({ donor_name: name || null, donor_email: email || null, donor_phone: phone || null })
          .eq('id', row.id);

        if (!upErr) updated++;
        else errors++;
      } catch { errors++; }
    }

    res.json({ updated, errors, message: `עודכנו ${updated} רשומות` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function handleSyncSubscriptions(req, res) {
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) return res.status(503).json({ error: 'STRIPE_SECRET_KEY לא מוגדר ב-Vercel' });

  try {
    const supabase = getSupabase();
    const auth = { Authorization: `Bearer ${stripeKey}` };
    let synced = 0;
    let errors = 0;

    // Fetch all active + trialing subscriptions with expanded customer
    const allSubs = [];
    for (const status of ['active', 'trialing']) {
      let startingAfter;
      while (true) {
        const url = new URL('https://api.stripe.com/v1/subscriptions');
        url.searchParams.set('status', status);
        url.searchParams.set('limit', '100');
        url.searchParams.append('expand[]', 'data.customer');
        if (startingAfter) url.searchParams.set('starting_after', startingAfter);

        const r = await fetch(url.toString(), { headers: auth });
        if (!r.ok) break;
        const page = await r.json();
        allSubs.push(...(page.data ?? []));
        if (!page.has_more) break;
        startingAfter = page.data.at(-1)?.id;
      }
    }

    for (const sub of allSubs) {
      try {
        const customer = sub.customer;
        const customerId = typeof customer === 'string' ? customer : customer?.id ?? null;

        // Upsert customer
        if (customer && typeof customer === 'object' && !customer.deleted) {
          await supabase.from('stripe_customers').upsert({
            stripe_customer_id: customer.id,
            name:  customer.name  || null,
            email: customer.email || null,
            phone: customer.phone || null,
            is_active: true,
            customer_status: sub.status,
            updated_at: new Date().toISOString(),
          }, { onConflict: 'stripe_customer_id' });
        }

        // Upsert subscription
        const item      = sub.items?.data?.[0];
        const productId = item?.price?.product;
        const { error } = await supabase.from('stripe_subscriptions').upsert({
          stripe_subscription_id: sub.id,
          stripe_customer_id:     customerId,
          status:                 sub.status,
          price_id:               item?.price?.id ?? null,
          product_id:             typeof productId === 'string' ? productId : productId?.id ?? null,
          current_period_start:   new Date(sub.current_period_start * 1000).toISOString(),
          current_period_end:     new Date(sub.current_period_end   * 1000).toISOString(),
          cancel_at_period_end:   sub.cancel_at_period_end,
          raw_subscription:       sub,
          updated_at:             new Date().toISOString(),
        }, { onConflict: 'stripe_subscription_id' });

        if (!error) synced++;
        else errors++;
      } catch { errors++; }
    }

    res.json({ synced, total: allSubs.length, errors, message: `סונכרנו ${synced} מנויים` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
