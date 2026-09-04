import { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import toast from 'react-hot-toast';
import { supabase } from '../lib/supabase';
import * as pinAuth from '../lib/pinAuth';
import { syncActiveKey } from '../lib/api';

const AuthContext = createContext(null);
const APP_MARKER = 'manishapay';
const API_BASE = import.meta.env.VITE_API_BASE || '';

// Reject if an auth call stalls (browser extension / dead network) so the
// login / register button never spins forever.
function withTimeout(promise, ms, message) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(message)), ms)),
  ]);
}

// Auto-logout the user after this much idle time. Idle = no mousedown,
// keydown, touchstart, or scroll events from the user. Standard fintech
// session hygiene; tune via env if you ever need a different policy.
const IDLE_TIMEOUT_MS = 30 * 60 * 1000;     // 30 minutes
const IDLE_CHECK_MS   = 60 * 1000;          // re-check once a minute

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  // Separate from `loading`: the app renders as soon as the SESSION is known;
  // the profile (needed only for admin gating / display) loads in the background.
  const [profileReady, setProfileReady] = useState(false);

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

    // Render's free tier sleeps, and the request that wakes it is exactly the
    // one a brand-new merchant makes. Bootstrap is what creates their developer
    // row AND their default project, so quietly giving up after one timeout
    // left them signed in but unable to do anything — every call 403s with
    // NOT_A_MANISHAPAY_DEVELOPER. Three attempts spans a typical cold start;
    // each is bounded so the UI is never hostage to a hung socket.
    const ATTEMPTS = [8000, 15000, 20000];
    for (let i = 0; i < ATTEMPTS.length; i += 1) {
      try {
        const ctrl = new AbortController();
        const bootTimer = setTimeout(() => ctrl.abort(), ATTEMPTS[i]);
        const res = await fetch(`${API_BASE}/v1/auth/bootstrap`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          signal: ctrl.signal,
        });
        clearTimeout(bootTimer);
        if (res.ok) {
          const json = await res.json();
          return json?.developer || null;
        }
        // A 4xx is a real answer — the server is awake and refusing. Retrying
        // won't change it, so stop and let the caller surface the state.
        if (res.status < 500) {
          // eslint-disable-next-line no-console
          console.warn('bootstrap rejected', res.status, await res.text().catch(() => ''));
          return null;
        }
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn(`bootstrap attempt ${i + 1} failed`, err?.name || err);
      }
      if (i < ATTEMPTS.length - 1) await new Promise((r) => setTimeout(r, 1200 * (i + 1)));
    }
    return null;
  }, [loadProfile]);

  // Surface OAuth failures. When Google/GitHub sign-in fails (provider not
  // enabled, redirect-URL mismatch, user cancels), Supabase redirects back
  // with `error`/`error_description` in the URL — usually the hash fragment,
  // sometimes the query. Without this the user just lands silently on a
  // protected route and bounces to /login with no clue why. Read it once on
  // mount, toast the reason, then scrub it from the address bar.
  useEffect(() => {
    const parse = (str) => new URLSearchParams(str.startsWith('#') || str.startsWith('?') ? str.slice(1) : str);
    const hash = parse(window.location.hash || '');
    const query = parse(window.location.search || '');
    const err = hash.get('error') || query.get('error');
    if (!err) return;
    const desc = hash.get('error_description') || query.get('error_description') || err;
    toast.error(decodeURIComponent(desc).replace(/\+/g, ' '), { duration: 8000 });
    // Strip the error params so a refresh doesn't re-toast.
    window.history.replaceState({}, '', window.location.pathname);
  }, []);

  useEffect(() => {
    let active = true;

    // Bounded: on supabase-js auth-lock stalls this used to spin forever;
    // now an 8s timeout routes the user to /login instead of a blank spinner.
    withTimeout(supabase.auth.getSession(), 8000, 'session-timeout').then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      // Render the app immediately once the session is known — don't block the
      // whole dashboard on a Supabase profile round-trip. Load it in the background.
      setLoading(false);
      if (data.session?.user) {
        ensureProfile(data.session.user.id)
          .then((p) => { if (active) { setProfile(p); setProfileReady(true); } })
          .catch(() => { if (active) setProfileReady(true); }); // never hang admin gate
        syncActiveKey().catch(() => {}); // load the in-use key on this device
      } else {
        setProfileReady(true);
      }
    }).catch(() => {
      // Stalled or rejected session read: unblock the UI. If a session later
      // materialises, onAuthStateChange updates state anyway.
      if (active) { setLoading(false); setProfileReady(true); }
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_evt, s) => {
      if (!active) return;
      setSession(s);
      // CRITICAL: defer all further work out of this callback. The callback
      // runs while the auth lock is held; awaiting Supabase calls in here
      // (profile reads, getSession) re-enters that lock and deadlocks EVERY
      // subsequent query — the classic "app pauses after idle" bug.
      setTimeout(() => {
        if (!active) return;
        if (s?.user) {
          ensureProfile(s.user.id)
            .then((p) => { if (active) { setProfile(p); setProfileReady(true); } })
            .catch(() => { if (active) setProfileReady(true); });
        } else {
          setProfile(null); setProfileReady(true);
        }
      }, 0);
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [ensureProfile]);

  const signIn = async (email, password) => {
    const { error } = await withTimeout(
      supabase.auth.signInWithPassword({ email, password }),
      20000,
      'Sign-in timed out — a browser extension or your network may be blocking it. Try a private window.',
    );
    if (error) throw error;
  };

  // The `app: 'manishapay'` marker is the gate the
  // manishapay_handle_new_user() trigger checks before creating a
  // manishapay_developers row. Without it the user's auth.users row exists
  // but no app-side profile is created (intentional — chikoro/church
  // signups don't trip this trigger either).
  const signUp = async (email, password, fullName) => {
    const { error } = await withTimeout(supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName, app: APP_MARKER },
        // After the user clicks "Verify" in the email, come back to THIS app
        // (whatever origin they signed up from) rather than Supabase's default
        // Site URL — which otherwise sends production users to localhost.
        emailRedirectTo: `${window.location.origin}/login?verified=1`,
      },
    }), 20000, 'Sign-up timed out — a browser extension or your network may be blocking it. Try a private window.');
    if (error) throw error;
  };

  // Verify the 6-digit code from the confirmation email (alternative to clicking
  // the link — better on mobile / across devices). On success Supabase returns a
  // session and onAuthStateChange lands the user in the app.
  const verifyEmailOtp = async (email, token) => {
    // Supabase: the 6-digit code from the Confirm-signup email is verified with
    // type 'email' (NOT 'signup' — that 403s). 'signup' is only for resend below.
    const { error } = await withTimeout(
      supabase.auth.verifyOtp({ email, token: String(token).trim(), type: 'email' }),
      20000,
      'Verification timed out — check your connection and try again.',
    );
    if (error) throw error;
  };

  // Re-send the verification email (code + link). Rate-limited by Supabase.
  const resendVerification = async (email) => {
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email,
      options: { emailRedirectTo: `${window.location.origin}/login?verified=1` },
    });
    if (error) throw error;
  };

  // ── PIN "easy login" (device-local convenience) ──────────────────
  // Enable: seal the CURRENT session under a PIN-derived key on this device.
  const enablePinLogin = async (pin) => {
    const { data } = await supabase.auth.getSession();
    const s = data.session;
    if (!s?.user) throw new Error('You must be signed in to set up a PIN.');
    if (!s.user.email_confirmed_at && !s.user.confirmed_at) {
      throw new Error('Verify your email first, then you can enable PIN login.');
    }
    await pinAuth.enablePin(pin, s.user.email, s);
  };
  // Unlock: decrypt the stored session with the PIN and restore it.
  const unlockWithPin = async (pin) => {
    const tokens = await pinAuth.unlockPin(pin);
    const { error } = await supabase.auth.setSession(tokens);
    if (error) { pinAuth.disablePin(); throw new Error('Stored session expired — sign in with your password.'); }
  };
  const disablePinLogin = () => pinAuth.disablePin();

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

  /**
   * One-tap entry. Supabase creates a real auth.users row with a stable id, so
   * /v1/auth/bootstrap makes the matching developer row exactly as it would for
   * any signup — just marked `anonymous` with a null email.
   *
   * The account is REAL. What it lacks is a way to prove ownership, which means
   * it lives only in this browser's storage. Everything below exists to get the
   * merchant out of that state before it costs them anything.
   */
  const signInAnonymously = async () => {
    const { error } = await withTimeout(
      supabase.auth.signInAnonymously({ options: { data: { app: APP_MARKER } } }),
      20000,
      'Could not start — check your connection and try again.',
    );
    if (error) throw error;
  };

  /**
   * Attach an email to the CURRENT user. This is not a signup: Supabase links
   * the identity to the same auth.users row, so the developer id is unchanged
   * and every project, gateway credential, key and transaction stays attached.
   *
   * The catch: the identity is not upgraded until the merchant confirms. Until
   * then `user.is_anonymous` stays true, which is why the caller has to show a
   * pending state rather than declaring success.
   */
  const linkEmail = async (email) => {
    const { error } = await withTimeout(supabase.auth.updateUser({
      email: email.trim(),
      data: { app: APP_MARKER },
    }, {
      emailRedirectTo: `${window.location.origin}/app?secured=1`,
    }), 20000, 'Timed out — check your connection and try again.');
    if (error) throw error;
  };

  /** Confirm the 6-digit code from the link-email, for merchants on another device. */
  const confirmLinkedEmail = async (email, token) => {
    const { error } = await withTimeout(
      supabase.auth.verifyOtp({ email: email.trim(), token: String(token).trim(), type: 'email_change' }),
      20000,
      'Verification timed out — check your connection and try again.',
    );
    if (error) throw error;
    setProfile(await ensureProfile(session?.user?.id));
  };

  /**
   * Attach a provider to the current user. Same row, same id — but resolves in
   * one tap with no inbox involved, so it's the reliable path while email
   * deliverability is still a weak spot.
   */
  const linkProvider = async (provider) => {
    const { error } = await supabase.auth.linkIdentity({
      provider,
      options: { redirectTo: `${window.location.origin}/app?secured=1` },
    });
    if (error) throw error;
  };

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
    // Never idle-out an unsecured account. For a permanent user this is a
    // 30-minute inconvenience; for an anonymous one it is the irreversible
    // loss of everything they just built, triggered by walking away from
    // the phone.
    if (session.user?.is_anonymous) return;
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
    // True until the merchant links an email or a provider. Drives the
    // "secure your account" prompts and the live-mode gates.
    isAnonymous: !!session?.user?.is_anonymous,
    loading,
    profileReady,
    signIn,
    signUp,
    verifyEmailOtp,
    resendVerification,
    signInWithGoogle,
    signInWithGithub,
    signInAnonymously,
    linkEmail,
    confirmLinkedEmail,
    linkProvider,
    signOut,
    // PIN easy-login (device-local)
    enablePinLogin,
    unlockWithPin,
    disablePinLogin,
    hasPin: pinAuth.hasPin,
    pinEmail: pinAuth.pinEmail,
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
