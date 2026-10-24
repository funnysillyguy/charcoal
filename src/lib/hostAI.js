// Claude inside the claude.ai artifact viewer (the `sample` capability).
// claude.ai blocks hosted pages from calling other sites, so the hosted build can't reach
// DeepSeek; it talks to Claude through the viewer instead. Same prompts, same event stream.
import { ApiError } from './deepseek.js';

let samplePromise = null;

/** Resolves the sample function, or null when this page isn't running inside a Claude viewer. */
export function getSample() {
  if (samplePromise) return samplePromise;
  samplePromise = (async () => {
    try {
      if (typeof window === 'undefined' || !window.claude?.use) return null;
      return (await window.claude.use('sample')) || null;
    } catch {
      return null;
    }
  })();
  return samplePromise;
}

const MESSAGES = {
  not_granted: 'This page needs your OK to use Claude. Reload and choose Allow when asked.',
  sampling_disabled: 'Claude isn’t available for this account, so replies are offline demo text.',
  rate_limited: 'Claude is rate-limiting this page right now. Wait a minute, then retry.',
  session_expired: 'Your Claude session expired. Sign in again, then retry.',
  refused: 'Claude declined to write this reply. Rephrase your message or regenerate.',
  empty_completion: 'The reply came back empty. Regenerate to try again.',
  images_unavailable: 'This view can’t send images to Claude. Remove the image and resend.',
  image_rejected: 'That image was rejected (type or size). Try a different one.',
  prompt_too_large: 'This chat is too long to send. Reset the chat or delete some messages.',
  invalid_json: 'The draft came back in the wrong format. Try again.',
  upstream_error: 'Claude had a hiccup. Retry in a moment.',
};

export function sampleError(e) {
  const code = e?.code || 'upstream_error';
  if (code === 'cancelled') return new DOMException('Aborted', 'AbortError');
  const kind = code === 'rate_limited' ? 'rate' : code.startsWith('image') ? 'vision' : code === 'not_granted' ? 'auth' : 'server';
  return new ApiError(MESSAGES[code] || MESSAGES.upstream_error, { kind, detail: e?.message || code });
}

export function dataUrlToBlob(dataUrl) {
  const [head, b64] = dataUrl.split(',');
  const mime = /data:([^;]+)/.exec(head)?.[1] || 'image/png';
  const bin = atob(b64 || '');
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

/**
 * Convert an OpenAI-style message list (system + history) into sample() turns.
 * The system prompt becomes a leading user turn; images on the final user turn go in `images`.
 */
export function toSampleTurns(messages, charName = 'the character') {
  const turns = [];
  let images = [];
  const textOf = (content) =>
    typeof content === 'string'
      ? content
      : content
          .filter((p) => p.type === 'text')
          .map((p) => p.text)
          .join('\n\n');

  messages.forEach((m, i) => {
    const isLast = i === messages.length - 1;
    if (m.role === 'system') {
      turns.push({
        role: 'user',
        content: `${m.content}\n\n(Everything after this is the roleplay itself. Write only ${charName}'s next message, in character, with no preamble.)`,
      });
      return;
    }
    let text = textOf(m.content).trim();
    if (Array.isArray(m.content)) {
      const urls = m.content.filter((p) => p.type === 'image_url').map((p) => p.image_url.url);
      if (urls.length && isLast) images = urls.map(dataUrlToBlob);
      else if (urls.length) text += `\n\n[shared ${urls.length > 1 ? 'some images' : 'an image'} earlier]`;
    }
    if (text) turns.push({ role: m.role === 'assistant' ? 'assistant' : 'user', content: text });
  });
  if (!turns.length || turns[turns.length - 1].role !== 'user') turns.push({ role: 'user', content: '(continue)' });
  return { turns, images };
}

/** Stream a sample() call as the same event shape streamChat() yields. */
export async function* sampleStream({ sample, turns, images, signal, modelTier = 'quick' }) {
  const queue = [];
  let wake = null;
  let settled = false;
  let failure = null;
  const push = (ev) => {
    queue.push(ev);
    wake?.();
  };

  sample(turns, {
    signal,
    cache: false,
    modelTier,
    ...(images?.length ? { images } : {}),
    onText: ({ delta }) => push({ type: 'content', text: delta }),
  })
    .then((r) => push({ type: 'finish', reason: r.truncated ? 'length' : 'stop' }))
    .catch((e) => {
      failure = e;
    })
    .finally(() => {
      settled = true;
      wake?.();
    });

  while (true) {
    if (queue.length) {
      yield queue.shift();
      continue;
    }
    if (settled) break;
    await new Promise((r) => {
      wake = r;
    });
    wake = null;
  }
  if (failure) throw sampleError(failure);
}
