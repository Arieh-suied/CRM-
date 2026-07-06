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
    .select('role, is_active, allowed_mosadim')
    .eq('email', user.email.trim())
    .maybeSingle();

  if (!data?.is_active) return null;
  return { email: user.email, role: data.role ?? 'viewer', allowedMosadim: data.allowed_mosadim ?? null };
}

// Guard for API handlers: resolves the caller and, optionally, enforces a role.
// On failure it writes the 401/403 response itself and returns null, so callers
// just do:  const user = await requireUser(req, res, supabase); if (!user) return;
export async function requireUser(req, res, supabase, { roles } = {}) {
  const user = await getRequestUser(req, supabase);
  if (!user) {
    res.status(401).json({ error: 'לא מורשה — יש להתחבר מחדש' });
    return null;
  }
  if (roles && !roles.includes(user.role)) {
    res.status(403).json({ error: 'אין לך הרשאה לבצע פעולה זו' });
    return null;
  }
  return user;
}

// Roles allowed to perform write/actions (viewers are read-only).
export const WRITE_ROLES = ['admin', 'editor'];
