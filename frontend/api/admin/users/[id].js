import { getSupabase } from '../../_supabase.js';

async function getAdminUser(supabase, token) {
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return null;

  const { data } = await supabase
    .from('allowed_users')
    .select('role, is_active')
    .eq('email', user.email.trim())
    .maybeSingle();

  if (!data?.is_active || data.role !== 'admin') return null;
  return user;
}

export default async function handler(req, res) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer '))
    return res.status(401).json({ error: 'Unauthorized' });

  const token = authHeader.replace('Bearer ', '');
  const supabase = getSupabase();

  const adminUser = await getAdminUser(supabase, token);
  if (!adminUser) return res.status(403).json({ error: 'Forbidden' });

  const { id } = req.query;
  if (!id) return res.status(400).json({ error: 'Missing id' });

  // PUT — update user
  if (req.method === 'PUT') {
    const { full_name, role, is_active, allowed_mosadim } = req.body;

    const updates = {};
    if (full_name     !== undefined) updates.full_name       = full_name || null;
    if (role          !== undefined) updates.role            = role;
    if (is_active     !== undefined) updates.is_active       = Boolean(is_active);
    if (allowed_mosadim !== undefined) {
      updates.allowed_mosadim = allowed_mosadim?.length ? allowed_mosadim : null;
    }

    const { data, error } = await supabase
      .from('allowed_users')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) return res.status(400).json({ error: error.message });
    return res.json(data);
  }

  // DELETE — remove user
  if (req.method === 'DELETE') {
    const { error } = await supabase
      .from('allowed_users')
      .delete()
      .eq('id', id);

    if (error) return res.status(400).json({ error: error.message });
    return res.status(204).send('');
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
