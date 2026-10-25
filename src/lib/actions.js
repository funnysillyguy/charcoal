// Charcoal Chat actions: things it can do in the app for you (settings, chats, characters, persona,
// account). Every action stops at a permission box in the chat and runs only if you allow it.
// Low-risk actions can be allowed for the rest of a chat; account-level ones ask every time.
import { useSyncExternalStore } from 'react';
import { CATEGORIES, SEED_CHARACTERS } from '../data/characters.js';
import { generateAvatar } from '../components/emblems.js';
import { uid } from './images.js';
import { deleteAccount, getSession, signOut } from './cloud.js';

/* ---------- the app side (registered by the shell) ---------- */

let host = null; // { dispatch, getState, updateSettings, getSettings, ui }
export function registerActionHost(h) {
  host = h;
  return () => {
    if (host === h) host = null;
  };
}
export const actionsAvailable = () => !!host;

/* ---------- pending permission requests ---------- */

let pending = [];
const subs = new Set();
const emit = () => subs.forEach((f) => f());
const subscribe = (f) => {
  subs.add(f);
  return () => subs.delete(f);
};
export function usePendingApproval(variantId) {
  const list = useSyncExternalStore(subscribe, () => pending, () => pending);
  return variantId ? list.find((p) => p.variantId === variantId) || null : null;
}

/** Ask the person. Resolves 'once' | 'always' | 'deny'; rejects with AbortError if the reply is stopped. */
export function requestApproval(req, signal) {
  return new Promise((resolve, reject) => {
    const id = uid('perm');
    const done = (fn, v) => {
      pending = pending.filter((p) => p.id !== id);
      emit();
      signal?.removeEventListener?.('abort', onAbort);
      fn(v);
    };
    const onAbort = () => done(reject, new DOMException('Aborted', 'AbortError'));
    if (signal?.aborted) return onAbort();
    signal?.addEventListener?.('abort', onAbort);
    pending = [...pending, { ...req, id, answer: (decision) => done(resolve, decision) }];
    emit();
  });
}

/* ---------- things that should happen after the reply finishes (navigation, sign-out) ---------- */

const later = [];
const queueAfterReply = (fn) => later.push(fn);
export function runAfterReply() {
  const jobs = later.splice(0);
  setTimeout(() => jobs.forEach((fn) => fn()), 400);
}

/* ---------- helpers ---------- */

const ASST = 'asst:';
function characterById(id) {
  const s = host.getState();
  return SEED_CHARACTERS.find((c) => c.id === id) || s.customCharacters.find((c) => c.id === id) || null;
}
function chatName(id) {
  const s = host.getState();
  if (id.startsWith(ASST)) return `“${s.chats[id]?.title || 'Charcoal chat'}”`;
  return `your chat with ${characterById(id)?.name || 'that character'}`;
}
const count = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
const SETTING_LABELS = {
  typewriter: (v) => `Typewriter effect: ${v ? 'on' : 'off'}`,
  canvas: (v) => `Canvas and code runner: ${v ? 'on' : 'off'}`,
  thinking_default: (v) => `Thinking mode: ${v ? 'on' : 'off'}`,
  replies_per_message: (v) => `Replies per message: ${v}`,
  max_sentences: (v) => `Reply length: ${v ? `${v} sentences` : 'no cap'}`,
};

const fn = (name, description, properties = {}, required = []) => ({
  type: 'function',
  function: { name, description, parameters: { type: 'object', properties, required } },
});

/* ---------- the actions ---------- */
// risk: 'low' can be allowed for the whole chat; 'high' asks every time.
// ask(args, ctx) -> { title, lines[], warn? } or { error } when it can't be done.
// run(args, ctx) -> result for the model (and the activity line).

const ACTIONS = {
  update_settings: {
    risk: 'low',
    tool: fn(
      'update_settings',
      'Change Charcoal settings for the user. Only pass what should change.',
      {
        typewriter: { type: 'boolean', description: 'Replies type out letter by letter' },
        canvas: { type: 'boolean', description: 'Canvas previews and the code runner' },
        thinking_default: { type: 'boolean', description: 'Thinking mode for roleplay replies' },
        replies_per_message: { type: 'integer', enum: [1, 2, 3] },
        max_sentences: { type: 'integer', enum: [0, 3, 5, 8], description: '0 = no cap' },
      },
    ),
    ask(a) {
      const lines = Object.entries(a)
        .filter(([k]) => SETTING_LABELS[k])
        .map(([k, v]) => SETTING_LABELS[k](v));
      if (!lines.length) return { error: 'Nothing to change.' };
      return { title: 'Change your settings', lines };
    },
    run(a) {
      const patch = {};
      if (typeof a.typewriter === 'boolean') patch.typewriter = a.typewriter;
      if (typeof a.canvas === 'boolean') patch.canvas = a.canvas;
      if (typeof a.thinking_default === 'boolean') patch.thinking = a.thinking_default;
      if ([1, 2, 3].includes(Number(a.replies_per_message))) patch.repliesPerMessage = Number(a.replies_per_message);
      if ([0, 3, 5, 8].includes(Number(a.max_sentences))) patch.maxSentences = Number(a.max_sentences);
      host.updateSettings(patch);
      return { ok: true, changed: Object.keys(patch) };
    },
    done: () => 'Changed your settings',
  },

  delete_chat: {
    risk: 'high', // can't be undone: ask every time
    tool: fn('delete_chat', 'Delete one saved conversation (roleplay or Charcoal chat) from this device.', { chat_id: { type: 'string' } }, ['chat_id']),
    ask(a) {
      const chat = host.getState().chats[a.chat_id];
      if (!chat) return { error: `No chat with id "${a.chat_id}".` };
      return { title: `Delete ${chatName(a.chat_id)}`, lines: [`${count(chat.messages.length, 'message')} and any attachments are removed from this device.`], warn: 'This can’t be undone.' };
    },
    run(a, ctx) {
      const name = chatName(a.chat_id);
      if (a.chat_id === ctx.selfId) {
        queueAfterReply(() => {
          host.dispatch({ type: 'chat/delete', charId: a.chat_id });
          host.ui.goHome();
        });
        return { ok: true, note: 'This chat will be deleted as soon as this reply finishes.' };
      }
      host.dispatch({ type: 'chat/delete', charId: a.chat_id });
      return { ok: true, deleted: name };
    },
    done: (a) => `Deleted ${chatName(a.chat_id).replace(/^your /, 'your ')}`,
  },

  reset_chat: {
    risk: 'high', // can't be undone: ask every time
    tool: fn('reset_chat', 'Restart a roleplay chat from the character’s greeting (keeps the mood).', { chat_id: { type: 'string' } }, ['chat_id']),
    ask(a) {
      if (String(a.chat_id).startsWith(ASST)) return { error: 'Only roleplay chats can be reset. Charcoal chats can be deleted.' };
      const chat = host.getState().chats[a.chat_id];
      const c = characterById(a.chat_id);
      if (!chat || !c) return { error: `No roleplay chat with id "${a.chat_id}".` };
      return { title: `Reset your chat with ${c.name}`, lines: [`Everything after ${c.name}’s greeting is cleared (${count(chat.messages.length, 'message')} now).`], warn: 'This can’t be undone.' };
    },
    run(a) {
      host.dispatch({ type: 'chat/reset', character: characterById(a.chat_id) });
      return { ok: true };
    },
    done: (a) => `Reset your chat with ${characterById(a.chat_id)?.name || 'them'}`,
  },

  clear_chats: {
    risk: 'high',
    tool: fn(
      'clear_chats',
      'Delete many saved conversations on this device at once. The current Charcoal chat is always kept.',
      { scope: { type: 'string', enum: ['roleplay', 'charcoal', 'all'], description: 'roleplay chats, other Charcoal chats, or both' } },
      ['scope'],
    ),
    ask(a, ctx) {
      const ids = targets(a.scope, ctx.selfId);
      if (!ids.length) return { error: 'There are no chats like that to delete.' };
      const what = a.scope === 'roleplay' ? 'roleplay chats' : a.scope === 'charcoal' ? 'other Charcoal chats' : 'chats (roleplay and Charcoal)';
      return { title: `Delete ${ids.length} ${what}`, lines: ['Messages, swipes and attachments are removed from this device. Your characters and account stay.'], warn: 'This can’t be undone.' };
    },
    run(a, ctx) {
      const ids = targets(a.scope, ctx.selfId);
      for (const id of ids) host.dispatch({ type: 'chat/delete', charId: id });
      return { ok: true, deleted: ids.length };
    },
    done: (a, r) => `Deleted ${count(r?.deleted || 0, 'chat')}`,
  },

  create_character: {
    risk: 'low',
    tool: fn(
      'create_character',
      'Create a new custom character the user can chat with. Write a vivid persona and an opening greeting in the character’s voice (*actions* in asterisks, {{user}} for the user).',
      {
        name: { type: 'string' },
        tagline: { type: 'string', description: 'One short line' },
        description: { type: 'string', description: 'Two or three sentences shown on their profile' },
        persona: { type: 'string', description: 'Personality, background, voice and boundaries, written in second person ("You are…")' },
        greeting: { type: 'string', description: 'Their first message' },
        category: { type: 'string', enum: CATEGORIES },
        tags: { type: 'array', items: { type: 'string' } },
      },
      ['name', 'tagline', 'persona', 'greeting'],
    ),
    ask(a) {
      if (!String(a.name || '').trim()) return { error: 'A character needs a name.' };
      return { title: `Create a character: ${String(a.name).trim().slice(0, 60)}`, lines: [String(a.tagline || '').slice(0, 140), `Opens with: ${String(a.greeting || '').replace(/\s+/g, ' ').slice(0, 160)}…`].filter(Boolean) };
    },
    run(a) {
      const persona = host.getState().personas.find((p) => p.id === host.getState().activePersonaId);
      const now = Date.now();
      const name = String(a.name).trim().slice(0, 60);
      const character = {
        id: uid('char'),
        name,
        tagline: String(a.tagline || '').trim().slice(0, 140),
        description: String(a.description || a.tagline || '').trim().slice(0, 1200),
        greetings: [String(a.greeting || '').trim().slice(0, 4000)].filter(Boolean),
        category: CATEGORIES.includes(a.category) ? a.category : 'Roleplay',
        tags: (Array.isArray(a.tags) ? a.tags : []).map((t) => String(t).trim()).filter(Boolean).slice(0, 8),
        creator: persona?.name || 'you',
        sourceUrl: '',
        avatar: generateAvatar(`${name} ${a.tagline || ''} ${a.description || ''}`),
        mood: '',
        definition: { persona: String(a.persona || '').trim().slice(0, 8000), examples: '' },
        settings: { creativity: 50, temperature: 0.9, verbosity: 2 },
        visibility: 'private',
        interactions: 0,
        createdAt: now,
        updatedAt: now,
      };
      host.dispatch({ type: 'character/save', character });
      return { ok: true, character_id: character.id, name };
    },
    done: (a) => `Created ${String(a.name || 'a character').slice(0, 40)}`,
  },

  open_chat: {
    risk: 'low',
    tool: fn('open_chat', 'Take the user to a character’s chat (starting one if needed). Use find_character to get the id.', { character_id: { type: 'string' } }, ['character_id']),
    ask(a) {
      const c = characterById(a.character_id);
      if (!c) return { error: `No character with id "${a.character_id}". Use find_character first.` };
      return { title: `Open your chat with ${c.name}`, lines: ['Takes you there when this reply finishes.'] };
    },
    run(a) {
      const c = characterById(a.character_id);
      queueAfterReply(() => host.ui.openChat(c));
      return { ok: true, note: 'Opening after this reply.' };
    },
    done: (a) => `Opened ${characterById(a.character_id)?.name || 'the chat'}`,
  },

  update_persona: {
    risk: 'low',
    tool: fn(
      'update_persona',
      'Change the user’s active persona: the name and short bio characters know them by.',
      { name: { type: 'string' }, bio: { type: 'string' } },
    ),
    ask(a) {
      const lines = [a.name && `Name: ${String(a.name).slice(0, 40)}`, a.bio && `Bio: ${String(a.bio).slice(0, 160)}`].filter(Boolean);
      if (!lines.length) return { error: 'Nothing to change.' };
      return { title: 'Update your persona', lines };
    },
    run(a) {
      const s = host.getState();
      const p = s.personas.find((x) => x.id === s.activePersonaId) || s.personas[0];
      const next = { ...p, ...(a.name ? { name: String(a.name).trim().slice(0, 40) } : {}), ...(a.bio !== undefined ? { bio: String(a.bio).slice(0, 600) } : {}) };
      host.dispatch({ type: 'persona/save', persona: next, select: true });
      return { ok: true, persona: { name: next.name, bio: next.bio } };
    },
    done: () => 'Updated your persona',
  },

  set_mood: {
    risk: 'low',
    tool: fn('set_mood', 'Set the mood a character plays with in one roleplay chat ("" = their default).', { chat_id: { type: 'string' }, mood: { type: 'string' } }, ['chat_id', 'mood']),
    ask(a) {
      const c = characterById(a.chat_id);
      if (!c || !host.getState().chats[a.chat_id]) return { error: `No roleplay chat with id "${a.chat_id}".` };
      return { title: `Set ${c.name}’s mood`, lines: [a.mood ? `Mood: ${String(a.mood).slice(0, 120)}` : 'Back to their default mood'] };
    },
    run(a) {
      host.dispatch({ type: 'chat/mood', charId: a.chat_id, mood: String(a.mood || '').slice(0, 120) });
      return { ok: true };
    },
    done: (a) => `Set ${characterById(a.chat_id)?.name || 'their'} mood`,
  },

  sign_out: {
    risk: 'high',
    account: true,
    tool: fn('sign_out', 'Sign the user out of their Charcoal account on this device.', { clear_device: { type: 'boolean', description: 'Also delete chats, characters and settings stored on this device' } }),
    ask(a) {
      return {
        title: a.clear_device ? 'Sign out and clear this device' : 'Sign out',
        lines: [a.clear_device ? 'Chats, characters and settings on this device are deleted. Synced characters stay in your account.' : 'Your chats stay on this device.'],
        warn: a.clear_device ? 'Clearing the device can’t be undone.' : '',
      };
    },
    run(a) {
      queueAfterReply(async () => {
        await signOut();
        if (a.clear_device) {
          host.dispatch({ type: 'local/wipe' });
          host.updateSettings({ apiKey: '', lastCheck: null });
          host.ui.goHome();
        }
        host.ui.toast(a.clear_device ? 'Signed out and cleared this device' : 'Signed out', 'ok');
      });
      return { ok: true, note: 'Signing out as soon as this reply finishes.' };
    },
    done: () => 'Signed out',
  },

  delete_account: {
    risk: 'high',
    account: true,
    tool: fn('delete_account', 'Permanently delete the user’s Charcoal account (synced characters, saved key, recovery codes, usage). Chats on this device are not touched.'),
    ask() {
      const s = getSession();
      return {
        title: `Delete the account @${s?.username || ''}`,
        lines: ['Removes the account, synced characters and personas, your saved key, recovery codes and notifications. Chats on this device stay.'],
        warn: 'Permanent. This can’t be undone.',
      };
    },
    async run() {
      const name = getSession()?.username || '';
      await deleteAccount();
      host.ui.toast('Account deleted. Your copies on this device are still here.', 'ok');
      return { ok: true, username: name };
    },
    done: () => 'Deleted your account',
    // The AI can't answer after this (its access went with the account), so Charcoal says it.
    terminal: (_a, r) =>
      `Done. The account **@${r?.username || ''}** is permanently deleted, along with its synced characters, saved key and recovery codes. Your chats on this device are still here.\n\nTo keep using the built-in AI, create a new account (free), or add your own DeepSeek key in Settings.`,
  },
};

function targets(scope, selfId) {
  return Object.keys(host.getState().chats).filter((id) => {
    if (id === selfId) return false;
    const asst = id.startsWith(ASST);
    return scope === 'all' || (scope === 'charcoal' ? asst : !asst);
  });
}

/* ---------- read-only helper the model can use without asking ---------- */

export const FIND_CHARACTER = fn('find_character', 'Find characters by name or description (built-in and the user’s own). Returns ids for open_chat.', { query: { type: 'string' } }, ['query']);
export function findCharacter({ query = '' } = {}) {
  const q = String(query).toLowerCase().trim();
  const all = [...(host?.getState().customCharacters || []).map((c) => ({ ...c, mine: true })), ...SEED_CHARACTERS];
  const hits = all
    .map((c) => {
      const hay = `${c.name} ${c.tagline || ''} ${(c.tags || []).join(' ')} ${c.category || ''}`.toLowerCase();
      const score = c.name.toLowerCase().includes(q) ? 3 : q.split(/\s+/).filter((w) => w && hay.includes(w)).length;
      return { c, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);
  return { results: hits.map(({ c }) => ({ character_id: c.id, name: c.name, tagline: c.tagline, mine: !!c.mine, has_chat: !!host?.getState().chats[c.id] })) };
}

/* ---------- what the tool loop uses ---------- */

export function actionTools() {
  if (!host) return [];
  const signedIn = !!getSession();
  return Object.values(ACTIONS)
    .filter((a) => !a.account || signedIn)
    .map((a) => a.tool);
}
export const isAction = (name) => !!ACTIONS[name];

/**
 * Ask, then run. Returns { result, activity } for the tool loop. Allowed-for-this-chat decisions are
 * stored on the chat (opts.allow), so later low-risk actions of the same kind skip the box.
 */
export async function performAction(name, args, ctx) {
  const act = ACTIONS[name];
  const plan = act.ask(args || {}, ctx);
  if (plan.error) return { result: { error: plan.error }, label: `Couldn’t: ${plan.error}`, status: 'error' };
  const chat = host.getState().chats[ctx.selfId];
  const preapproved = act.risk === 'low' && chat?.opts?.allow?.[name];
  let decision = preapproved ? 'always' : null;
  if (!decision) {
    ctx.onAsk?.(plan.title);
    decision = await requestApproval(
      { variantId: ctx.variantId, tool: name, risk: act.risk, title: plan.title, lines: plan.lines || [], warn: plan.warn || '', canAlways: act.risk === 'low' },
      ctx.signal,
    );
  }
  if (decision === 'deny')
    return { result: { denied: true, message: 'The user said no. Don’t retry unless they ask again.' }, label: `Not allowed: ${plan.title}`, status: 'error' };
  if (decision === 'always' && !preapproved)
    host.dispatch({ type: 'chat/opts', charId: ctx.selfId, opts: { allow: { ...(chat?.opts?.allow || {}), [name]: true } } });
  try {
    const result = await act.run(args || {}, ctx);
    return { result, label: act.done(args || {}, result), status: 'done', terminal: act.terminal ? act.terminal(args || {}, result) : null };
  } catch (e) {
    return { result: { error: e?.message || 'That didn’t work.' }, label: `Failed: ${plan.title}`, status: 'error' };
  }
}
