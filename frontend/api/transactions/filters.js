import { getSupabase } from '../_supabase.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const supabase = getSupabase();
    const [typesRes, groupsRes] = await Promise.all([
      supabase.from('transactions').select('transaction_type').not('transaction_type', 'is', null),
      supabase.from('transactions').select('group_name').not('group_name', 'is', null),
    ]);
    if (typesRes.error) return res.status(500).json({ error: typesRes.error.message });
    if (groupsRes.error) return res.status(500).json({ error: groupsRes.error.message });

    res.json({
      transaction_types: [...new Set(typesRes.data.map((r) => r.transaction_type))].sort(),
      group_names: [...new Set(groupsRes.data.map((r) => r.group_name))].sort(),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
