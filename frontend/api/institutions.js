import { getSupabase } from './_supabase.js';
import { requireUser, WRITE_ROLES, INSTITUTION_READ_ROLES } from './_auth.js';

export default async function handler(req, res) {
  const supabase = getSupabase();
  try {
    // GET is read-only (mosad_number/mosad_name pairs only, no financial data)
    // and the institution portal's UI needs it to render its own institution
    // name — opt institution role into GET only, writes stay staff-only.
    const user = await requireUser(req, res, supabase, req.method === 'GET' ? { roles: INSTITUTION_READ_ROLES } : { roles: WRITE_ROLES });
    if (!user) return;

    if (req.method === 'GET') {
      let query = supabase
        .from('institutions')
        .select('id, mosad_number, mosad_name, created_at, api_password')
        .order('mosad_name', { ascending: true });
      // An institution account only needs its own row(s) to render its name —
      // not the full roster of every other client on the platform.
      if (user.role === 'institution' && user.allowedMosadim?.length) {
        query = query.in('mosad_number', user.allowedMosadim);
      }
      const { data, error } = await query;
      if (error) return res.status(500).json({ error: error.message });
      const safe = (data ?? []).map(({ api_password, ...rest }) => ({
        ...rest,
        has_api_password: Boolean(api_password),
      }));
      return res.json(safe);
    }
    if (req.method === 'POST') {
      const { mosad_number, mosad_name } = req.body;
      if (!mosad_number || !mosad_name) return res.status(400).json({ error: 'mosad_number and mosad_name are required' });
      const { data, error } = await supabase.from('institutions').insert({ mosad_number, mosad_name }).select().single();
      if (error) return res.status(500).json({ error: error.message });
      return res.status(201).json(data);
    }
    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
