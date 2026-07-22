/**
 * PIN "easy login" — DEVICE-LOCAL convenience unlock.
 *
 * Security model (read before touching this):
 *   - The PIN is NEVER sent to the server and is NOT an auth credential.
 *   - After a full password/OAuth login, the user may opt in: we encrypt the
 *     Supabase session tokens with a key derived from the PIN (PBKDF2) and store
 *     the ciphertext in localStorage — scoped to THIS device/browser only.
 *   - "Easy login" = enter PIN → decrypt → restore the Supabase session.
 *   - A 4–6 digit PIN is weak, so this is convenience (like "stay signed in"),
 *     NOT stronger security. Guardrails: opt-in, toggle-off wipes it, and after
 *     MAX_ATTEMPTS wrong tries the blob is destroyed (fall back to password).
 *   - Only offered after the account's email is verified.
 */

const STORE_KEY = 'mp_pin_v1';
const MAX_ATTEMPTS = 5;
const PBKDF2_ITERATIONS = 150000;

const enc = new TextEncoder();
const dec = new TextDecoder();

const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function deriveKey(pin, salt) {
  const base = await crypto.subtle.importKey('raw', enc.encode(String(pin)), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

function record() {
  try { return JSON.parse(localStorage.getItem(STORE_KEY) || 'null'); } catch { return null; }
}
function write(rec) { localStorage.setItem(STORE_KEY, JSON.stringify(rec)); }

/** Is a PIN configured on this device? */
export function hasPin() { return !!record(); }

/** The email the stored PIN belongs to (for the login greeting). */
export function pinEmail() { return record()?.email || null; }

/** Remaining attempts before the stored blob self-destructs. */
export function pinAttemptsLeft() {
  const r = record();
  if (!r) return 0;
  return Math.max(0, MAX_ATTEMPTS - (r.attempts || 0));
}

/** Enable PIN login: seal the current session under a PIN-derived key. */
export async function enablePin(pin, email, session) {
  if (!session?.refresh_token) throw new Error('No active session to protect');
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(pin, salt);
  const payload = enc.encode(JSON.stringify({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
  }));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, payload);
  write({
    email,
    salt: b64(salt),
    iv: b64(iv),
    ct: b64(ct),
    attempts: 0,
    createdAt: Date.now(),
  });
}

/** Turn PIN login off — wipes the stored blob. */
export function disablePin() { localStorage.removeItem(STORE_KEY); }

/**
 * Unlock with a PIN. Returns { access_token, refresh_token } for
 * supabase.auth.setSession(). Throws with a helpful message on a wrong PIN,
 * decrementing the remaining attempts and wiping the blob at zero.
 */
export async function unlockPin(pin) {
  const r = record();
  if (!r) throw new Error('No PIN set on this device.');
  if ((r.attempts || 0) >= MAX_ATTEMPTS) {
    disablePin();
    throw new Error('Too many attempts — PIN cleared. Sign in with your password.');
  }
  try {
    const key = await deriveKey(pin, unb64(r.salt));
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(r.iv) }, key, unb64(r.ct));
    const tokens = JSON.parse(dec.decode(pt));
    if (r.attempts) write({ ...r, attempts: 0 }); // reset on success
    return tokens;
  } catch {
    const attempts = (r.attempts || 0) + 1;
    if (attempts >= MAX_ATTEMPTS) {
      disablePin();
      throw new Error('Incorrect PIN — too many attempts. PIN cleared; use your password.');
    }
    write({ ...r, attempts });
    throw new Error(`Incorrect PIN — ${MAX_ATTEMPTS - attempts} attempt(s) left.`);
  }
}
