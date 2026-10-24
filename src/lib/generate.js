// Picks the reply source (DeepSeek or the offline demo engine) and yields a uniform event stream.
import { streamChat } from './deepseek.js';
import { buildRequest } from './prompt.js';
import { demoStream } from './demoEngine.js';
import { effectiveKey, effectiveBaseUrl, SANDBOXED } from './settings.js';
import { getSample, sampleStream, toSampleTurns } from './hostAI.js';

/**
 * Generate one draft (variant) of a character message.
 * @param {object}  p.chat       chat snapshot; the target message and variant already exist
 * @param {string}  p.messageId  the character message
 * @param {string}  p.variantId  the draft being written
 * @param {'primary'|'parallel'|'regen'} p.kind
 *   primary  — first draft of a new turn, uses the character's own temperature
 *   parallel — extra drafts fired alongside the primary one (swipe temperature 0.85–1.0)
 *   regen    — a one-at-a-time regeneration (swipe temperature, told to avoid earlier drafts)
 */
export async function* generateReply({ character, persona, chat, messageId, variantId, kind, settings, signal }) {
  const index = chat.messages.findIndex((m) => m.id === messageId);
  const target = chat.messages[index];
  const previousUser = [...chat.messages.slice(0, index)].reverse().find((m) => m.role === 'user');
  const otherDrafts = (target?.variants || [])
    .filter((v) => v.id !== variantId && v.status === 'done')
    .map((v) => v.text)
    .filter(Boolean);

  // Hosted on claude.ai: outside APIs are blocked, so replies come from Claude via the viewer.
  const sample = SANDBOXED ? await getSample() : null;
  if (sample) {
    const { body } = await buildRequest({
      character,
      persona,
      chat,
      uptoIndex: index,
      isSwipe: kind !== 'primary',
      alternate: kind === 'parallel',
      swipeDrafts: kind === 'regen' ? otherDrafts : [],
      settings,
    });
    const { turns, images } = toSampleTurns(body.messages, character.name);
    yield { type: 'meta', meta: { provider: 'claude', kind, model: 'Claude' } };
    yield* sampleStream({ sample, turns, images, signal });
    return;
  }

  const apiKey = effectiveKey(settings);
  if (!apiKey) {
    const recentReplies = chat.messages
      .filter((m) => m.role === 'char')
      .slice(-6)
      .flatMap((m) => m.variants.map((v) => v.text));
    yield { type: 'meta', meta: { provider: 'demo' } };
    yield* demoStream({
      character,
      userText: previousUser?.text || '',
      hasImages: !!previousUser?.images?.length,
      recentReplies,
      signal,
    });
    return;
  }

  const { body, meta } = await buildRequest({
    character,
    persona,
    chat,
    uptoIndex: index,
    isSwipe: kind !== 'primary',
    alternate: kind === 'parallel',
    swipeDrafts: kind === 'regen' ? otherDrafts : [],
    settings,
  });
  yield { type: 'meta', meta: { provider: 'deepseek', kind, ...meta } };
  yield* streamChat({ baseUrl: effectiveBaseUrl(settings), apiKey, body, signal });
}
