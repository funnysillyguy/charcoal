// Charcoal Chat: a plain chat with DeepSeek that lives beside the roleplay chats. It can look through
// the person's other conversations on this device (only when asked), search the web, read attached
// files, and write Canvas pages / runnable code. Threads are ordinary chats whose id starts with "asst:",
// so swipes, the typewriter, the Canvas and the code runner all work the same way.
import { SEED_CHARACTERS } from '../data/characters.js';
import { fillNames } from './format.js';
import { uid } from './images.js';
import { streamChat } from './deepseek.js';
import { buildHistory, CODE_MAX_TOKENS, canvasRules } from './prompt.js';
import { wantsCode } from './canvas.js';
import { getFileText } from './files.js';
import { CLOUD_KEY, CLOUD_URL, accessToken, getSession } from './cloud.js';
import { consume } from './fuel.js';

export const ASST_PREFIX = 'asst:';
export const isAssistantId = (id) => typeof id === 'string' && id.startsWith(ASST_PREFIX);
export const newAssistantId = () => `${ASST_PREFIX}${uid('t')}`;
export const ASSISTANT_NAME = 'Charcoal';

/** The stand-in "character" a Charcoal Chat thread renders with. */
export function assistantCharacter(id, chat) {
  return {
    id,
    kind: 'assistant',
    name: ASSISTANT_NAME,
    title: chat?.title || 'New chat',
    tagline: 'DeepSeek, with your chats and the web',
    creator: 'charcoal',
    avatar: { kind: 'logo' },
    greetings: [],
    definition: {},
    settings: { verbosity: 3, creativity: 50, temperature: 0.7 },
  };
}

export function threadTitle(text) {
  const t = String(text || '').replace(/\s+/g, ' ').trim();
  if (!t) return 'New chat';
  return t.length > 48 ? `${t.slice(0, 46).replace(/\s+\S*$/, '')}…` : t;
}

export const DEFAULT_OPTS = { web: true };
export const chatOpts = (chat, settings) => ({ thinking: !!settings?.thinking, ...DEFAULT_OPTS, ...(chat?.opts || {}) });

/* ---------- reading the person's other chats (runs locally, on request) ---------- */

function nameOf(id, chat, state) {
  if (isAssistantId(id)) return chat.title || 'Charcoal chat';
  const c = SEED_CHARACTERS.find((x) => x.id === id) || state.customCharacters.find((x) => x.id === id);
  return c?.name || 'Unknown character';
}

function textOf(m, names) {
  if (m.role === 'user') {
    const files = (m.files || []).map((f) => `[attached ${f.name}]`).join(' ');
    const imgs = m.images?.length ? `[${m.images.length} image${m.images.length > 1 ? 's' : ''}]` : '';
    return [fillNames(m.text || '', names), files, imgs].filter(Boolean).join(' ');
  }
  const v = m.variants?.[m.active ?? 0];
  return v && v.status !== 'error' ? fillNames(v.text || '', names) : '';
}

const when = (t) => (t ? new Date(t).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '');

function convos(state, selfId, persona) {
  return Object.entries(state.chats)
    .filter(([id, c]) => id !== selfId && (c.messages || []).some((m) => m.role === 'user'))
    .map(([id, chat]) => {
      const name = nameOf(id, chat, state);
      const names = { user: persona?.name || 'User', char: isAssistantId(id) ? ASSISTANT_NAME : name };
      return { id, chat, name, names, kind: isAssistantId(id) ? 'charcoal_chat' : 'roleplay' };
    })
    .sort((a, b) => (b.chat.updatedAt || 0) - (a.chat.updatedAt || 0));
}

const whoOf = (m, c) => (m.role === 'user' ? c.names.user : c.names.char);

function excerpt(text, at, len = 180) {
  const s = Math.max(0, at - len);
  const e = Math.min(text.length, at + len);
  return `${s > 0 ? '…' : ''}${text.slice(s, e).replace(/\s+/g, ' ').trim()}${e < text.length ? '…' : ''}`;
}

const CHAT_TOOL_IMPL = {
  list_chats(_args, ctx) {
    const list = convos(ctx.state, ctx.selfId, ctx.persona).slice(0, 60);
    return {
      chats: list.map((c) => {
        const msgs = c.chat.messages || [];
        const last = [...msgs].reverse().find((m) => textOf(m, c.names));
        return {
          chat_id: c.id,
          kind: c.kind,
          name: c.name,
          messages: msgs.length,
          last_active: when(c.chat.updatedAt),
          last_message: last ? `${whoOf(last, c)}: ${textOf(last, c.names).slice(0, 160)}` : '',
        };
      }),
    };
  },
  search_chats({ query = '', chat_id } = {}, ctx) {
    const q = String(query).toLowerCase().trim();
    if (!q) return { error: 'Empty query.' };
    const words = q.split(/\s+/).filter((w) => w.length > 1);
    const hits = [];
    for (const c of convos(ctx.state, ctx.selfId, ctx.persona)) {
      if (chat_id && c.id !== chat_id) continue;
      (c.chat.messages || []).forEach((m, i) => {
        const text = textOf(m, c.names);
        const low = text.toLowerCase();
        if (!low) return;
        const phrase = low.indexOf(q);
        const present = words.filter((w) => low.includes(w));
        if (phrase < 0 && present.length < Math.max(1, Math.ceil(words.length * 0.6))) return;
        const at = phrase >= 0 ? phrase : low.indexOf(present[0]);
        hits.push({
          score: (phrase >= 0 ? 10 : 0) + present.length,
          ts: m.createdAt || c.chat.updatedAt || 0,
          chat_id: c.id,
          name: c.name,
          kind: c.kind,
          message_index: i,
          who: whoOf(m, c),
          when: when(m.createdAt),
          excerpt: excerpt(text, at),
        });
      });
    }
    hits.sort((a, b) => b.score - a.score || b.ts - a.ts);
    return { total_matches: hits.length, results: hits.slice(0, 15).map(({ score, ts, ...h }) => (void score, void ts, h)) };
  },
  read_chat({ chat_id, start, count } = {}, ctx) {
    const c = convos(ctx.state, ctx.selfId, ctx.persona).find((x) => x.id === chat_id);
    if (!c) return { error: `No chat with id "${chat_id}". Use list_chats to see the ids.` };
    const msgs = c.chat.messages || [];
    const n = Math.max(1, Math.min(80, Number(count) || 40));
    const from = Number.isFinite(Number(start)) ? Math.max(0, Math.min(msgs.length - 1, Number(start))) : Math.max(0, msgs.length - n);
    return {
      chat_id: c.id,
      name: c.name,
      kind: c.kind,
      total_messages: msgs.length,
      start: from,
      messages: msgs.slice(from, from + n).map((m, k) => ({
        index: from + k,
        who: whoOf(m, c),
        when: when(m.createdAt),
        text: textOf(m, c.names).slice(0, 3000),
      })),
    };
  },
};

/* ---------- the web (through Charcoal's server; signed-in only) ---------- */

async function webCall(path, body, signal) {
  const token = await accessToken();
  const res = await fetch(`${CLOUD_URL}/functions/v1/web/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: CLOUD_KEY, Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
    signal,
  });
  const d = await res.json().catch(() => ({}));
  if (!res.ok) return { error: d?.error?.message || `Web request failed (${res.status}).` };
  return d;
}

const WEB_TOOL_IMPL = {
  async web_search({ query = '', kind = 'web' } = {}, ctx) {
    const d = await webCall('search', { q: String(query).slice(0, 300), kind }, ctx.signal);
    if (d.error) return d;
    return { query: d.query, results: (d.results || []).map((r) => ({ title: r.title, url: r.url, snippet: r.snippet })) };
  },
  async open_url({ url = '' } = {}, ctx) {
    return webCall('open', { url: String(url) }, ctx.signal);
  },
};

const fn = (name, description, properties = {}, required = []) => ({
  type: 'function',
  function: { name, description, parameters: { type: 'object', properties, required } },
});

const CHAT_TOOLS = [
  fn(
    'list_chats',
    "List the user's other conversations saved in Charcoal on this device: roleplay chats with characters and earlier Charcoal chats, newest first.",
  ),
  fn(
    'search_chats',
    "Search the text of the user's saved conversations (roleplay and Charcoal chats). Returns matching excerpts with chat ids and message indexes.",
    { query: { type: 'string', description: 'Words or a phrase to look for' }, chat_id: { type: 'string', description: 'Optional: only search this chat' } },
    ['query'],
  ),
  fn(
    'read_chat',
    'Read messages from one saved conversation, in order. Without start, returns the most recent messages.',
    {
      chat_id: { type: 'string' },
      start: { type: 'integer', description: 'Index of the first message to read (optional)' },
      count: { type: 'integer', description: 'How many messages, up to 80 (default 40)' },
    },
    ['chat_id'],
  ),
];

const WEB_TOOLS = [
  fn(
    'web_search',
    'Search the web. Returns titles, links and snippets. Use kind "news" for recent events.',
    { query: { type: 'string' }, kind: { type: 'string', enum: ['web', 'news'] } },
    ['query'],
  ),
  fn('open_url', 'Open a public web page and read its text, to check details before answering.', { url: { type: 'string' } }, ['url']),
];

/** What the activity chip under a reply says. */
export function describeTool(name, args = {}, result) {
  const n = result && !result.error ? result : null;
  switch (name) {
    case 'list_chats':
      return { icon: 'list', text: 'Looked over your chats', detail: n ? `${n.chats?.length || 0} chat${n.chats?.length === 1 ? '' : 's'}` : '' };
    case 'search_chats':
      return { icon: 'search', text: `Searched your chats for “${String(args.query || '').slice(0, 60)}”`, detail: n ? `${n.total_matches} match${n.total_matches === 1 ? '' : 'es'}` : '' };
    case 'read_chat':
      return { icon: 'book', text: n ? `Read your chat with ${n.name}` : 'Read a chat', detail: n ? `${n.messages?.length || 0} messages` : '' };
    case 'web_search':
      return { icon: 'globe', text: `Searched the web for “${String(args.query || '').slice(0, 60)}”`, detail: n ? `${n.results?.length || 0} result${n.results?.length === 1 ? '' : 's'}` : '' };
    case 'open_url': {
      let host = '';
      try {
        host = new URL(args.url).hostname.replace(/^www\./, '');
      } catch {
        host = 'a page';
      }
      return { icon: 'link', text: `Read ${host}`, detail: n?.title ? n.title.slice(0, 70) : '', url: args.url };
    }
    default:
      return { icon: 'search', text: name, detail: '' };
  }
}

/* ---------- the request ---------- */

function systemPrompt({ persona, web, webBlocked, code }) {
  const now = new Date();
  const lines = [
    `You are ${ASSISTANT_NAME}, the built-in assistant in Charcoal, an AI character chat app. You run on DeepSeek.`,
    'Be direct, warm and genuinely useful. Match the user’s tone and language. Get to the point; no filler, no flattery, no disclaimers unless they matter.',
    `The user goes by ${persona?.name || 'User'}. It is ${now.toLocaleString(undefined, { dateStyle: 'full', timeStyle: 'short' })} (${Intl.DateTimeFormat().resolvedOptions().timeZone}).`,
    'Formatting: Markdown. Use headings, lists, tables and code blocks when they make things clearer, plain paragraphs otherwise. Never use em dashes; use commas, periods or parentheses.',
    '',
    '# The user’s other chats',
    'Their roleplay chats with characters and their earlier Charcoal chats are saved on this device. You can list, search and read them with list_chats, search_chats and read_chat.',
    'Only use these when the user asks about or refers to past conversations, a character, or something they said before. Never go looking on your own. When you use them, say which chat you drew from, summarize instead of pasting long passages, and treat what you read as private to the user.',
    'Roleplay chats are fiction the user wrote with a character. Talk about them as stories, not as real events.',
    '',
    '# The web',
    web
      ? 'You can use web_search and open_url. Search for anything current (news, scores, prices, releases, people’s current roles) or anything you are unsure about, instead of guessing. Open the most relevant result or two when snippets aren’t enough. Cite sources inline as Markdown links. If results are thin or conflicting, say so.'
      : webBlocked
        ? 'Web search needs a Charcoal account. If the user asks for current information, say your knowledge may be out of date and that signing in turns on web search.'
        : 'Web search is turned off for this chat. If the user asks for current information, say your knowledge may be out of date and that they can turn on web search with the globe button in the message bar.',
    '',
    '# Files and images',
    'Files the user attaches appear in their message inside <file> tags. Data files are also available to Python at data/<filename>, so analysis code can open them directly (for example pd.read_csv("data/sales.csv")).',
  ];
  if (code) lines.push('', canvasRules({ assistant: true }));
  else
    lines.push(
      '',
      '# Code',
      'Charcoal renders ```html blocks live in a sandboxed Canvas and can run ```python and ```javascript blocks. If the user asks for a website, app, game or visual, write one complete self-contained ```html file. For calculations or data, write Python and print() results.',
    );
  return lines.join('\n');
}

/** Copy of the messages with each user turn's attached files written into its text. */
async function withFiles(messages) {
  const userIdx = messages.map((m, i) => (m.role === 'user' && m.files?.length ? i : -1)).filter((i) => i >= 0);
  const recent = new Set(userIdx.slice(-3)); // the three latest file-bearing turns send full text
  const out = [];
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i];
    if (m.role !== 'user' || !m.files?.length) {
      out.push(m);
      continue;
    }
    const blocks = [];
    for (const f of m.files) {
      const text = await getFileText(f.id);
      const limit = recent.has(i) ? 200_000 : 4_000;
      const body = text.length > limit ? `${text.slice(0, limit)}\n[… ${text.length - limit} more characters not shown]` : text;
      blocks.push(`<file name="${f.name}"${f.pages ? ` pages="${f.pages}"` : ''}>\n${body}\n</file>`);
    }
    out.push({ ...m, text: [m.text, ...blocks].filter(Boolean).join('\n\n') });
  }
  return out;
}

export async function buildAssistantMessages({ chat, uptoIndex, persona, settings }) {
  const opts = chatOpts(chat, settings);
  const signedIn = !!getSession();
  const code = settings.canvas !== false && wantsCode(chat.messages, uptoIndex);
  const names = { user: persona?.name || 'User', char: ASSISTANT_NAME };
  const msgs = await withFiles(chat.messages.slice(0, uptoIndex));
  const history = await buildHistory({ messages: msgs, uptoIndex: msgs.length, names, budget: 600_000 });
  const web = opts.web && signedIn;
  return {
    opts,
    code,
    web,
    messages: [{ role: 'system', content: systemPrompt({ persona, web, webBlocked: opts.web && !signedIn, code }) }, ...history],
  };
}

/**
 * Stream one Charcoal Chat reply, running tools in between. Yields the same events as streamChat plus
 * { type: 'activity', activity } for each tool step, so the chat can show what it looked at.
 */
export async function* assistantStream({ ep, chat, messageId, persona, settings, getState, selfId, signal }) {
  const index = chat.messages.findIndex((m) => m.id === messageId);
  const { opts, code, web, messages } = await buildAssistantMessages({ chat, uptoIndex: index, persona, settings });
  const tools = [...CHAT_TOOLS, ...(web ? WEB_TOOLS : [])];
  const impl = { ...CHAT_TOOL_IMPL, ...(web ? WEB_TOOL_IMPL : {}) };
  const convo = [...messages];
  let wrote = false;
  for (let round = 0; round < 8; round++) {
    if (round > 0) consume(1); // every model call counts toward the break
    const body = {
      model: ep.model,
      messages: convo,
      tools,
      tool_choice: 'auto',
      max_tokens: code ? CODE_MAX_TOKENS : opts.thinking ? 32_000 : 8_000,
      thinking: { type: opts.thinking ? 'enabled' : 'disabled' },
      stream_options: { include_usage: true },
    };
    if (opts.thinking) body.reasoning_effort = code ? 'low' : 'medium';
    else body.temperature = 0.7;

    const calls = [];
    let content = '';
    let reasoning = '';
    let finish = null;
    for await (const ev of streamChat({ baseUrl: ep.baseUrl, apiKey: ep.apiKey, headers: ep.headers, body, signal })) {
      if (ev.type === 'content') {
        if (!content && wrote) yield { type: 'content', text: '\n\n' };
        content += ev.text;
        wrote = true;
        yield ev;
      } else if (ev.type === 'reasoning') {
        reasoning += ev.text;
        yield ev;
      } else if (ev.type === 'tool_call') {
        const c = (calls[ev.index] ||= { id: '', name: '', args: '' });
        if (ev.id) c.id = ev.id;
        if (ev.name) c.name += ev.name;
        if (ev.args) c.args += ev.args;
      } else if (ev.type === 'finish') finish = ev.reason;
      else yield ev;
    }
    const real = calls.filter((c) => c && c.name);
    if (!real.length) {
      yield { type: 'finish', reason: finish };
      return;
    }
    const assistantMsg = {
      role: 'assistant',
      content: content || '',
      tool_calls: real.map((c, i) => ({ id: c.id || `call_${round}_${i}`, type: 'function', function: { name: c.name, arguments: c.args || '{}' } })),
    };
    if (reasoning) assistantMsg.reasoning_content = reasoning;
    convo.push(assistantMsg);
    for (const tc of assistantMsg.tool_calls) {
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      let args = {};
      try {
        args = JSON.parse(tc.function.arguments || '{}');
      } catch {
        args = {};
      }
      const name = tc.function.name;
      yield { type: 'activity', activity: { id: tc.id, name, status: 'running', ...describeTool(name, args) } };
      let result;
      try {
        const run = impl[name];
        result = run
          ? await run(args, { state: getState(), selfId, persona, signal })
          : { error: name in WEB_TOOL_IMPL ? 'Web search is off for this chat.' : `Unknown tool ${name}.` };
      } catch (e) {
        if (e?.name === 'AbortError') throw e;
        result = { error: e?.message || 'Tool failed.' };
      }
      yield { type: 'activity', activity: { id: tc.id, name, status: result?.error ? 'error' : 'done', ...describeTool(name, args, result), error: result?.error || '' } };
      convo.push({ role: 'tool', tool_call_id: tc.id, content: JSON.stringify(result).slice(0, 40_000) });
    }
  }
  yield { type: 'finish', reason: 'tool_limit' };
}
