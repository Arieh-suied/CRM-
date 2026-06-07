import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase.js';

const AuthContext = createContext(null);

async function checkAllowed(email) {
  const { data } = await supabase
    .from('allowed_users')
    .select('is_active')
    .eq('email', email)
    .single();
  return data?.is_active === true;
}

export function AuthProvider({ children }) {
  const [user, setUser]         = useState(null);
  const [isAllowed, setIsAllowed] = useState(false);
  const [loading, setLoading]   = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session?.user) {
        setUser(session.user);
        setIsAllowed(await checkAllowed(session.user.email));
      }
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (session?.user) {
        setUser(session.user);
        setIsAllowed(await checkAllowed(session.user.email));
      } else {
        setUser(null);
        setIsAllowed(false);
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signIn = () =>
    supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    });

  const signOut = () => supabase.auth.signOut();

  return (
    <AuthContext.Provider value={{ user, isAllowed, loading, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
