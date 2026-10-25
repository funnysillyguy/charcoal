// Thanks + notification center. Thanks go through the `social` edge function (so nobody can fake one);
// notifications are read straight from the table (row-level security: you only see your own).
import { useEffect, useSyncExternalStore } from 'react';
import { CLOUD_ENABLED, CLOUD_KEY, CLOUD_URL, accessToken, getSession, restJson, useSession } from './cloud.js';

const SOCIAL = `${CLOUD_URL}/functions/v1/social`;
const POLL_MS = 60_000;

async function social(path, init = {}) {
  const token = await accessToken();
  const res = await fetch(`${SOCIAL}${path}`, {
    ...init,
    headers: { apikey: CLOUD_KEY, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init.headers || {}) },
  });
  const d = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(d?.error?.message || 'Something went wrong.');
  return d;
}

/* ---------- tiny external store ---------- */
let state = { sponsor: null, isSponsor: false, thankedToday: false, items: [], unread: 0, loaded: false };
const listeners = new Set();
const set = (patch) => {
  state = { ...state, ...patch };
  listeners.forEach((fn) => fn());
};
const subscribe = (fn) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};
const snap = () => state;

export async function refreshSponsor() {
  if (!CLOUD_ENABLED || !getSession()) return set({ sponsor: null, isSponsor: false, thankedToday: false });
  try {
    const d = await social('/sponsor');
    set({ sponsor: d.sponsor, isSponsor: d.isSponsor, thankedToday: d.thankedToday });
  } catch {
    /* offline */
  }
}

export async function sendThanks() {
  const d = await social('/thanks', { method: 'POST', body: '{}' });
  set({ thankedToday: true });
  return d;
}

export async function refreshNotifications() {
  if (!CLOUD_ENABLED || !getSession()) return set({ items: [], unread: 0, loaded: false });
  try {
    const items = await restJson('/rest/v1/notifications?select=id,kind,actor_username,body,created_at,read_at&order=created_at.desc&limit=50');
    set({ items: items || [], unread: (items || []).filter((n) => !n.read_at).length, loaded: true });
  } catch {
    /* offline */
  }
}

export async function markAllRead() {
  const ids = state.items.filter((n) => !n.read_at).map((n) => n.id);
  if (!ids.length) return;
  const now = new Date().toISOString();
  set({ items: state.items.map((n) => (n.read_at ? n : { ...n, read_at: now })), unread: 0 });
  try {
    await restJson(`/rest/v1/notifications?id=in.(${ids.join(',')})`, {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ read_at: now }),
    });
  } catch {
    refreshNotifications();
  }
}

/** Notification feed + sponsor info, kept fresh while signed in (poll + on tab focus). */
export function useSocial() {
  const session = useSession();
  const uid = session?.user_id || null;
  useEffect(() => {
    if (!uid) {
      set({ items: [], unread: 0, sponsor: null, isSponsor: false, thankedToday: false, loaded: false });
      return undefined;
    }
    refreshNotifications();
    refreshSponsor();
    const t = setInterval(refreshNotifications, POLL_MS);
    const onVis = () => document.visibilityState === 'visible' && refreshNotifications();
    document.addEventListener('visibilitychange', onVis);
    return () => {
      clearInterval(t);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [uid]);
  return useSyncExternalStore(subscribe, snap, snap);
}

export const badgeText = (n) => (n > 9 ? '9+' : String(n));
