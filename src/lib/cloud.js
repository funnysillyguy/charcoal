// Accounts + cloud storage on Supabase, talking to its REST endpoints directly (no SDK, so the bundle stays small).
//
//  - Sign in with a username + password. There's no email: usernames map to a placeholder address on the server.
//  - Recovery is a set of 8 one-time codes shown once at signup (only their hashes are stored).
//  - The DeepSeek API key is encrypted in the browser (AES-GCM, key derived from your password with PBKDF2)
//    before it leaves the device. The server only ever holds ciphertext. The derived key is kept as a
//    non-extractable CryptoKey in IndexedDB so a returning session can still save changes.
import { local, kv } from './storage.js';
import { SANDBOXED } from './settings.js';
import { useSyncExternalStore } from 'react';

const env = import.meta.env || {};
export const CLOUD_URL = String(env.VITE_SUPABASE_URL || 'https://pknqtfkdlpkhzyrysnft.supabase.co').trim().replace(/\/+$/, '');
// Publishable key: safe to ship in the browser. Row-level security is what protects the data.
export const CLOUD_KEY = String(env.VITE_SUPABASE_KEY || 'sb_publishable_tBfe7UFz0OEgOpePYVtmOQ_IQGpfIIU').trim();
export const CLOUD_ENABLED = !SANDBOXED && !!CLOUD_URL && !!CLOUD_KEY;

export const USERNAME_RE = /^[a-z0-9_]{3,24}$/;
export const USERNAME_HELP = 'Usernames are 3-24 characters: lowercase letters, numbers, underscore.';
export const normUser = (u) => String(u || '').trim().toLowerCase().replace(/^@/, '');
const emailFor = (u) => `${u}@users.charcoal.invalid`;

export class CloudError extends Error {
  constructor(message, code = 'error', status = 0) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

/* ---------- session ---------- */

const SESSION_KEY = 'charcoal:session';
let session = local.get(SESSION_KEY, null);
const listeners = new Set();

function setSession(next) {
  session = next;
  if (next) local.set(SESSION_KEY, next);
  else local.remove(SESSION_KEY);
  listeners.forEach((fn) => fn());
}
export const getSession = () => session;
export const subscribeSession = (fn) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};
export function useSession() {
  return useSyncExternalStore(subscribeSession, getSession, getSession);
}

function toSession(d, username) {
  return {
    access_token: d.access_token,
    refresh_token: d.refresh_token,
    expires_at: d.expires_at ? d.expires_at * 1000 : Date.now() + (d.expires_in || 3600) * 1000,
    user_id: d.user?.id || session?.user_id,
    username: username || session?.username || '',
  };
}

/* ---------- http ---------- */

async function raw(path, init = {}) {
  try {
    return await fetch(CLOUD_URL + path, init);
  } catch {
    throw new CloudError('Can’t reach the server. Check your connection.', 'offline');
  }
}
const readJson = async (res) => {
  try {
    return await res.json();
  } catch {
    return null;
  }
};
const baseHeaders = () => ({ apikey: CLOUD_KEY, 'Content-Type': 'application/json' });

let refreshing = null;
async function refreshSession() {
  if (refreshing) return refreshing;
  const s = session;
  if (!s) throw new CloudError('Signed out.', 'signed_out');
  refreshing = (async () => {
    const res = await raw('/auth/v1/token?grant_type=refresh_token', {
      method: 'POST',
      headers: baseHeaders(),
      body: JSON.stringify({ refresh_token: s.refresh_token }),
    });
    const d = await readJson(res);
    if (!res.ok) {
      if (res.status >= 400 && res.status < 500) {
        setSession(null);
        throw new CloudError('Your session expired. Sign in again.', 'signed_out', res.status);
      }
      throw new CloudError('The server hiccuped. Try again in a moment.', 'error', res.status);
    }
    const next = toSession(d, s.username);
    setSession(next);
    return next;
  })().finally(() => {
    refreshing = null;
  });
  return refreshing;
}

async function accessToken() {
  let s = session;
  if (!s) throw new CloudError('Signed out.', 'signed_out');
  if (s.expires_at - Date.now() < 60_000) s = await refreshSession();
  return s.access_token;
}

/** fetch with the signed-in user's token; retries once after a refresh on 401. */
export async function authed(path, init = {}) {
  const make = (t) => ({ ...init, headers: { ...baseHeaders(), Authorization: `Bearer ${t}`, ...(init.headers || {}) } });
  const res = await raw(path, make(await accessToken()));
  if (res.status !== 401) return res;
  const s = await refreshSession();
  return raw(path, make(s.access_token));
}

export async function restJson(path, init = {}) {
  const res = await authed(path, init);
  const body = res.status === 204 ? null : await readJson(res);
  if (!res.ok) throw new CloudError(body?.message || 'The server rejected that request.', 'error', res.status);
  return body;
}

async function callAccount(body, withAuth = false) {
  const headers = baseHeaders();
  if (withAuth) headers.Authorization = `Bearer ${await accessToken()}`;
  const res = await raw('/functions/v1/account', { method: 'POST', headers, body: JSON.stringify(body) });
  const d = await readJson(res);
  if (!res.ok) throw new CloudError(d?.error || 'Something went wrong. Try again.', res.status === 429 ? 'rate_limited' : 'error', res.status);
  return d;
}

/* ---------- vault (client-side encryption for the API key) ---------- */

const ITER = 310_000;
const enc = new TextEncoder();
const dec = new TextDecoder();
const b64 = (buf) => {
  const bytes = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
};
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

function needCrypto() {
  if (!globalThis.crypto?.subtle) throw new CloudError('This browser can’t encrypt here. Open the site over https.', 'crypto');
}

async function deriveKey(password, salt, iter) {
  needCrypto();
  const base = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: iter, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, [
    'encrypt',
    'decrypt',
  ]);
}

async function encryptWith(key, salt, iter, text) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(text));
  return { v: 1, kdf: 'pbkdf2-sha256', iter, salt: b64(salt), iv: b64(iv), ct: b64(ct) };
}

async function decryptBlob(key, blob) {
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(blob.iv) }, key, unb64(blob.ct));
  return dec.decode(pt);
}

/** Derive and stash the vault key at sign-in. Returns the saved API key if the account has one. */
async function unlockVault(password, token, userId) {
  let blob = null;
  try {
    const res = await raw(`/rest/v1/profiles?select=key_blob&id=eq.${userId}`, {
      headers: { apikey: CLOUD_KEY, Authorization: `Bearer ${token}` },
    });
    const rows = await readJson(res);
    blob = rows?.[0]?.key_blob || null;
  } catch {
    /* offline blip: fall through with a fresh salt */
  }
  const iter = blob?.iter || ITER;
  const salt = blob?.salt ? unb64(blob.salt) : crypto.getRandomValues(new Uint8Array(16));
  const key = await deriveKey(password, salt, iter);
  await kv.set('vault', { userId, key, salt: b64(salt), iter });
  if (!blob) return null;
  try {
    return await decryptBlob(key, blob);
  } catch {
    return null;
  }
}

/** The key saved in the cloud, decrypted. `locked` means this device has no vault key (sign in again). */
export async function fetchRemoteKey() {
  const v = await kv.get('vault');
  const s = session;
  if (!v || !s || v.userId !== s.user_id) return { locked: true, key: null };
  const rows = await restJson(`/rest/v1/profiles?select=key_blob&id=eq.${s.user_id}`);
  const blob = rows?.[0]?.key_blob;
  if (!blob) return { locked: false, key: null };
  try {
    return { locked: false, key: await decryptBlob(v.key, blob) };
  } catch {
    return { locked: false, key: null, stale: true };
  }
}

export async function pushKey(apiKey) {
  const v = await kv.get('vault');
  const s = session;
  if (!v || !s || v.userId !== s.user_id) throw new CloudError('Sign in again to save your key.', 'locked');
  const blob = apiKey ? await encryptWith(v.key, unb64(v.salt), v.iter, apiKey) : null;
  await restJson(`/rest/v1/profiles?id=eq.${s.user_id}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ key_blob: blob }),
  });
}

/* ---------- account actions ---------- */

export async function signIn(username, password) {
  const u = normUser(username);
  if (!USERNAME_RE.test(u)) throw new CloudError(USERNAME_HELP, 'invalid');
  needCrypto();
  const res = await raw('/auth/v1/token?grant_type=password', {
    method: 'POST',
    headers: baseHeaders(),
    body: JSON.stringify({ email: emailFor(u), password }),
  });
  const d = await readJson(res);
  if (!res.ok) {
    throw new CloudError(
      res.status === 429 ? 'Too many tries. Wait a minute and try again.' : 'Wrong username or password.',
      res.status === 429 ? 'rate_limited' : 'bad_login',
      res.status,
    );
  }
  // Vault first, then the session, so anything that reacts to the session finds the key ready.
  const remoteKey = await unlockVault(password, d.access_token, d.user.id);
  setSession(toSession(d, u));
  return { remoteKey };
}

export async function signUp(username, password) {
  const u = normUser(username);
  if (!USERNAME_RE.test(u)) throw new CloudError(USERNAME_HELP, 'invalid');
  if (String(password).length < 8) throw new CloudError('Password must be at least 8 characters.', 'invalid');
  needCrypto();
  const d = await callAccount({ action: 'signup', username: u, password });
  await signIn(u, password);
  return { codes: d.codes };
}

export async function resetPassword(username, code, newPassword) {
  const u = normUser(username);
  if (String(newPassword).length < 8) throw new CloudError('New password must be at least 8 characters.', 'invalid');
  needCrypto();
  const d = await callAccount({ action: 'reset', username: u, code, newPassword });
  await signIn(u, newPassword);
  return { codesLeft: d.codesLeft };
}

export async function regenCodes() {
  const d = await callAccount({ action: 'regen' }, true);
  return d.codes;
}

export async function signOut() {
  const s = session;
  setSession(null);
  await kv.del('vault');
  local.remove('charcoal:sync');
  if (s) {
    // Best effort: tell the server to drop the refresh token.
    raw('/auth/v1/logout', { method: 'POST', headers: { ...baseHeaders(), Authorization: `Bearer ${s.access_token}` } }).catch(() => {});
  }
}

export async function deleteAccount() {
  await callAccount({ action: 'delete' }, true);
  setSession(null);
  await kv.del('vault');
}
