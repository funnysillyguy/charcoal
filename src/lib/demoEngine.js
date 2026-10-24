// Offline fallback used when no DeepSeek key is configured (and in the sandboxed preview build).
// It remixes the character's own example dialogue so replies still sound like them,
// and streams the result token-by-token so the UI behaves exactly like the real thing.
import { parseExamples } from './prompt.js';
import { firstName } from './format.js';

const GENERIC_OPENERS = [
  '*{{first}} goes quiet for a moment, turning that over.*',
  '*{{first}} leans in, clearly interested now.*',
  '*A slow smile from {{first}}.*',
  '*{{first}} studies you, as if deciding how much to say.*',
  '*{{first}} lets out a short laugh.*',
];

const GENERIC_HOOKS = [
  'Tell me more. Start with the part you almost left out, {{user}}.',
  'Go on, {{user}}. I want the rest of it.',
  "So what happens next, {{user}}? Your move.",
  'And how do you feel about that, honestly?',
];

const IMAGE_LINES = [
  '*{{first}} takes the picture from you and holds it up to the light, studying every corner of it.* Now *this* is interesting.',
  '*{{first}} squints at the image, then at you, then back at the image.* You were right to show me this.',
];

function pick(arr, avoid = []) {
  const fresh = arr.filter((x) => !avoid.some((a) => a && a.includes(x.slice(0, 32))));
  const pool = fresh.length ? fresh : arr;
  return pool[Math.floor(Math.random() * pool.length)];
}

function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new DOMException('Aborted', 'AbortError'));
    const t = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(t);
        reject(new DOMException('Aborted', 'AbortError'));
      },
      { once: true },
    );
  });
}

export function composeDemoReply({ character, userText, hasImages, recentReplies = [] }) {
  const examples = parseExamples(character.definition?.examples);
  const charLines = examples.filter((t) => t.role === 'char').map((t) => t.text);
  const verbosity = character.settings?.verbosity || 2;
  const parts = [];

  if (hasImages) parts.push(pick(IMAGE_LINES, recentReplies));

  // Prefer an example whose paired user line shares words with what the user just said.
  const words = new Set(
    String(userText || '')
      .toLowerCase()
      .split(/[^a-z0-9']+/)
      .filter((w) => w.length > 3),
  );
  let best = null;
  let bestScore = 0;
  examples.forEach((t, i) => {
    if (t.role !== 'user' || !examples[i + 1] || examples[i + 1].role !== 'char') return;
    const score = t.text
      .toLowerCase()
      .split(/[^a-z0-9']+/)
      .filter((w) => words.has(w)).length;
    if (score > bestScore && !recentReplies.some((r) => r.includes(examples[i + 1].text.slice(0, 32)))) {
      best = examples[i + 1].text;
      bestScore = score;
    }
  });

  if (!hasImages && Math.random() < 0.6) parts.push(pick(GENERIC_OPENERS, recentReplies));
  if (best) parts.push(best);
  else if (charLines.length) parts.push(pick(charLines, recentReplies));
  if (verbosity >= 3 && charLines.length > 1) parts.push(pick(charLines.filter((l) => l !== best), [...recentReplies, ...parts]));
  if (verbosity >= 2 || !charLines.length) parts.push(pick(GENERIC_HOOKS, recentReplies));

  return parts
    .filter(Boolean)
    .join('\n\n')
    .replace(/\{\{\s*first\s*\}\}/g, firstName(character.name));
}

export async function* demoStream({ character, userText, hasImages, recentReplies, signal }) {
  const text = composeDemoReply({ character, userText, hasImages, recentReplies });
  await sleep(450 + Math.random() * 600, signal); // "typing…" latency
  const tokens = text.match(/\s*\S+/g) || [];
  for (let i = 0; i < tokens.length; ) {
    const n = 1 + Math.floor(Math.random() * 2);
    const piece = tokens.slice(i, i + n).join('');
    i += n;
    yield { type: 'content', text: piece };
    const pause = /[.!?…]\*?$/.test(piece) ? 90 : /\n/.test(piece) ? 60 : 0;
    await sleep(18 + Math.random() * 30 + pause, signal);
  }
  yield { type: 'finish', reason: 'stop' };
}
