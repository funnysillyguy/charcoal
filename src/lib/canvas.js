// Charcoal Canvas: finds runnable/previewable code in a reply, tracks which block is open in the
// side panel, and builds the locked-down documents the sandbox frames render.
import { createContext, useSyncExternalStore } from 'react';

/* ---------- finding code in a reply ---------- */

const WEB_LANGS = new Set(['html', 'htm', 'xhtml', 'svg']);
const RUN_LANGS = new Set(['python', 'py', 'python3', 'js', 'javascript', 'node']);

/** Same split the Markdown renderer uses, so block N here is block N on screen. */
export function parseFences(text) {
  const segs = String(text || '').split('```');
  const out = [];
  segs.forEach((seg, i) => {
    if (i % 2 === 0) return;
    const nl = seg.indexOf('\n');
    const lang = (nl === -1 ? '' : seg.slice(0, nl)).trim().toLowerCase().split(/\s+/)[0] || '';
    const code = (nl === -1 ? '' : seg.slice(nl + 1)).replace(/\n$/, '');
    out.push({ index: out.length, lang, code, closed: i < segs.length - 1 });
  });
  return out;
}

/** 'web' = shows in the Canvas preview, 'run' = has a Run button, null = plain code. */
export function kindOf(lang, code) {
  const l = String(lang || '').toLowerCase();
  if (WEB_LANGS.has(l)) return 'web';
  if (RUN_LANGS.has(l)) return 'run';
  if (!l && /^\s*(<!doctype html|<html[\s>])/i.test(code || '')) return 'web';
  return null;
}

export function runLang(lang) {
  return /^(python|py|python3)$/i.test(lang) ? 'python' : 'js';
}

export function pageTitle(code) {
  const m = /<title[^>]*>([^<]{1,80})/i.exec(code || '');
  const t = m?.[1]
    ?.replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .trim();
  return t || 'Web page';
}

export function lineCount(code) {
  return code ? code.split('\n').length : 0;
}

/** Visible (non-code) length of a reply: the typewriter only types prose; code appears whole. */
export function proseLength(text) {
  return String(text || '')
    .split('```')
    .reduce((n, seg, i) => (i % 2 === 0 ? n + seg.length : n), 0);
}

/** The first `n` prose characters of a reply, with every code block that comes before that point whole. */
export function cutProse(text, n) {
  const segs = String(text || '').split('```');
  let left = n;
  let out = '';
  for (let i = 0; i < segs.length; i++) {
    const seg = segs[i];
    if (i % 2 === 0) {
      if (seg.length > left) return out + seg.slice(0, left);
      out += seg;
      left -= seg.length;
    } else {
      out += '```' + seg + (i < segs.length - 1 ? '```' : '');
    }
  }
  return out;
}

/** Does the latest exchange look like it wants code (so the reply gets room and canvas rules)? */
const CODE_ASK =
  /\b(html|css|javascript|js|python|website|web ?site|web ?page|landing page|webpage|web ?app|app|game|calculator|script|code|coding|program|function|canvas|animation|animate|ui|dashboard|chart|graph|plot|spreadsheet|csv|dataset|data|analy[sz]e|analysis|statistics|stats|average|median|regression|simulat\w+|build me|make me a|create a|design a)\b/i;

export function wantsCode(messages, uptoIndex) {
  const slice = messages.slice(0, uptoIndex);
  const lastUser = [...slice].reverse().find((m) => m.role === 'user');
  if (lastUser && CODE_ASK.test(lastUser.text || '')) return true;
  const lastChar = [...slice].reverse().find((m) => m.role === 'char');
  const v = lastChar?.variants?.[lastChar.active ?? 0];
  return !!v?.text && v.text.includes('```');
}

/* ---------- which block is open ---------- */

let state = { open: false, ref: null, view: 'split', device: 'desktop', full: false };
const subs = new Set();
const autoOpened = new Set();
let sender = null;

const emit = () => subs.forEach((f) => f());
const set = (patch) => {
  state = { ...state, ...patch };
  emit();
};

export const canvasStore = {
  subscribe(f) {
    subs.add(f);
    return () => subs.delete(f);
  },
  get: () => state,
};

export function useCanvas() {
  return useSyncExternalStore(canvasStore.subscribe, canvasStore.get, canvasStore.get);
}

/** ref = { charId, messageId, variantId, index } */
export function openCanvas(ref) {
  set({ open: true, ref, view: state.view });
}
export function closeCanvas() {
  set({ open: false, full: false });
}
export function setCanvas(patch) {
  set(patch);
}
/** Open once per draft while it is being written; if the person closes it, it stays closed. */
export function autoOpenCanvas(ref) {
  if (autoOpened.has(ref.variantId)) return;
  autoOpened.add(ref.variantId);
  openCanvas(ref);
}
export function markAutoOpened(variantId) {
  autoOpened.add(variantId);
}

/** ChatWindow registers how to send a message as the person; Run blocks use it to share output. */
export function registerSender(fn) {
  sender = fn;
  return () => {
    if (sender === fn) sender = null;
  };
}
export const canSendToChat = () => !!sender;
export function sendToChat(text) {
  return sender ? sender(text) : Promise.resolve(false);
}

/** Wraps a block's place in the chat so a code block knows which draft it belongs to. */
export const BlockContext = createContext(null);

/* ---------- the sandbox documents ---------- */

// Nothing gets in or out: no network, no frames, no forms, no external files. Inline only.
export const PAGE_CSP = [
  "default-src 'none'",
  "script-src 'unsafe-inline'",
  "style-src 'unsafe-inline'",
  'img-src data: blob:',
  'font-src data:',
  'media-src data: blob:',
  "connect-src 'none'",
  "form-action 'none'",
  "base-uri 'none'",
  "frame-src 'none'",
  "worker-src 'none'",
].join('; ');

// Links can't take the frame anywhere else.
const LINK_GUARD =
  "<script>addEventListener('click',function(e){var a=e.target&&e.target.closest&&e.target.closest('a[href]');if(a&&!/^#/.test(a.getAttribute('href')||''))e.preventDefault()},true)</script>";

/** The finished page, with the policy injected before anything else in it can run. */
export function buildDoc(code) {
  let html = String(code || '').trim();
  const meta = `<meta http-equiv="Content-Security-Policy" content="${PAGE_CSP}">${LINK_GUARD}`;
  if (/<head[\s>]/i.test(html)) html = html.replace(/<head([^>]*)>/i, `<head$1>${meta}`);
  else if (/<html[\s>]/i.test(html)) html = html.replace(/<html([^>]*)>/i, `<html$1><head>${meta}</head>`);
  else
    html = `<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${meta}</head><body>${html}</body>`;
  if (!/^\s*<!doctype/i.test(html)) html = `<!doctype html>${html}`;
  return html;
}

/** What can be drawn so far: scripts held back, a half-typed tag cut off. */
export function partialHtml(code) {
  let s = String(code || '');
  s = s.replace(/<script\b[\s\S]*?<\/script\s*>/gi, '');
  const open = s.search(/<script\b/i);
  if (open >= 0) s = s.slice(0, open);
  const lt = s.lastIndexOf('<');
  if (lt > s.lastIndexOf('>')) s = s.slice(0, lt);
  return s;
}

// A stable page that redraws itself from messages while the code is still being written.
export const SHELL_DOC = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="${PAGE_CSP}"><style>html,body{margin:0}</style><style id="live"></style></head><body><script>
(function(){
  var live=document.getElementById('live');
  addEventListener('message',function(e){
    if(e.source!==parent||!e.data||typeof e.data.html!=='string')return;
    var d=new DOMParser().parseFromString(e.data.html,'text/html');
    var css='';d.querySelectorAll('style').forEach(function(s){css+=s.textContent+'\\n';s.remove()});
    live.textContent=css;
    document.documentElement.className=d.documentElement.className||'';
    document.body.className=d.body.className||'';
    document.body.setAttribute('style',d.body.getAttribute('style')||'');
    document.body.innerHTML=d.body.innerHTML;
    document.querySelectorAll('script').forEach(function(s){s.remove()});
  });
  parent.postMessage({t:'shell-ready'},'*');
})();
<\/script></body></html>`;

/* ---------- the code runner ---------- */

const PYODIDE = 'https://cdn.jsdelivr.net/pyodide/v0.27.2/full/';

const RUN_CSP = (python) =>
  [
    "default-src 'none'",
    `script-src 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval' blob:${python ? ' https://cdn.jsdelivr.net' : ''}`,
    "worker-src blob:",
    `connect-src ${python ? 'https://cdn.jsdelivr.net' : "'none'"}`,
    "form-action 'none'",
    "base-uri 'none'",
  ].join('; ');

const JS_WORKER = `
const send = (t, text) => postMessage({ t, text });
const show = (a) => a.map((x) => { if (typeof x === 'string') return x; try { return JSON.stringify(x, null, 2); } catch (e) { return String(x); } }).join(' ');
for (const k of ['log', 'info', 'debug', 'warn', 'error']) console[k] = (...a) => send('out', show(a) + '\\n');
onmessage = async (e) => {
  try {
    const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
    const r = await new AsyncFunction(e.data.code)();
    if (r !== undefined) send('out', show([r]) + '\\n');
  } catch (err) { send('err', (err && err.stack) || String(err)); }
  await new Promise((ok) => setTimeout(ok, 400)); // let late callbacks (fetch, timers) print
  postMessage({ t: 'done' });
};`;

const PY_WORKER = `
const send = (t, text) => postMessage({ t, text });
importScripts('${PYODIDE}pyodide.js');
onmessage = async (e) => {
  try {
    send('status', 'Starting Python (first run downloads about 10 MB)…');
    const py = await loadPyodide({ indexURL: '${PYODIDE}' });
    py.setStdout({ batched: (s) => { if (!/building the font cache/i.test(s)) send('out', s + '\\n'); } });
    py.setStderr({ batched: (s) => { if (!/building the font cache/i.test(s)) send('out', s + '\\n'); } });
    const code = e.data.code;
    send('status', 'Loading libraries…');
    await py.loadPackagesFromImports(code);
    if (/matplotlib/.test(code)) await py.runPythonAsync("import matplotlib\\nmatplotlib.use('AGG')");
    send('status', 'Running…');
    const r = await py.runPythonAsync(code);
    if (r !== undefined && r !== null) send('out', String(r) + '\\n');
    const figs = await py.runPythonAsync(\`
import io, base64
_out = []
try:
    import matplotlib.pyplot as _plt
    for _n in _plt.get_fignums():
        _b = io.BytesIO()
        _plt.figure(_n).savefig(_b, format='png', dpi=110, bbox_inches='tight', facecolor='white')
        _out.append(base64.b64encode(_b.getvalue()).decode())
    _plt.close('all')
except Exception:
    pass
_out
\`);
    for (const f of figs.toJs()) postMessage({ t: 'img', data: f });
  } catch (err) { send('err', (err && err.message) || String(err)); }
  postMessage({ t: 'done' });
};`;

export function runnerDoc(lang) {
  const python = lang === 'python';
  const worker = (python ? PY_WORKER : JS_WORKER).replace(/<\//g, '<\\/');
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${RUN_CSP(python)}"></head><body><script type="text/plain" id="w">${worker}<\/script><script>
(function(){
  var started=false;
  addEventListener('message',function(e){
    if(e.source!==parent||started||!e.data||typeof e.data.code!=='string')return;
    started=true;
    var w;
    try{w=new Worker(URL.createObjectURL(new Blob([document.getElementById('w').textContent],{type:'text/javascript'})));}
    catch(err){parent.postMessage({t:'err',text:'Could not start the sandbox: '+err},'*');parent.postMessage({t:'done'},'*');return;}
    w.onmessage=function(m){parent.postMessage(m.data,'*')};
    w.onerror=function(m){parent.postMessage({t:'err',text:String(m.message||'The sandbox stopped.')},'*');parent.postMessage({t:'done'},'*')};
    w.postMessage({code:e.data.code});
  });
  parent.postMessage({t:'ready'},'*');
})();
<\/script></body></html>`;
}

const MAX_OUT = 20000;
const results = new Map(); // code -> last result, so swiping away and back keeps it

export const lastResult = (lang, code) => results.get(`${lang}:${code}`) || null;

/**
 * Run code in an isolated frame: no same-origin access, no network (Python may fetch its own runtime
 * from the CDN), killed on timeout. onUpdate({ out, status, images, error, done }) fires as it goes.
 */
export function runCode({ lang, code, onUpdate }) {
  const python = lang === 'python';
  const limit = python ? 150_000 : 20_000;
  const frame = document.createElement('iframe');
  frame.setAttribute('sandbox', 'allow-scripts');
  frame.setAttribute('aria-hidden', 'true');
  frame.tabIndex = -1;
  frame.style.cssText = 'position:fixed;width:0;height:0;border:0;opacity:0;pointer-events:none';
  const res = { out: '', status: 'Starting…', images: [], error: '', done: false, truncated: false };
  let dead = false;
  let timer = 0;

  const push = () => onUpdate({ ...res, images: [...res.images] });
  const finish = (error) => {
    if (dead) return;
    dead = true;
    clearTimeout(timer);
    window.removeEventListener('message', onMsg);
    frame.remove();
    if (error) res.error = res.error || error;
    res.done = true;
    res.status = '';
    results.set(`${lang}:${code}`, { ...res, images: [...res.images] });
    push();
  };
  function onMsg(e) {
    if (e.source !== frame.contentWindow || !e.data) return;
    const d = e.data;
    if (d.t === 'ready') frame.contentWindow.postMessage({ code }, '*');
    else if (d.t === 'out') {
      if (res.out.length < MAX_OUT) res.out += String(d.text);
      else res.truncated = true;
      if (res.out.length > MAX_OUT) res.out = res.out.slice(0, MAX_OUT);
      push();
    } else if (d.t === 'err') {
      res.error = String(d.text).slice(0, 4000);
      push();
    } else if (d.t === 'status') {
      res.status = String(d.text);
      push();
    } else if (d.t === 'img' && typeof d.data === 'string' && /^[A-Za-z0-9+/=]+$/.test(d.data) && res.images.length < 6) {
      res.images.push(`data:image/png;base64,${d.data}`);
      push();
    } else if (d.t === 'done') finish();
  }
  window.addEventListener('message', onMsg);
  timer = setTimeout(() => finish(`Stopped: it ran longer than ${Math.round(limit / 1000)} seconds.`), limit);
  frame.srcdoc = runnerDoc(lang);
  document.body.appendChild(frame);
  push();
  return { stop: () => finish('Stopped.') };
}
