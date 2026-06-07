import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer '))
    return res.status(401).json({ error: 'Unauthorized' });

  const token = authHeader.replace('Bearer ', '');

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  // Verify the token is genuine
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return res.status(401).json({ error: 'Invalid token' });

  // Check allowlist using service role (bypasses RLS)
  const { data, error } = await supabase
    .from('allowed_users')
    .select('email, is_active')
    .ilike('email', user.email.trim())
    .maybeSingle();

  return res.json({ allowed: data?.is_active === true, email: user.email, data, error: error?.message });
}
