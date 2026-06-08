import { getSupabase } from './_supabase.js';

const PAGE_SIZE = 50;
const ALLOWED_SORT = new Set(['resolved_name', 'donor_email', 'amount', 'paid_at', 'stripe_customer_id']);

// GET  → paginated list from stripe_donations_enriched view
// POST → sync customer names/emails from Stripe API into stripe_customers table
export default async function handler(req, res) {
  if (req.method === 'GET') return handleGet(req, res);
  if (req.method === 'POST') return handleSync(req, res);
  return res.status(405).json({ error: 'Method not allowed' });
}

async function handleGet(req, res) {
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

    if (search) query = query.or(`donor_name.ilike.%${search}%,donor_email.ilike.%${search}%,stripe_customer_id.ilike.%${search}%,stripe_payment_intent_id.ilike.%${search}%`);

    const { data, error, count } = await query;
    if (error) return res.status(500).json({ error: error.message });
    res.json({ data, total: count, page: parseInt(page), totalPages: Math.ceil(count / PAGE_SIZE) });
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
