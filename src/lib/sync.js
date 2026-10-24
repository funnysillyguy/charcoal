// Cloud sync for your characters and personas (chats stay on the device).
// Last write wins per item, using each item's updatedAt stamp. Deletes travel as tombstones.
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { DEFAULT_PERSONA } from '../data/characters.js';
import { CloudError, CLOUD_ENABLED, fetchRemoteKey, getSession, pushKey, restJson, useSession } from './cloud.js';
import { useSettings, useStore } from './store.jsx';

const MAX_ROW_CHARS = 900_000; // keep rows well under PostgREST's request limit
const stampOf = (x) => Number(x?.updatedAt) || Number(x?.createdAt) || 1;
const rowId = (kind, id) => `${kind === 'persona' ? 'persona' : 'char'}:${id}`;
const kindOf = (rid) => (rid.startsWith('persona:') ? 'persona' : 'character');
const chunks = (arr, n) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));

/* ---------- status ---------- */

let status = { phase: 'idle', at: 0, error: '', skipped: 0 };
const statusListeners = new Set();
function setStatus(patch) {
  status = { ...status, ...patch };
  statusListeners.forEach((fn) => fn());
}
const subscribeStatus = (fn) => {
  statusListeners.add(fn);
  return () => statusListeners.delete(fn);
};
export function useSyncStatus() {
  return useSyncExternalStore(subscribeStatus, () => status, () => status);
}

/* ---------- one sync pass ---------- */

function collectLocal(state) {
  const m = new Map();
  for (const c of state.customCharacters) m.set(rowId('character', c.id), { kind: 'character', item: c, ts: stampOf(c) });
  for (const p of state.personas) {
    if (p.id !== DEFAULT_PERSONA.id) m.set(rowId('persona', p.id), { kind: 'persona', item: p, ts: stampOf(p) });
  }
  return m;
}

async function syncOnce({ getState, dispatch }) {
  const state = getState();
  const local = collectLocal(state);
  const tombs = state.tombstones || {};

  // 1. Cheap listing: ids, delete flags and timestamps only (no avatars).
  const listing = await restJson('/rest/v1/characters?select=id,deleted,ts:data-%3E%3EupdatedAt&limit=5000');
  const remote = new Map(listing.map((r) => [r.id, { deleted: r.deleted, ts: Number(r.ts) || 0 }]));

  const pull = [];
  const push = [];
  const pushDeleted = [];
  const removes = [];
  const clearTombs = [];

  for (const [id, r] of remote) {
    const l = local.get(id);
    const tomb = tombs[id];
    if (r.deleted) {
      if (l && l.ts > r.ts) push.push(id); // edited here after it was deleted elsewhere: keep it
      else if (l) removes.push({ kind: l.kind, id: l.item.id, ts: r.ts });
      if (tomb) clearTombs.push(id);
      continue;
    }
    if (tomb) {
      if (tomb >= r.ts) {
        pushDeleted.push(id);
        continue;
      }
      clearTombs.push(id); // changed elsewhere after we deleted it: theirs wins
    }
    if (!l || r.ts > l.ts) pull.push(id);
    else if (l.ts > r.ts) push.push(id);
  }
  for (const id of local.keys()) if (!remote.has(id)) push.push(id);
  for (const id of Object.keys(tombs)) if (!remote.has(id)) clearTombs.push(id); // never reached the cloud

  // 2. Download what's newer remotely.
  const upserts = [];
  for (const batch of chunks(pull, 15)) {
    const list = encodeURIComponent(batch.map((i) => `"${i.replace(/"/g, '')}"`).join(','));
    const rows = await restJson(`/rest/v1/characters?select=id,data&id=in.(${list})`);
    for (const row of rows || []) {
      const d = row.data || {};
      if (!d.item?.id) continue;
      upserts.push({ kind: d.kind === 'persona' ? 'persona' : 'character', item: d.item, ts: Number(d.updatedAt) || 1 });
    }
  }

  // 3. Upload what's newer here (and deletes).
  const now = new Date().toISOString();
  let skipped = 0;
  const rows = [];
  for (const id of push) {
    const l = local.get(id);
    const row = { id, data: { kind: l.kind, updatedAt: l.ts, item: l.item }, deleted: false, updated_at: now };
    if (JSON.stringify(row).length > MAX_ROW_CHARS) {
      skipped++;
      continue;
    }
    rows.push(row);
  }
  for (const id of pushDeleted) {
    rows.push({ id, data: { kind: kindOf(id), updatedAt: tombs[id] }, deleted: true, updated_at: now });
  }
  for (const batch of chunks(rows, 8)) {
    await restJson('/rest/v1/characters?on_conflict=owner,id', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify(batch),
    });
  }
  clearTombs.push(...pushDeleted);

  if (upserts.length || removes.length || clearTombs.length) {
    dispatch({ type: 'sync/apply', upserts, removes, clearTombs });
  }
  return { pulled: upserts.length, pushed: rows.length, removed: removes.length, skipped };
}

/* ---------- scheduler ---------- */

let api = null;
let running = false;
let again = false;

export async function requestSync() {
  if (!api || !getSession()) return;
  if (running) {
    again = true;
    return;
  }
  running = true;
  setStatus({ phase: 'syncing', error: '' });
  try {
    const r = await syncOnce(api);
    setStatus({ phase: 'ok', at: Date.now(), skipped: r.skipped });
  } catch (e) {
    if (e instanceof CloudError && e.code === 'offline') setStatus({ phase: 'offline' });
    else if (e instanceof CloudError && e.code === 'signed_out') setStatus({ phase: 'idle' });
    else setStatus({ phase: 'error', error: e?.message || 'Sync failed' });
  } finally {
    running = false;
    if (again) {
      again = false;
      setTimeout(requestSync, 400);
    }
  }
}

/** Mount once inside the store + settings providers. Keeps characters, personas and the API key in sync. */
export function useCloudSync() {
  const { state, dispatch, getState } = useStore();
  const { settings, updateSettings } = useSettings();
  const session = useSession();
  const uid = session?.user_id || null;

  useEffect(() => {
    api = { getState, dispatch };
  }, [getState, dispatch]);

  useEffect(() => {
    if (!uid) setStatus({ phase: 'idle', at: 0, error: '' });
  }, [uid]);

  // Characters + personas: sync shortly after any change, and whenever the tab comes back.
  const sig = useMemo(
    () =>
      [
        state.customCharacters.map((c) => `${c.id}:${stampOf(c)}`).join('|'),
        state.personas.map((p) => `${p.id}:${stampOf(p)}`).join('|'),
        Object.keys(state.tombstones || {}).join('|'),
      ].join('#'),
    [state.customCharacters, state.personas, state.tombstones],
  );

  useEffect(() => {
    if (!CLOUD_ENABLED || !uid || !state.hydrated) return undefined;
    const t = setTimeout(requestSync, 1500);
    return () => clearTimeout(t);
  }, [uid, sig, state.hydrated]);

  useEffect(() => {
    if (!CLOUD_ENABLED || !uid) return undefined;
    const onVis = () => document.visibilityState === 'visible' && requestSync();
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('online', onVis);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('online', onVis);
    };
  }, [uid]);

  // API key: pull the encrypted copy on sign-in, push local changes after.
  const keyRef = useRef({ remote: '', loaded: false });
  const [keyReady, setKeyReady] = useState(0);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  useEffect(() => {
    keyRef.current = { remote: '', loaded: false };
    if (!CLOUD_ENABLED || !uid) return undefined;
    let dead = false;
    (async () => {
      try {
        const r = await fetchRemoteKey();
        if (dead || r.locked) return;
        keyRef.current = { remote: r.key || '', loaded: true };
        if (r.key && !(settingsRef.current.apiKey || '').trim()) updateSettings({ apiKey: r.key, lastCheck: null });
        setKeyReady((n) => n + 1);
      } catch {
        /* offline: try again next sign-in or reload */
      }
    })();
    return () => {
      dead = true;
    };
  }, [uid, updateSettings]);

  useEffect(() => {
    if (!CLOUD_ENABLED || !uid || !keyRef.current.loaded) return undefined;
    const k = (settings.apiKey || '').trim();
    if (k === keyRef.current.remote) return undefined;
    const t = setTimeout(async () => {
      try {
        await pushKey(k);
        keyRef.current.remote = k;
      } catch (e) {
        setStatus({ phase: 'error', error: e?.message || 'Couldn’t save your key' });
      }
    }, 1200);
    return () => clearTimeout(t);
  }, [settings.apiKey, uid, keyReady]);
}
