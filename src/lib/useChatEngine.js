// Drives one chat: sending, parallel drafts, streaming, stopping, swiping, regenerating, retrying.
import { useCallback, useEffect, useRef, useState } from 'react';
import { useStore, useSettings, useActivePersona } from './store.jsx';
import { generateReply } from './generate.js';
import { uid, saveImage } from './images.js';
import { ApiError } from './deepseek.js';
import { MAX_SWIPES } from './settings.js';
import { consume, isRefueling } from './fuel.js';
import { recordChatStart } from './counts.js';

const FLUSH_MS = 40; // batch token appends so long replies don't re-render per token

function emptyReplyMessage(finishReason) {
  if (finishReason === 'length')
    return 'The reply ran out of tokens before any visible text (thinking used the budget). Regenerate, or turn thinking off in Settings.';
  if (finishReason === 'content_filter') return 'DeepSeek filtered this reply. Rephrase or regenerate.';
  return 'DeepSeek returned an empty reply. Regenerate to try again.';
}

export function useChatEngine(character) {
  const { dispatch, getState } = useStore();
  const { settings } = useSettings();
  const persona = useActivePersona();
  const controllerRef = useRef(null);
  const [busy, setBusy] = useState(false);

  // Latest settings/persona for async loops without restarting them.
  const live = useRef({ settings, persona });
  live.current = { settings, persona };

  const charId = character?.id;

  /** Stream one draft into its variant slot. Resolves when that draft finishes, fails or is stopped. */
  const runOne = useCallback(
    async ({ messageId, variantId, kind, signal }) => {
      consume(1); // the break comes every 100 replies (swipes and regenerations count)
      let content = '';
      let reasoning = '';
      let timer = null;
      let finishReason = null;
      let reported = null;
      const flush = () => {
        timer = null;
        if (!content && !reasoning) return;
        dispatch({ type: 'msg/append', charId, messageId, variantId, content, reasoning });
        content = '';
        reasoning = '';
      };

      try {
        const stream = generateReply({
          character,
          persona: live.current.persona,
          chat: getState().chats[charId],
          messageId,
          variantId,
          kind,
          settings: live.current.settings,
          signal,
        });
        for await (const ev of stream) {
          if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
          if (ev.type === 'meta') dispatch({ type: 'msg/meta', charId, messageId, variantId, meta: ev.meta });
          else if (ev.type === 'content' || ev.type === 'reasoning') {
            if (ev.type === 'content') content += ev.text;
            else reasoning += ev.text;
            if (!timer) timer = setTimeout(flush, FLUSH_MS);
          } else if (ev.type === 'finish') finishReason = ev.reason;
          else if (ev.type === 'usage') reported = ev.usage?.completion_tokens ?? null;
        }
        clearTimeout(timer);
        flush();
        // DeepSeek reports exact output tokens at the end; correct the running estimate.
        // (DeepSeek's reported count includes thinking tokens, so it isn't used for fuel.)
        void reported;
        const msg = getState().chats[charId]?.messages.find((m) => m.id === messageId);
        const text = msg?.variants.find((v) => v.id === variantId)?.text || '';
        if (text.trim()) {
          dispatch({ type: 'msg/finish', charId, messageId, variantId, status: 'done', finishReason });
        } else {
          dispatch({
            type: 'msg/finish',
            charId,
            messageId,
            variantId,
            status: 'error',
            error: { kind: 'empty', message: emptyReplyMessage(finishReason) },
          });
        }
      } catch (err) {
        clearTimeout(timer);
        flush();
        if (err?.name === 'AbortError') {
          dispatch({ type: 'msg/finish', charId, messageId, variantId, status: 'stopped' });
        } else {
          const e = err instanceof ApiError ? err : new ApiError(err?.message || 'Something went wrong.');
          dispatch({
            type: 'msg/finish',
            charId,
            messageId,
            variantId,
            status: 'error',
            error: { kind: e.kind, message: e.message, detail: e.detail, status: e.status },
          });
        }
      }
    },
    [character, charId, dispatch, getState],
  );

  /** Run several drafts at once under one Stop button. */
  const runBatch = useCallback(
    async (messageId, jobs) => {
      if (!character) return;
      controllerRef.current?.abort();
      const controller = new AbortController();
      controllerRef.current = controller;
      setBusy(true);
      try {
        await Promise.all(jobs.map((job) => runOne({ messageId, ...job, signal: controller.signal })));
      } finally {
        if (controllerRef.current === controller) {
          controllerRef.current = null;
          setBusy(false);
        }
      }
    },
    [character, runOne],
  );

  const newTurn = useCallback(() => {
    const n = Math.max(1, Math.min(3, Number(live.current.settings.repliesPerMessage) || 1));
    const messageId = uid('msg');
    const variantIds = Array.from({ length: n }, () => uid('v'));
    dispatch({ type: 'msg/char', charId, messageId, variantIds });
    runBatch(
      messageId,
      variantIds.map((variantId, i) => ({ variantId, kind: i === 0 ? 'primary' : 'parallel' })),
    );
  }, [charId, dispatch, runBatch]);

  /** Send a user message (text and/or prepared images); the character answers with N parallel drafts. */
  const send = useCallback(
    async (text, images = []) => {
      if (!character || controllerRef.current || isRefueling()) return false;
      const clean = String(text || '').replace(/\s+$/, '');
      if (!clean.trim() && !images.length) return false;
      for (const img of images) await saveImage(img.id, img.dataUrl);
      recordChatStart(charId);
      dispatch({
        type: 'msg/user',
        charId,
        message: {
          id: uid('msg'),
          role: 'user',
          text: clean,
          images: images.map(({ id, mime, name, width, height, bytes }) => ({ id, mime, name, width, height, bytes })),
          createdAt: Date.now(),
        },
      });
      dispatch({ type: 'stats/bump', charId });
      newTurn();
      return true;
    },
    [character, charId, dispatch, newTurn],
  );

  /** One more swipe, generated on its own (capped at MAX_SWIPES per message). */
  const regenerate = useCallback(
    (messageId) => {
      if (controllerRef.current || isRefueling()) return;
      const msg = getState().chats[charId]?.messages.find((m) => m.id === messageId);
      if (!msg || msg.greeting || msg.variants.length >= MAX_SWIPES) return;
      const variantId = uid('v');
      dispatch({ type: 'msg/variant', charId, messageId, variantId });
      runBatch(messageId, [{ variantId, kind: 'regen' }]);
    },
    [charId, dispatch, getState, runBatch],
  );

  /** Rewrite a failed draft in place. */
  const retry = useCallback(
    (messageId, variantId) => {
      if (controllerRef.current || isRefueling()) return;
      const msg = getState().chats[charId]?.messages.find((m) => m.id === messageId);
      const index = msg?.variants.findIndex((v) => v.id === variantId) ?? -1;
      if (index < 0) return;
      dispatch({ type: 'msg/retry', charId, messageId, variantId });
      runBatch(messageId, [{ variantId, kind: index === 0 ? 'primary' : 'regen' }]);
    },
    [charId, dispatch, getState, runBatch],
  );

  /** The user's last message has no reply (e.g. every draft was stopped): ask again. */
  const replyAgain = useCallback(() => {
    if (controllerRef.current || isRefueling()) return;
    newTurn();
  }, [newTurn]);

  const swipe = useCallback(
    (messageId, index) => dispatch({ type: 'msg/swipe', charId, messageId, index }),
    [charId, dispatch],
  );

  const stop = useCallback(() => controllerRef.current?.abort(), []);

  // Leaving the chat (or switching characters) stops anything in flight.
  useEffect(() => () => controllerRef.current?.abort(), [charId]);

  return { busy, send, regenerate, retry, replyAgain, swipe, stop };
}
