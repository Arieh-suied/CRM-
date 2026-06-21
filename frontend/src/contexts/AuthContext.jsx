import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase.js';

const AuthContext = createContext(null);

async function checkAllowed(accessToken) {
  try {
    const res = await fetch('/api/check-allowed', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
      },
    });
    const data = await res.json();
    if (data?.allowed !== true) return { allowed: false, role: null, allowedMosadim: null };
    return {
      allowed:         true,
      role:            data.role ?? 'viewer',
      allowedMosadim:  data.allowed_mosadim ?? null,
    };
  } catch {
    return { allowed: false, role: null, allowedMosadim: null };
  }
}

export function AuthProvider({ children }) {
  const [user, setUser]                   = useState(null);
  const [isAllowed, setIsAllowed]         = useState(false);
  const [role, setRole]                   = useState(null);
  const [allowedMosadim, setAllowedMosadim] = useState(null);
  const [loading, setLoading]             = useState(true);

  async function applySession(session) {
    if (session?.user) {
      setUser(session.user);
      const result = await checkAllowed(session.access_token);
      setIsAllowed(result.allowed);
      setRole(result.role);
      setAllowedMosadim(result.allowedMosadim);
    } else {
      setUser(null);
      setIsAllowed(false);
      setRole(null);
      setAllowedMosadim(null);
    }
  }

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      await applySession(session);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      await applySession(session);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const signIn = () =>
    supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    });

  const signOut = () => supabase.auth.signOut();

  return (
    <AuthContext.Provider value={{ user, isAllowed, role, allowedMosadim, loading, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
