import express from 'express';
import supabase from '../supabaseClient.js';

const router = express.Router();

router.post('/', async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const token = authHeader.replace('Bearer ', '');

  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) {
    return res.status(401).json({ error: 'Invalid token' });
  }

  const { data } = await supabase
    .from('allowed_users')
    .select('is_active, role, allowed_mosadim')
    .eq('email', user.email.trim())
    .maybeSingle();

  if (!data?.is_active) {
    return res.json({ allowed: false });
  }

  return res.json({
    allowed:         true,
    role:            data.role ?? 'viewer',
    allowed_mosadim: data.allowed_mosadim ?? null,
  });
});

export default router;
