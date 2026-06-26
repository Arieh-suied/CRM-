// Resolves the logged-in user from a request's Authorization: Bearer <supabase-jwt>
// header against allowed_users, for endpoints that need to know who's calling
// (and whether they're admin) beyond just "has a valid Supabase session".

export async function getRequestUser(req, supabase) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.slice('Bearer '.length);
  const { data: { user } } = await supabase.auth.getUser(token);
  if (!user?.email) return null;

  const { data } = await supabase
    .from('allowed_users')
    .select('role, is_active')
    .eq('email', user.email.trim())
    .maybeSingle();

  if (!data?.is_active) return null;
  return { email: user.email, role: data.role ?? 'viewer' };
}
