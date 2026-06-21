import { getSupabase } from '../_supabase.js';

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

  const id = req.query?.id;

  // GET — list all users
  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('allowed_users')
      .select('id, email, full_name, role, is_active, allowed_mosadim, created_at')
      .order('created_at', { ascending: false });

    if (error) return res.status(500).json({ error: error.message });
    return res.json(data);
  }

  // POST — add user
  if (req.method === 'POST') {
    const { email, full_name, role, allowed_mosadim } = req.body;
    if (!email) return res.status(400).json({ error: 'Email required' });

    const validRoles = ['admin', 'editor', 'viewer'];
    const userRole = validRoles.includes(role) ? role : 'viewer';

    const { data, error } = await supabase
      .from('allowed_users')
      .insert({
        email:           email.trim().toLowerCase(),
        full_name:       full_name || null,
        role:            userRole,
        is_active:       true,
        allowed_mosadim: allowed_mosadim?.length ? allowed_mosadim : null,
      })
      .select()
      .single();

    if (error) return res.status(400).json({ error: error.message });
    return res.status(201).json(data);
  }

  // PUT — update user (requires ?id=)
  if (req.method === 'PUT') {
    if (!id) return res.status(400).json({ error: 'Missing id' });

    const { full_name, role, is_active, allowed_mosadim } = req.body;
    const updates = {};
    if (full_name      !== undefined) updates.full_name       = full_name || null;
    if (role           !== undefined) updates.role            = role;
    if (is_active      !== undefined) updates.is_active       = Boolean(is_active);
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

  // DELETE — remove user (requires ?id=)
  if (req.method === 'DELETE') {
    if (!id) return res.status(400).json({ error: 'Missing id' });

    const { error } = await supabase
      .from('allowed_users')
      .delete()
      .eq('id', id);

    if (error) return res.status(400).json({ error: error.message });
    return res.status(204).send('');
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
