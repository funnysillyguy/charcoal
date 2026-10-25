// Picks the reply source (DeepSeek or the offline demo engine) and yields a uniform event stream.
import { streamChat } from './deepseek.js';
import { buildRequest } from './prompt.js';
import { demoStream } from './demoEngine.js';
import { SANDBOXED } from './settings.js';
import { resolveEndpoint } from './endpoint.js';
import { getSample, sampleStream, toSampleTurns } from './hostAI.js';
import { assistantStream, buildAssistantMessages } from './assistant.js';

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
export async function* generateReply({ character, persona, chat, messageId, variantId, kind, settings, signal, getState }) {
  if (character?.kind === 'assistant') {
    yield* assistantReply({ character, persona, chat, messageId, variantId, settings, signal, getState });
    return;
  }
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

  const ep = await resolveEndpoint(settings);
  if (!ep) {
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
    settings: { ...settings, model: ep.model },
  });
  yield { type: 'meta', meta: { provider: ep.shared ? 'shared' : 'deepseek', kind, ...meta } };
  yield* streamChat({ baseUrl: ep.baseUrl, apiKey: ep.apiKey, headers: ep.headers, body, signal });
}

/** Charcoal Chat: DeepSeek with tools (your chats, the web). Offline and hosted-preview fallbacks keep it usable. */
async function* assistantReply({ character, persona, chat, messageId, variantId, settings, signal, getState }) {
  const index = chat.messages.findIndex((m) => m.id === messageId);
  const sample = SANDBOXED ? await getSample() : null;
  if (sample) {
    const { messages } = await buildAssistantMessages({ chat, uptoIndex: index, persona, settings });
    const { turns, images } = toSampleTurns(messages, 'Charcoal');
    yield { type: 'meta', meta: { provider: 'claude', model: 'Claude' } };
    yield* sampleStream({ sample, turns, images, signal });
    return;
  }
  const ep = await resolveEndpoint(settings);
  if (!ep) {
    yield { type: 'meta', meta: { provider: 'demo' } };
    yield {
      type: 'content',
      text: 'Charcoal Chat needs the AI to be connected. Sign in (free) to use the built-in AI, or add your own DeepSeek key in Settings.',
    };
    yield { type: 'finish', reason: 'stop' };
    return;
  }
  yield { type: 'meta', meta: { provider: ep.shared ? 'shared' : 'deepseek', model: ep.model } };
  yield* assistantStream({ ep, chat, messageId, variantId, persona, settings: { ...settings, model: ep.model }, getState, selfId: character.id, signal });
}
