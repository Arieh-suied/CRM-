import express from 'express';
import supabase from '../supabaseClient.js';
import { requireAdmin } from '../middleware/requireAdmin.js';

const router = express.Router();

router.use(requireAdmin);

// GET /api/admin/users — list all users
router.get('/', async (_req, res) => {
  const { data, error } = await supabase
    .from('allowed_users')
    .select('id, email, full_name, role, is_active, allowed_mosadim, created_at')
    .order('created_at', { ascending: false });

  if (error) return res.status(500).json({ error: error.message });
  return res.json(data);
});

// POST /api/admin/users — add user
router.post('/', async (req, res) => {
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
});

// PUT /api/admin/users?id= — update user
router.put('/', async (req, res) => {
  const id = req.query.id;
  if (!id) return res.status(400).json({ error: 'Missing id' });

  const { full_name, role, is_active, allowed_mosadim } = req.body;

  const updates = {};
  if (full_name    !== undefined) updates.full_name       = full_name || null;
  if (role         !== undefined) updates.role            = role;
  if (is_active    !== undefined) updates.is_active       = Boolean(is_active);
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
});

// DELETE /api/admin/users?id= — remove user
router.delete('/', async (req, res) => {
  const id = req.query.id;
  if (!id) return res.status(400).json({ error: 'Missing id' });

  const { error } = await supabase
    .from('allowed_users')
    .delete()
    .eq('id', id);

  if (error) return res.status(400).json({ error: error.message });
  return res.status(204).send();
});

export default router;
