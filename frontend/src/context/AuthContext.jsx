import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';

const AuthContext = createContext(null);
const APP_MARKER = 'manishapay';
const API_BASE = import.meta.env.VITE_API_BASE || '';

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadProfile = useCallback(async (userId) => {
    if (!userId) return null;
    // Reads the namespaced developer profile. If the row is missing it
    // means this auth.users row belongs to a sibling app (chikoro/church/
    // etc.) OR came in via OAuth without our marker — in which case
    // ensureProfile below will bootstrap it.
    const { data } = await supabase
      .from('manishapay_developers')
      .select('*')
      .eq('id', userId)
      .maybeSingle();
    return data || null;
  }, []);

  // Ensures the current auth user has a manishapay_developers row.
  // Called whenever a session lands without an existing profile — covers:
  //   • Google OAuth signups (no app marker passed during signUp)
  //   • Email signups by users that already exist in chikoro/church
  //
  // The backend bootstrap endpoint is idempotent and safe to call repeatedly.
  const ensureProfile = useCallback(async (userId) => {
    const existing = await loadProfile(userId);
    if (existing) return existing;

    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return null;

    try {
      const res = await fetch(`${API_BASE}/v1/auth/bootstrap`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });
      if (!res.ok) {
        // Don't crash the app — surface in console for debugging,
        // user just won't see app UI until they retry.
        // eslint-disable-next-line no-console
        console.warn('bootstrap failed', res.status, await res.text().catch(() => ''));
        return null;
      }
      const json = await res.json();
      return json?.developer || null;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('bootstrap error', err);
      return null;
    }
  }, [loadProfile]);

  useEffect(() => {
    let active = true;

    supabase.auth.getSession().then(async ({ data }) => {
      if (!active) return;
      setSession(data.session);
      if (data.session?.user) {
        setProfile(await ensureProfile(data.session.user.id));
      }
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange(async (_evt, s) => {
      if (!active) return;
      setSession(s);
      setProfile(s?.user ? await ensureProfile(s.user.id) : null);
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [ensureProfile]);

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

  // Google OAuth. The marker can't be passed reliably for OAuth, so we rely
  // on the bootstrap endpoint (called automatically by ensureProfile when
  // the user lands back on the dashboard) to create the developer profile.
  const signInWithGoogle = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/app`,
        queryParams: { access_type: 'offline', prompt: 'consent' },
      },
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
    signInWithGoogle,
    signOut,
    reloadProfile: async () => {
      if (session?.user) {
        setProfile(await ensureProfile(session.user.id));
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
