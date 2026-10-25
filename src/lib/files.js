// File attachments for Charcoal Chat: text, code, data and PDFs become text the model can read
// (and the Python runner can open at data/<name>). Images go through prepareImage as before.
// The text lives in this browser's IndexedDB, like images; messages only keep the metadata.
import { imageStore } from './storage.js';
import { prepareImage, uid } from './images.js';

export const MAX_FILE_BYTES = 15 * 1024 * 1024;
export const MAX_FILE_CHARS = 2_000_000; // stored per file
export const MAX_ATTACHMENTS = 6;

const TEXT_EXT =
  /\.(txt|md|markdown|csv|tsv|json|jsonl|xml|yaml|yml|toml|ini|cfg|log|html?|css|scss|js|mjs|cjs|jsx|ts|tsx|py|ipynb|rb|go|rs|java|kt|swift|c|h|cpp|hpp|cs|php|sh|bash|zsh|sql|r|lua|dart|vue|svelte|tex|srt|vtt|env|gitignore)$/i;

export const ACCEPT_ALL = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'application/pdf',
  'text/*',
  'application/json',
  '.md,.csv,.tsv,.json,.jsonl,.yaml,.yml,.toml,.log,.py,.js,.jsx,.ts,.tsx,.html,.css,.sql,.sh,.ipynb,.xml,.txt,.java,.go,.rs,.c,.cpp,.rb,.php,.swift,.kt',
].join(',');

const cache = new Map();

export const isImageFile = (f) => /^image\/(png|jpeg|webp)$/.test(f.type);
export const isPdf = (f) => f.type === 'application/pdf' || /\.pdf$/i.test(f.name || '');
export const isTextLike = (f) => /^text\//.test(f.type) || /json|xml|javascript|x-sh|x-python|yaml|csv/.test(f.type) || TEXT_EXT.test(f.name || '');

async function pdfText(file) {
  const pdfjs = await import('pdfjs-dist');
  const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const pages = [];
  let total = 0;
  for (let i = 1; i <= doc.numPages && total < MAX_FILE_CHARS; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    let line = '';
    let lastY = null;
    const out = [];
    for (const it of content.items) {
      const y = it.transform?.[5];
      if (lastY !== null && Math.abs(y - lastY) > 2) {
        out.push(line);
        line = '';
      }
      line += it.str + (it.hasEOL ? '\n' : '');
      lastY = y;
    }
    out.push(line);
    const text = out.join('\n').replace(/[ \t]+\n/g, '\n').trim();
    pages.push(`[Page ${i}]\n${text}`);
    total += text.length;
  }
  return { text: pages.join('\n\n'), pages: doc.numPages };
}

/** Turn a picked/dropped file into an attachment. Images: { kind:'image', ...prepareImage }. Others: { kind:'file', text, ... }. */
export async function prepareAttachment(file) {
  if (isImageFile(file)) return { kind: 'image', ...(await prepareImage(file)) };
  if (file.size > MAX_FILE_BYTES) throw new Error(`${file.name} is over 15 MB.`);
  let text = '';
  let pages = 0;
  if (isPdf(file)) {
    const r = await pdfText(file);
    text = r.text;
    pages = r.pages;
    if (!text.trim()) throw new Error(`${file.name} has no selectable text (it may be a scan).`);
  } else if (isTextLike(file)) {
    text = await file.text();
  } else {
    throw new Error(`${file.name}: Charcoal can read text, code, data files (CSV, JSON…), PDFs and images.`);
  }
  const truncated = text.length > MAX_FILE_CHARS;
  if (truncated) text = text.slice(0, MAX_FILE_CHARS);
  return {
    kind: 'file',
    id: uid('file'),
    name: file.name || 'file.txt',
    mime: file.type || (isPdf(file) ? 'application/pdf' : 'text/plain'),
    bytes: file.size,
    chars: text.length,
    pages,
    truncated,
    text,
  };
}

export async function saveFileText(id, text) {
  cache.set(id, text);
  await imageStore.set(`file:${id}`, text);
}

export async function getFileText(id) {
  if (cache.has(id)) return cache.get(id);
  const v = await imageStore.get(`file:${id}`);
  if (typeof v === 'string') cache.set(id, v);
  return typeof v === 'string' ? v : '';
}

export async function deleteFiles(ids) {
  for (const id of ids) {
    cache.delete(id);
    await imageStore.del(`file:${id}`);
  }
}

/** A filesystem-safe name for the Python runner's data/ folder. */
export const safeName = (name) => String(name || 'file').replace(/[^\w.-]+/g, '_').slice(0, 80) || 'file';

/** Every file attached anywhere in a chat, with its text, for the code runner. */
export async function chatFiles(chat) {
  const metas = (chat?.messages || []).flatMap((m) => m.files || []);
  const out = [];
  for (const f of metas) out.push({ name: safeName(f.name), text: await getFileText(f.id) });
  return out;
}
