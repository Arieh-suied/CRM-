import { getSupabase } from './_supabase.js';

export default async function handler(req, res) {
  const supabase = getSupabase();
  try {
    if (req.method === 'GET') {
      const { data, error } = await supabase
        .from('institutions')
        .select('id, mosad_number, mosad_name, created_at, api_password')
        .order('mosad_name', { ascending: true });
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
