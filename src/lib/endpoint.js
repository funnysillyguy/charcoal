// Where AI requests go: your own DeepSeek key if you set one, otherwise Charcoal's built-in AI
// (the owner's key, held server-side; the browser only ever sends its sign-in token).
import { useEffect, useSyncExternalStore } from 'react';
import { effectiveKey, effectiveBaseUrl } from './settings.js';
import { CLOUD_ENABLED, CLOUD_KEY, CLOUD_URL, accessToken, getSession, useSession } from './cloud.js';

export const SHARED_BASE = `${CLOUD_URL}/functions/v1/ai`;
export const SHARED_MODEL = 'deepseek-flash';

export async function resolveEndpoint(settings) {
  const own = effectiveKey(settings);
  if (own) return { baseUrl: effectiveBaseUrl(settings), apiKey: own, headers: {}, shared: false, model: settings.model };
  if (CLOUD_ENABLED && getSession()) {
    try {
      const token = await accessToken();
      return { baseUrl: SHARED_BASE, apiKey: token, headers: { apikey: CLOUD_KEY }, shared: true, model: SHARED_MODEL };
    } catch {
      return null;
    }
  }
  return null;
}

/* ---------- built-in AI status (enabled? today's usage?) ---------- */

let status = { signedIn: false, enabled: null };
const listeners = new Set();
const set = (s) => {
  status = s;
  listeners.forEach((fn) => fn());
};

export async function refreshShared() {
  if (!CLOUD_ENABLED || !getSession()) return set({ signedIn: false, enabled: null });
  try {
    const token = await accessToken();
    const res = await fetch(`${SHARED_BASE}/status`, { headers: { Authorization: `Bearer ${token}`, apikey: CLOUD_KEY } });
    const d = await res.json();
    set({ ...d, signedIn: true });
  } catch {
    set({ signedIn: true, enabled: null });
  }
}

export async function setSharedKey(key) {
  const token = await accessToken();
  const res = await fetch(`${SHARED_BASE}/key`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, apikey: CLOUD_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ key }),
  });
  const d = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(d?.error?.message || 'Couldn’t update the built-in key.');
  await refreshShared();
  return d;
}

const subscribe = (fn) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

/** Built-in AI status, refreshed whenever the signed-in user changes. */
export function useShared() {
  const session = useSession();
  const uid = session?.user_id || null;
  useEffect(() => {
    refreshShared();
  }, [uid]);
  return useSyncExternalStore(subscribe, () => status, () => status);
}
