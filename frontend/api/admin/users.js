import { getSupabase } from '../_supabase.js';

import { withErrorAlert } from '../_error-alert.js';
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

async function handler(req, res) {
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
      .select('id, email, full_name, role, is_active, allowed_mosadim, allowed_group_names, extra_tabs, auth_user_id, created_at')
      .order('created_at', { ascending: false });

    if (error) return res.status(500).json({ error: error.message });
    return res.json(data);
  }

  // POST — add user
  if (req.method === 'POST') {
    const { email, full_name, role, allowed_mosadim, allowed_group_names, extra_tabs, password } = req.body;
    if (!email) return res.status(400).json({ error: 'Email required' });

    const validRoles = ['admin', 'editor', 'viewer', 'institution'];
    const userRole = validRoles.includes(role) ? role : 'viewer';
    const normalizedEmail = email.trim().toLowerCase();

    // Institution logins authenticate with a real email+password Supabase Auth
    // account (separate from staff Google OAuth) — create it here so the
    // allowlist row and the actual login credential are set up together.
    let authUserId = null;
    if (userRole === 'institution') {
      if (!password) return res.status(400).json({ error: 'Password required for institution users' });
      const { data: created, error: authErr } = await supabase.auth.admin.createUser({
        email: normalizedEmail,
        password,
        email_confirm: true,
      });
      if (authErr) return res.status(400).json({ error: authErr.message });
      authUserId = created.user.id;
    }

    const { data, error } = await supabase
      .from('allowed_users')
      .insert({
        email:               normalizedEmail,
        full_name:           full_name || null,
        role:                userRole,
        is_active:           true,
        allowed_mosadim:     allowed_mosadim?.length ? allowed_mosadim : null,
        allowed_group_names: allowed_group_names?.length ? allowed_group_names : null,
        extra_tabs:          extra_tabs?.length ? extra_tabs : null,
        auth_user_id:        authUserId,
      })
      .select()
      .single();

    if (error) return res.status(400).json({ error: error.message });
    return res.status(201).json(data);
  }

  // PUT — update user (requires ?id=); ?action=reset_password updates the
  // institution user's Supabase Auth password instead of the allowlist row.
  if (req.method === 'PUT') {
    if (!id) return res.status(400).json({ error: 'Missing id' });

    if (req.query.action === 'reset_password') {
      const { password } = req.body;
      if (!password) return res.status(400).json({ error: 'Password required' });

      const { data: row, error: fetchErr } = await supabase
        .from('allowed_users')
        .select('auth_user_id')
        .eq('id', id)
        .single();
      if (fetchErr || !row?.auth_user_id) return res.status(404).json({ error: 'No auth account for this user' });

      const { error: authErr } = await supabase.auth.admin.updateUserById(row.auth_user_id, { password });
      if (authErr) return res.status(400).json({ error: authErr.message });
      return res.json({ success: true });
    }

    const { full_name, role, is_active, allowed_mosadim, allowed_group_names, extra_tabs } = req.body;
    const updates = {};
    if (full_name      !== undefined) updates.full_name       = full_name || null;
    if (role           !== undefined) updates.role            = role;
    if (is_active      !== undefined) updates.is_active       = Boolean(is_active);
    if (allowed_mosadim !== undefined) {
      updates.allowed_mosadim = allowed_mosadim?.length ? allowed_mosadim : null;
    }
    if (allowed_group_names !== undefined) {
      updates.allowed_group_names = allowed_group_names?.length ? allowed_group_names : null;
    }
    if (extra_tabs !== undefined) {
      updates.extra_tabs = extra_tabs?.length ? extra_tabs : null;
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

export default withErrorAlert(handler, 'admin/users');
