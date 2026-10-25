// Real chat counts: how many different people have chatted with each character (one per account).
// Totals come from a public function; recording a chat needs a signed-in account.
import { useSyncExternalStore } from 'react';
import { CLOUD_ENABLED, CLOUD_KEY, CLOUD_URL, getSession, restJson } from './cloud.js';
import { local } from './storage.js';
import { formatCount } from './format.js';

let counts = {};
let ready = !CLOUD_ENABLED; // false until the first answer (or failure), so badges show a skeleton, not a wrong "New"
const listeners = new Set();
const emit = () => listeners.forEach((fn) => fn());
const RECORDED_KEY = 'charcoal:chatted';

export async function refreshCounts() {
  if (!CLOUD_ENABLED) return;
  try {
    const res = await fetch(`${CLOUD_URL}/rest/v1/rpc/chat_counts`, {
      method: 'POST',
      headers: { apikey: CLOUD_KEY, 'Content-Type': 'application/json' },
      body: '{}',
    });
    if (res.ok) {
      const rows = await res.json();
      counts = Object.fromEntries(rows.map((r) => [r.character_id, Number(r.chats) || 0]));
    }
  } catch {
    /* offline: keep what we have */
  }
  ready = true;
  emit();
}

/** Count this account as having chatted with a character (once, ever). */
export async function recordChatStart(characterId) {
  const s = getSession();
  if (!CLOUD_ENABLED || !s || !characterId) return;
  const key = `${s.user_id}:${characterId}`;
  const done = local.get(RECORDED_KEY, []) || [];
  if (done.includes(key)) return;
  try {
    await restJson('/rest/v1/chat_starts', {
      method: 'POST',
      headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' },
      body: JSON.stringify({ character_id: String(characterId).slice(0, 80) }),
    });
    local.set(RECORDED_KEY, [...done, key].slice(-2000));
    refreshCounts();
  } catch {
    /* try again next message */
  }
}

if (CLOUD_ENABLED) {
  refreshCounts();
  setInterval(refreshCounts, 5 * 60_000);
}

const subscribe = (fn) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};
export function useCounts() {
  return useSyncExternalStore(subscribe, () => counts, () => counts);
}

export function useCountsReady() {
  return useSyncExternalStore(subscribe, () => ready, () => ready);
}

/** "New" until someone real has chatted; then "1 chat", "12 chats", "1.2k chats". */
export function chatsLabel(n, { short = false } = {}) {
  if (!n) return 'New';
  return short ? formatCount(n) : `${formatCount(n)} ${n === 1 ? 'chat' : 'chats'}`;
}
