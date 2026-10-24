// App state: a tiny external store (useSyncExternalStore) so getState() is current
// immediately after dispatch, which the streaming engine relies on.
// Persisted to IndexedDB (chats can hold lots of text); images live in their own store.
import { createContext, useContext, useEffect, useMemo, useState, useSyncExternalStore, useCallback } from 'react';
import { SEED_CHARACTERS, DEFAULT_PERSONA } from '../data/characters.js';
import { kv } from './storage.js';
import { uid, deleteImages } from './images.js';
import { loadSettings, saveSettings, providerStatus, SANDBOXED } from './settings.js';
import { getSample } from './hostAI.js';
import { useShared } from './endpoint.js';

const STATE_KEY = 'state:v1';

const initialState = {
  hydrated: false,
  customCharacters: [],
  extraInteractions: {},
  chats: {},
  personas: [DEFAULT_PERSONA],
  activePersonaId: DEFAULT_PERSONA.id,
  tombstones: {}, // cloud sync: rowId -> deletedAt, until the delete reaches the server
};

const stampOf = (x) => Number(x?.updatedAt) || Number(x?.createdAt) || 1;

/* ---------- helpers ---------- */

function greetingMessage(character) {
  const greetings = (character.greetings || []).filter((g) => g && g.trim());
  return {
    id: uid('msg'),
    role: 'char',
    greeting: true,
    createdAt: Date.now(),
    active: 0,
    variants: (greetings.length ? greetings : ['*{{char}} looks up as you arrive.* Hi, {{user}}.']).map((text) => ({
      id: uid('v'),
      text,
      status: 'done',
      meta: { provider: 'greeting' },
    })),
  };
}

function newChat(character) {
  const now = Date.now();
  return { characterId: character.id, messages: [greetingMessage(character)], mood: '', createdAt: now, updatedAt: now };
}

function updateChat(state, charId, fn, touch = true) {
  const chat = state.chats[charId];
  if (!chat) return state;
  const next = fn(chat);
  if (next === chat) return state;
  return { ...state, chats: { ...state.chats, [charId]: touch ? { ...next, updatedAt: Date.now() } : next } };
}

function updateMessage(chat, msgId, fn) {
  let changed = false;
  const messages = chat.messages.map((m) => {
    if (m.id !== msgId) return m;
    const n = fn(m);
    if (n !== m) changed = true;
    return n;
  });
  return changed ? { ...chat, messages } : chat;
}

function updateVariant(msg, variantId, fn) {
  let changed = false;
  const variants = msg.variants.map((v) => {
    if (v.id !== variantId) return v;
    changed = true;
    return fn(v);
  });
  return changed ? { ...msg, variants } : msg;
}

const pendingVariant = (id) => ({ id, text: '', status: 'pending', meta: null });

function imageIdsOf(chat) {
  return (chat?.messages || []).flatMap((m) => (m.images || []).map((i) => i.id));
}

/** Messages left mid-stream when the tab closed become "stopped" (or disappear if empty). */
function sanitize(state) {
  const chats = {};
  for (const [id, chat] of Object.entries(state.chats || {})) {
    const messages = [];
    for (const m of chat.messages || []) {
      if (m.role !== 'char') {
        messages.push(m);
        continue;
      }
      let variants = m.variants.map((v) => ({
        ...v,
        id: v.id || uid('v'),
        status: v.status === 'pending' || v.status === 'streaming' ? (v.text ? 'stopped' : 'empty') : v.status,
      }));
      variants = variants.filter((v) => v.status !== 'empty');
      if (!variants.length) continue;
      messages.push({ ...m, variants, active: Math.min(m.active || 0, variants.length - 1) });
    }
    chats[id] = { ...chat, messages };
  }
  return { ...state, chats };
}

/* ---------- reducer ---------- */

function reducer(state, action) {
  switch (action.type) {
    case 'hydrate':
      return { ...initialState, ...sanitize(action.state || {}), hydrated: true };

    case 'chat/ensure': {
      const c = action.character;
      if (state.chats[c.id]) return state;
      return { ...state, chats: { ...state.chats, [c.id]: newChat(c) } };
    }
    case 'chat/reset': {
      const c = action.character;
      const prev = state.chats[c.id];
      return { ...state, chats: { ...state.chats, [c.id]: { ...newChat(c), mood: prev?.mood || '' } } };
    }
    case 'chat/delete': {
      if (!state.chats[action.charId]) return state;
      const chats = { ...state.chats };
      delete chats[action.charId];
      return { ...state, chats };
    }
    case 'chat/mood':
      return updateChat(state, action.charId, (chat) => ({ ...chat, mood: action.mood }), false);

    case 'msg/user':
      return updateChat(state, action.charId, (chat) => ({ ...chat, messages: [...chat.messages, action.message] }));

    case 'msg/char': // a new character turn with N parallel drafts
      return updateChat(state, action.charId, (chat) => ({
        ...chat,
        messages: [
          ...chat.messages,
          {
            id: action.messageId,
            role: 'char',
            createdAt: Date.now(),
            active: 0,
            variants: action.variantIds.map(pendingVariant),
          },
        ],
      }));

    case 'msg/variant': // one more swipe on an existing message
      return updateChat(state, action.charId, (chat) =>
        updateMessage(chat, action.messageId, (m) => ({
          ...m,
          variants: [...m.variants, pendingVariant(action.variantId)],
          active: m.variants.length,
        })),
      );

    case 'msg/retry': // rewrite one failed draft in place
      return updateChat(state, action.charId, (chat) =>
        updateMessage(chat, action.messageId, (m) => updateVariant(m, action.variantId, (v) => pendingVariant(v.id))),
      );

    case 'msg/meta':
      return updateChat(
        state,
        action.charId,
        (chat) =>
          updateMessage(chat, action.messageId, (m) => updateVariant(m, action.variantId, (v) => ({ ...v, meta: action.meta }))),
        false,
      );

    case 'msg/append':
      return updateChat(
        state,
        action.charId,
        (chat) =>
          updateMessage(chat, action.messageId, (m) =>
            updateVariant(m, action.variantId, (v) => ({
              ...v,
              status: 'streaming',
              text: v.text + (action.content || ''),
              reasoning: (v.reasoning || '') + (action.reasoning || ''),
            })),
          ),
        false,
      );

    case 'msg/finish':
      return updateChat(state, action.charId, (chat) => {
        const msg = chat.messages.find((m) => m.id === action.messageId);
        const v = msg?.variants.find((x) => x.id === action.variantId);
        if (!msg || !v) return chat;
        // Stopped before the first token: drop that draft (or the whole message if it was the last one).
        if (action.status === 'stopped' && !v.text) {
          const variants = msg.variants.filter((x) => x.id !== v.id);
          if (!variants.length) return { ...chat, messages: chat.messages.filter((m) => m.id !== msg.id) };
          const activeId = msg.variants[msg.active]?.id;
          const keep = variants.findIndex((x) => x.id === activeId);
          return updateMessage(chat, msg.id, () => ({
            ...msg,
            variants,
            active: keep >= 0 ? keep : Math.min(msg.active, variants.length - 1),
          }));
        }
        return updateMessage(chat, msg.id, (m) =>
          updateVariant(m, v.id, (cur) => ({
            ...cur,
            status: action.status,
            error: action.error || null,
            meta: cur.meta ? { ...cur.meta, finishReason: action.finishReason || cur.meta.finishReason } : cur.meta,
          })),
        );
      });

    case 'msg/swipe':
      return updateChat(
        state,
        action.charId,
        (chat) =>
          updateMessage(chat, action.messageId, (m) => ({
            ...m,
            active: Math.max(0, Math.min(action.index, m.variants.length - 1)),
          })),
        false,
      );

    case 'msg/rate':
      return updateChat(
        state,
        action.charId,
        (chat) =>
          updateMessage(chat, action.messageId, (m) =>
            updateVariant(m, action.variantId, (v) => ({ ...v, rating: v.rating === action.rating ? null : action.rating })),
          ),
        false,
      );

    case 'msg/delete':
      return updateChat(state, action.charId, (chat) => ({
        ...chat,
        messages: chat.messages.filter((m) => m.id !== action.messageId),
      }));

    case 'character/save': {
      const c = { ...action.character, updatedAt: Date.now() };
      const exists = state.customCharacters.some((x) => x.id === c.id);
      return {
        ...state,
        customCharacters: exists
          ? state.customCharacters.map((x) => (x.id === c.id ? c : x))
          : [c, ...state.customCharacters],
      };
    }
    case 'character/delete': {
      const chats = { ...state.chats };
      delete chats[action.id];
      return {
        ...state,
        customCharacters: state.customCharacters.filter((x) => x.id !== action.id),
        chats,
        tombstones: { ...state.tombstones, [`char:${action.id}`]: Date.now() },
      };
    }

    case 'persona/save': {
      const p = { ...action.persona, updatedAt: Date.now() };
      const exists = state.personas.some((x) => x.id === p.id);
      return {
        ...state,
        personas: exists ? state.personas.map((x) => (x.id === p.id ? p : x)) : [...state.personas, p],
        activePersonaId: action.select ? p.id : state.activePersonaId,
      };
    }
    case 'persona/select':
      return { ...state, activePersonaId: action.id };
    case 'persona/delete': {
      if (state.personas.length <= 1) return state;
      const personas = state.personas.filter((p) => p.id !== action.id);
      return {
        ...state,
        personas,
        activePersonaId: state.activePersonaId === action.id ? personas[0].id : state.activePersonaId,
        tombstones: { ...state.tombstones, [`persona:${action.id}`]: Date.now() },
      };
    }

    case 'sync/apply': {
      let { customCharacters, personas, chats } = state;
      for (const u of action.upserts || []) {
        const item = { ...u.item, updatedAt: u.ts };
        if (u.kind === 'persona') {
          const ex = personas.find((x) => x.id === item.id);
          if (ex && stampOf(ex) >= u.ts) continue;
          personas = ex ? personas.map((x) => (x.id === item.id ? item : x)) : [...personas, item];
        } else {
          const ex = customCharacters.find((x) => x.id === item.id);
          if (ex && stampOf(ex) >= u.ts) continue;
          customCharacters = ex ? customCharacters.map((x) => (x.id === item.id ? item : x)) : [item, ...customCharacters];
        }
      }
      for (const r of action.removes || []) {
        if (r.kind === 'persona') {
          const ex = personas.find((x) => x.id === r.id);
          if (!ex || stampOf(ex) > r.ts || personas.length <= 1) continue;
          personas = personas.filter((x) => x.id !== r.id);
        } else {
          const ex = customCharacters.find((x) => x.id === r.id);
          if (!ex || stampOf(ex) > r.ts) continue;
          customCharacters = customCharacters.filter((x) => x.id !== r.id);
          if (chats[r.id]) {
            chats = { ...chats };
            delete chats[r.id];
          }
        }
      }
      const tombstones = { ...state.tombstones };
      for (const id of action.clearTombs || []) delete tombstones[id];
      const activePersonaId = personas.some((p) => p.id === state.activePersonaId) ? state.activePersonaId : personas[0].id;
      return { ...state, customCharacters, personas, chats, tombstones, activePersonaId };
    }

    case 'local/wipe':
      return { ...initialState, hydrated: true };

    case 'stats/bump':
      return {
        ...state,
        extraInteractions: {
          ...state.extraInteractions,
          [action.charId]: (state.extraInteractions[action.charId] || 0) + 1,
        },
      };

    default:
      return state;
  }
}

/* ---------- store ---------- */

function createStore() {
  let state = initialState;
  const listeners = new Set();
  let saveTimer = null;

  const persist = () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      // eslint-disable-next-line no-unused-vars
      const { hydrated, ...rest } = state;
      kv.set(STATE_KEY, rest);
    }, 500);
  };

  return {
    getState: () => state,
    subscribe: (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    dispatch: (action) => {
      // Clean up stored images when their chat goes away.
      if (action.type === 'chat/delete' || action.type === 'chat/reset' || action.type === 'character/delete') {
        const id = action.charId || action.id || action.character?.id;
        const ids = imageIdsOf(state.chats[id]);
        if (ids.length) deleteImages(ids);
      }
      const next = reducer(state, action);
      if (next === state) return;
      state = next;
      listeners.forEach((fn) => fn());
      if (state.hydrated && action.type !== 'hydrate') persist();
    },
  };
}

const store = createStore();
const StoreContext = createContext(store);
const SettingsContext = createContext(null);

export function StoreProvider({ children }) {
  const [settings, setSettings] = useState(loadSettings);
  const [hostAI, setHostAI] = useState(SANDBOXED ? 'pending' : 'none');

  useEffect(() => {
    if (!SANDBOXED) return;
    getSample().then((s) => setHostAI(s ? 'ready' : 'none'));
  }, []);

  useEffect(() => {
    let alive = true;
    kv.get(STATE_KEY).then((saved) => {
      if (alive) store.dispatch({ type: 'hydrate', state: saved || {} });
    });
    return () => {
      alive = false;
    };
  }, []);

  const updateSettings = useCallback((patch) => {
    setSettings((prev) => {
      const next = { ...prev, ...(typeof patch === 'function' ? patch(prev) : patch) };
      saveSettings(next);
      return next;
    });
  }, []);

  const settingsValue = useMemo(() => ({ settings, updateSettings, hostAI }), [settings, updateSettings, hostAI]);

  return (
    <StoreContext.Provider value={store}>
      <SettingsContext.Provider value={settingsValue}>{children}</SettingsContext.Provider>
    </StoreContext.Provider>
  );
}

export function useStore() {
  const s = useContext(StoreContext);
  const state = useSyncExternalStore(s.subscribe, s.getState, s.getState);
  return { state, dispatch: s.dispatch, getState: s.getState };
}

export function useSettings() {
  return useContext(SettingsContext);
}

/** Which engine writes replies right now (DeepSeek, Claude in the hosted page, or demo). */
export function useProvider() {
  const { settings, hostAI } = useContext(SettingsContext);
  const shared = useShared();
  return providerStatus(settings, hostAI, shared);
}

/* ---------- derived selectors ---------- */

export function useCharacters() {
  const { state } = useStore();
  return useMemo(() => {
    const extra = state.extraInteractions;
    const seeds = SEED_CHARACTERS.map((c) => ({ ...c, custom: false, interactions: c.interactions + (extra[c.id] || 0) }));
    const custom = state.customCharacters.map((c) => ({
      ...c,
      custom: true,
      interactions: (c.interactions || 0) + (extra[c.id] || 0),
    }));
    return [...custom, ...seeds];
  }, [state.customCharacters, state.extraInteractions]);
}

export function useCharacter(id) {
  const all = useCharacters();
  return all.find((c) => c.id === id) || null;
}

export function useActivePersona() {
  const { state } = useStore();
  return state.personas.find((p) => p.id === state.activePersonaId) || state.personas[0] || DEFAULT_PERSONA;
}
