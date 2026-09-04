/**
 * Tiny fetch wrapper for the ManishaPay gateway.
 *
 * Two flavours:
 *   • apiFetch        — uses the active API key from localStorage (data plane)
 *   • apiFetchAuthed  — uses the Supabase access token (management plane)
 *
 * Always sends an X-Request-Id so dashboard actions can be correlated to
 * backend log lines.
 */
import toast from 'react-hot-toast';
import { supabase } from './supabase';

const BASE = import.meta.env.VITE_API_BASE || '';

function genRequestId() {
  return 'rid-' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

export function getActiveKey() {
  return localStorage.getItem('mp.activeKey') || '';
}
export function setActiveKey(key) {
  if (key) localStorage.setItem('mp.activeKey', key);
  else localStorage.removeItem('mp.activeKey');
}

// Pull the developer's active key from the server (works on ANY device). TEST
// keys come back with their value so we cache it locally for the dashboard tools;
// LIVE keys are never revealed. Called on app load and after create/activate.
export async function syncActiveKey() {
  try {
    const r = await apiFetchAuthed('/v1/keys/active', { silent: true });
    const a = r?.data || null;
    if (a?.key) setActiveKey(a.key);
    return a;
  } catch { return null; }
}

async function rawFetch(path, headers, { method, body, silent }) {
  // Abort a stalled request (extension interference, dead network) after 20s
  // so the UI shows an error instead of spinning forever.
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 20000);
  let res;
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: ctrl.signal,
    });
  } catch (e) {
    clearTimeout(timer);
    const msg = e.name === 'AbortError'
      ? 'Request timed out — a browser extension or your network may be blocking it. Try a private window.'
      : e.message || 'Network error';
    if (!silent) toast.error(msg);
    throw Object.assign(new Error(msg), { code: 'NETWORK' });
  }
  clearTimeout(timer);
  let json = null;
  try {
    json = res.status === 204 ? null : await res.json();
  } catch {
    /* non-JSON */
  }
  if (!res.ok) {
    const err = (json && json.error) || { message: `HTTP ${res.status}`, code: 'NETWORK' };
    if (!silent) {
      // Some codes are prompts rather than faults. Prefixing them with a
      // shouty machine code makes a normal next step look like a crash.
      const isPrompt = err.code === 'ACCOUNT_NOT_SECURED';
      const text = isPrompt
        ? err.message
        : `${err.code || 'ERROR'}: ${err.message}${err.resolution ? ` — ${err.resolution}` : ''}`;
      if (isPrompt) toast(text, { icon: '🔒' });
      else toast.error(text);
    }
    throw Object.assign(new Error(err.message), err);
  }
  return json;
}

/** Data-plane: API-key authenticated. */
export async function apiFetch(path, { method = 'GET', body, silent = false } = {}) {
  const key = getActiveKey();
  const headers = { 'Content-Type': 'application/json', 'X-Request-Id': genRequestId() };
  if (key) headers.Authorization = `Bearer ${key}`;
  return rawFetch(path, headers, { method, body, silent });
}

/** Management-plane: Supabase JWT authenticated. */
export async function apiFetchAuthed(path, { method = 'GET', body, silent = false } = {}) {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  const headers = { 'Content-Type': 'application/json', 'X-Request-Id': genRequestId() };
  if (token) headers.Authorization = `Bearer ${token}`;
  // Workspace: operate the selected account (own or a team you belong to).
  const acct = localStorage.getItem('manishapay_account');
  if (acct) headers['X-Account-Id'] = acct;
  return rawFetch(path, headers, { method, body, silent });
}

export const api = {
  // Data-plane
  pay: (body) => apiFetch('/v1/pay', { method: 'POST', body }),
  status: (ref) => apiFetch(`/v1/pay/${encodeURIComponent(ref)}/status`),
  hashTool: (body) => apiFetch('/v1/tools/hash', { method: 'POST', body }),
  decimalTool: (body) => apiFetch('/v1/tools/decimal', { method: 'POST', body }),
  phoneTool: (body) => apiFetch('/v1/tools/phone', { method: 'POST', body }),
  samplePay: (body) => apiFetch('/v1/tools/sample/pay', { method: 'POST', body }),
  health: () => apiFetch('/health'),

  // Management-plane (JWT)
  listProjects: () => apiFetchAuthed('/v1/projects'),
  createProject: (body) => apiFetchAuthed('/v1/projects', { method: 'POST', body }),
  updateProject: (id, body) => apiFetchAuthed(`/v1/projects/${id}`, { method: 'PATCH', body }),
  deleteProject: (id) => apiFetchAuthed(`/v1/projects/${id}`, { method: 'DELETE' }),

  listKeys: () => apiFetchAuthed('/v1/keys'),
  createKey: (body) => apiFetchAuthed('/v1/keys', { method: 'POST', body }),
  revokeKey: (id) => apiFetchAuthed(`/v1/keys/${id}`, { method: 'DELETE' }),
  getActiveApiKey: () => apiFetchAuthed('/v1/keys/active'),
  activateKey: (id) => apiFetchAuthed(`/v1/keys/${id}/activate`, { method: 'POST' }),

  listCredentials: () => apiFetchAuthed('/v1/credentials'),
  saveCredential: (body) => apiFetchAuthed('/v1/credentials', { method: 'POST', body }),
  revokeCredential: (id) => apiFetchAuthed(`/v1/credentials/${id}`, { method: 'DELETE' }),

  // Multi-gateway catalog + per-gateway credentials
  listProviders: () => apiFetchAuthed('/v1/providers'),
  listGatewayCredentials: () => apiFetchAuthed('/v1/credentials/gateway'),
  saveGatewayCredential: (body) => apiFetchAuthed('/v1/credentials/gateway', { method: 'POST', body }),
  revokeGatewayCredential: (id) => apiFetchAuthed(`/v1/credentials/gateway/${id}`, { method: 'DELETE' }),

  refund: (reference, body) => apiFetchAuthed(`/v1/transactions/${encodeURIComponent(reference)}/refund`, { method: 'POST', body: body || {} }),

  listTeam: () => apiFetchAuthed('/v1/team'),
  inviteTeam: (body) => apiFetchAuthed('/v1/team', { method: 'POST', body }),
  setTeamRole: (id, role) => apiFetchAuthed(`/v1/team/${id}`, { method: 'PATCH', body: { role } }),
  removeTeam: (id) => apiFetchAuthed(`/v1/team/${id}`, { method: 'DELETE' }),

  getBilling: () => apiFetchAuthed('/v1/billing'),
  createSubscription: (body) => apiFetchAuthed('/v1/subscriptions', { method: 'POST', body }),
  chargeSubscription: (id) => apiFetchAuthed(`/v1/subscriptions/${id}/charge`, { method: 'POST' }),

  createLink: (body) => apiFetchAuthed('/v1/links', { method: 'POST', body }),
  getLink: (slug) => apiFetch(`/v1/links/${encodeURIComponent(slug)}`),
  payLink: (slug, body) => apiFetch(`/v1/links/${encodeURIComponent(slug)}/pay`, { method: 'POST', body: body || {} }),

  adminGetSettings: () => apiFetchAuthed('/v1/admin/settings'),
  adminSaveSettings: (body) => apiFetchAuthed('/v1/admin/settings', { method: 'PUT', body }),
  adminWhatsappTest: (to) => apiFetchAuthed('/v1/admin/settings/whatsapp-test', { method: 'POST', body: { to } }),
};
