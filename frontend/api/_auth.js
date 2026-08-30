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
    .select('role, is_active, allowed_mosadim, allowed_group_names, extra_tabs')
    .eq('email', user.email.trim())
    .maybeSingle();

  if (!data?.is_active) return null;
  return {
    email: user.email,
    role: data.role ?? 'viewer',
    allowedMosadim: data.allowed_mosadim ?? null,
    allowedGroupNames: data.allowed_group_names ?? null,
    extraTabs: data.extra_tabs ?? [],
  };
}

// Every role except 'institution'. Endpoints that omit `{ roles }` get this
// set — 'institution' is a narrow, row-scoped role (see _scope.js) and must
// be explicitly opted into per endpoint, not assumed safe by default.
const DEFAULT_ROLES = ['admin', 'editor', 'viewer'];

// Guard for API handlers: resolves the caller and, optionally, enforces a role.
// On failure it writes the 401/403 response itself and returns null, so callers
// just do:  const user = await requireUser(req, res, supabase); if (!user) return;
export async function requireUser(req, res, supabase, { roles = DEFAULT_ROLES } = {}) {
  const user = await getRequestUser(req, supabase);
  if (!user) {
    res.status(401).json({ error: 'לא מורשה — יש להתחבר מחדש' });
    return null;
  }
  if (!roles.includes(user.role)) {
    res.status(403).json({ error: 'אין לך הרשאה לבצע פעולה זו' });
    return null;
  }
  return user;
}

// Roles allowed to perform write/actions (viewers/institution are read-only).
export const WRITE_ROLES = ['admin', 'editor'];

// Roles allowed on institution-portal endpoints (staff roles + the scoped
// institution role itself).
export const INSTITUTION_READ_ROLES = [...DEFAULT_ROLES, 'institution'];
