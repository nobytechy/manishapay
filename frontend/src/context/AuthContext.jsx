import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';

const AuthContext = createContext(null);
const APP_MARKER = 'manishapay';

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadProfile = useCallback(async (userId) => {
    if (!userId) return null;
    // Reads the namespaced developer profile. If the row is missing it
    // means this auth.users row belongs to a sibling app (chikoro/church/
    // etc.) and shouldn't see ManishaPay UI.
    const { data } = await supabase
      .from('manishapay_developers')
      .select('*')
      .eq('id', userId)
      .maybeSingle();
    return data || null;
  }, []);

  useEffect(() => {
    let active = true;

    supabase.auth.getSession().then(async ({ data }) => {
      if (!active) return;
      setSession(data.session);
      if (data.session?.user) {
        setProfile(await loadProfile(data.session.user.id));
      }
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange(async (_evt, s) => {
      if (!active) return;
      setSession(s);
      setProfile(s?.user ? await loadProfile(s.user.id) : null);
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [loadProfile]);

  const signIn = async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  };

  // The `app: 'manishapay'` marker is the gate the
  // manishapay_handle_new_user() trigger checks before creating a
  // manishapay_developers row. Without it the user's auth.users row exists
  // but no app-side profile is created (intentional — chikoro/church
  // signups don't trip this trigger either).
  const signUp = async (email, password, fullName) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName, app: APP_MARKER } },
    });
    if (error) throw error;
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setSession(null);
    setProfile(null);
  };

  const value = {
    session,
    profile,
    user: session?.user || null,
    isAuthenticated: !!session,
    isAdmin: profile?.role === 'admin',
    loading,
    signIn,
    signUp,
    signOut,
    reloadProfile: async () => {
      if (session?.user) {
        setProfile(await loadProfile(session.user.id));
      }
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be inside AuthProvider');
  return ctx;
}
