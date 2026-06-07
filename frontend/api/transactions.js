import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  try {
    if (req.method !== 'GET') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl) {
      return res.status(500).json({ error: 'Missing SUPABASE_URL' });
    }

    if (!supabaseKey) {
      return res.status(500).json({ error: 'Missing SUPABASE_SERVICE_ROLE_KEY' });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    const page = Number(req.query.page || 1);
    const pageSize = 20;
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    const { data, error, count } = await supabase
      .from('transactions')
      .select('*', { count: 'exact' })
      .order('id', { ascending: false })
      .range(from, to);

    if (error) {
      return res.status(500).json({
        error: 'Supabase query failed',
        details: error.message,
      });
    }

    return res.status(200).json({
      data,
      page,
      total: count || 0,
      totalPages: Math.max(1, Math.ceil((count || 0) / pageSize)),
    });
  } catch (err) {
    return res.status(500).json({
      error: 'Server error',
      details: err.message || String(err),
    });
  }
}
