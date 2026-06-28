import { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import toast from 'react-hot-toast';
import { supabase } from '../lib/supabase';

const AuthContext = createContext(null);
const APP_MARKER = 'manishapay';
const API_BASE = import.meta.env.VITE_API_BASE || '';

// Auto-logout the user after this much idle time. Idle = no mousedown,
// keydown, touchstart, or scroll events from the user. Standard fintech
// session hygiene; tune via env if you ever need a different policy.
const IDLE_TIMEOUT_MS = 30 * 60 * 1000;     // 30 minutes
const IDLE_CHECK_MS   = 60 * 1000;          // re-check once a minute

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
      options: {
        data: { full_name: fullName, app: APP_MARKER },
        // After the user clicks "Verify" in the email, come back to THIS app
        // (whatever origin they signed up from) rather than Supabase's default
        // Site URL — which otherwise sends production users to localhost.
        emailRedirectTo: `${window.location.origin}/login?verified=1`,
      },
    });
    if (error) throw error;
  };

  // OAuth sign-in. The app marker can't be passed reliably during OAuth, so
  // we rely on the bootstrap endpoint (called automatically by ensureProfile
  // when the user lands back on the dashboard) to create the developer
  // profile. This single helper backs both Google and GitHub.
  const signInWithProvider = async (provider) => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${window.location.origin}/app`,
      },
    });
    if (error) throw error;
  };
  const signInWithGoogle = () => signInWithProvider('google');
  const signInWithGithub = () => signInWithProvider('github');

  const signOut = async () => {
    await supabase.auth.signOut();
    setSession(null);
    setProfile(null);
  };

  // ── Idle auto-logout ─────────────────────────────────────────
  // Tracks last user activity in a ref (no re-render churn). When the
  // session is active, a once-a-minute interval checks whether IDLE_TIMEOUT
  // has elapsed and signs the user out if so. Toast surfaces the reason
  // so the user knows they weren't kicked off arbitrarily.
  const lastActivityRef = useRef(Date.now());

  useEffect(() => {
    if (!session) return;
    lastActivityRef.current = Date.now();

    const events = ['mousedown', 'keydown', 'touchstart', 'scroll', 'pointermove'];
    const onActivity = () => { lastActivityRef.current = Date.now(); };
    events.forEach((e) => window.addEventListener(e, onActivity, { passive: true }));

    const interval = setInterval(async () => {
      if (Date.now() - lastActivityRef.current > IDLE_TIMEOUT_MS) {
        clearInterval(interval);
        events.forEach((e) => window.removeEventListener(e, onActivity));
        await signOut();
        toast.error('Signed out — 30 minutes of inactivity', { duration: 6000 });
      }
    }, IDLE_CHECK_MS);

    return () => {
      events.forEach((e) => window.removeEventListener(e, onActivity));
      clearInterval(interval);
    };
  }, [session]);

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
    signInWithGithub,
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
