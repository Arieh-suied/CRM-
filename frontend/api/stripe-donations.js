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

    // Get all unique customer IDs that are missing names
    const { data: rows, error } = await supabase
      .from('stripe_donations')
      .select('stripe_customer_id')
      .not('stripe_customer_id', 'is', null);

    if (error) return res.status(500).json({ error: error.message });

    const ids = [...new Set((rows ?? []).map(r => r.stripe_customer_id).filter(Boolean))];
    if (!ids.length) return res.json({ updated: 0, message: 'אין לקוחות לסנכרן' });

    let updated = 0;
    const errors = [];

    for (const customerId of ids) {
      try {
        const stripeRes = await fetch(`https://api.stripe.com/v1/customers/${customerId}`, {
          headers: { Authorization: `Bearer ${stripeKey}` },
        });
        if (!stripeRes.ok) { errors.push(customerId); continue; }
        const customer = await stripeRes.json();

        const { error: upsertErr } = await supabase
          .from('stripe_customers')
          .upsert({
            stripe_customer_id: customerId,
            name:  customer.name  || null,
            email: customer.email || null,
            phone: customer.phone || null,
          }, { onConflict: 'stripe_customer_id' });

        if (!upsertErr) updated++;
        else errors.push(customerId);
      } catch {
        errors.push(customerId);
      }
    }

    res.json({ updated, total: ids.length, errors: errors.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
