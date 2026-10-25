import { memo, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Check,
  Copy,
  KeyRound,
  MoonStar,
  PlayCircle,
  MoreHorizontal,
  RefreshCw,
  RotateCcw,
  ThumbsDown,
  ThumbsUp,
  Trash2,
  Volume2,
  VolumeX,
  ListBullets,
  Search,
  BookOpen,
  Globe,
  LinkSimple,
  Loader,
  ExternalLink,
  FileText,
} from '../icons.jsx';
import Avatar from '../Avatar.jsx';
import SwipeController from './SwipeController.jsx';
import { useSwipeGesture } from './useSwipeGesture.js';
import { usePopover, useUI } from '../ui.jsx';
import { Markdown } from '../../lib/markdown.jsx';
import { useImageUrl } from '../../lib/images.js';
import { fillNames, formatBytes, resetInfo } from '../../lib/format.js';
import { refreshShared } from '../../lib/endpoint.js';
import { MAX_SWIPES } from '../../lib/settings.js';
import { useSettings } from '../../lib/store.jsx';
import { BlockContext, autoOpenCanvas, cutProse, parseFences, kindOf, proseLength } from '../../lib/canvas.js';

// Replies type out letter by letter at a steady pace, like c.ai (~57 characters/second, measured
// from a screen recording), no matter how fast the network delivers them. If a reply runs far
// ahead (a long one), it types faster until it catches up.
const TYPE_CPS = 57;

function useTypewriter(len, startLive, speed = TYPE_CPS) {
  const [shown, setShown] = useState(startLive ? 0 : len);
  const st = useRef({ acc: startLive ? 0 : len, raf: 0, last: 0, target: len });
  st.current.target = len;
  if (len < st.current.acc) st.current.acc = 0; // the draft was rewritten (retry): type it again
  useEffect(() => {
    const s = st.current;
    if (s.raf || s.acc >= len) return;
    s.last = performance.now();
    const tick = (now) => {
      const behind = s.target - s.acc;
      const cps = behind > 900 ? speed * 2.5 : speed;
      s.acc = Math.min(s.target, s.acc + ((now - s.last) / 1000) * cps);
      s.last = now;
      setShown(Math.floor(s.acc));
      s.raf = s.acc < s.target ? requestAnimationFrame(tick) : 0;
    };
    s.raf = requestAnimationFrame(tick);
  }, [len]);
  useEffect(() => () => cancelAnimationFrame(st.current.raf), []);
  return Math.min(shown, len);
}

/** One draft's text, typed out while it's live. Keyed by variant so each draft types on its own.
 *  Only prose is typed: a code block appears whole (as a Canvas card) when the typing reaches it. */
function TypedReply({ text, live, cps }) {
  const total = proseLength(text);
  const shown = useTypewriter(total, live, cps);
  return <Markdown text={cutProse(text, shown)} streaming={live || shown < total} />;
}

const ACT_ICONS = { list: ListBullets, search: Search, book: BookOpen, globe: Globe, link: LinkSimple };

/** What Charcoal Chat looked at while answering: your chats, web searches, pages. */
function ActivityList({ items }) {
  if (!items?.length) return null;
  return (
    <ul className="act-list" aria-label="Steps">
      {items.map((a) => {
        const Icon = ACT_ICONS[a.icon] || Search;
        return (
          <li key={a.id} className={`act ${a.status}`}>
            {a.status === 'running' ? <Loader size={13} className="spin" /> : <Icon size={13} />}
            <span className="act-text">{a.text}</span>
            {a.detail && <span className="act-detail">{a.detail}</span>}
            {a.url && a.status !== 'running' && (
              <a className="act-link" href={a.url} target="_blank" rel="noreferrer noopener" aria-label="Open page">
                <ExternalLink size={12} />
              </a>
            )}
            {a.status === 'error' && a.error && <span className="act-err">{a.error}</span>}
          </li>
        );
      })}
    </ul>
  );
}

function FileChips({ files }) {
  if (!files?.length) return null;
  return (
    <div className="msg-files">
      {files.map((f) => (
        <span key={f.id} className="file-chip" title={f.name}>
          <FileText size={15} />
          <span className="file-chip-name">{f.name}</span>
          <span className="file-chip-meta">
            {f.pages ? `${f.pages} page${f.pages > 1 ? 's' : ''} · ` : ''}
            {formatBytes(f.bytes)}
          </span>
        </span>
      ))}
    </div>
  );
}

function TypingDots() {
  return (
    <span className="typing" aria-label="Typing">
      <i />
      <i />
      <i />
    </span>
  );
}

function MessageImage({ image, onOpen }) {
  const url = useImageUrl(image.id);
  return (
    <button type="button" className="msg-image" onClick={() => url && onOpen(url)} aria-label={`Open ${image.name || 'image'}`}>
      {url ? <img src={url} alt={image.name || 'Attached image'} /> : <span className="msg-image-loading" />}
    </button>
  );
}

function MessageMenu({ text, onDelete, onSpeak, speaking }) {
  const pop = usePopover();
  const [copied, setCopied] = useState(false);
  return (
    <div className="pop-anchor" ref={pop.ref}>
      <button type="button" className="icon-btn sm" onClick={pop.toggle} aria-label="Message options" aria-expanded={pop.open}>
        <MoreHorizontal size={16} />
      </button>
      {pop.open && (
        <div className="popover menu" role="menu">
          <button
            type="button"
            role="menuitem"
            className="menu-item"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(text);
                setCopied(true);
                setTimeout(() => pop.setOpen(false), 500);
              } catch {
                pop.setOpen(false);
              }
            }}
          >
            {copied ? <Check size={16} /> : <Copy size={16} />} {copied ? 'Copied' : 'Copy text'}
          </button>
          {onSpeak && (
            <button
              type="button"
              role="menuitem"
              className="menu-item"
              onClick={() => {
                pop.setOpen(false);
                onSpeak();
              }}
            >
              {speaking ? <VolumeX size={16} /> : <Volume2 size={16} />} {speaking ? 'Stop reading' : 'Read aloud'}
            </button>
          )}
          {onDelete && (
            <button
              type="button"
              role="menuitem"
              className="menu-item danger"
              onClick={() => {
                pop.setOpen(false);
                onDelete();
              }}
            >
              <Trash2 size={16} /> Delete message
            </button>
          )}
        </div>
      )}
    </div>
  );
}

const SETTINGS_KINDS = new Set(['auth', 'model', 'vision', 'balance', 'network', 'builtin']);

function LimitCard({ onSettings }) {
  const ui = useUI();
  const { at, left } = resetInfo();
  useEffect(() => {
    refreshShared(); // so the home banner knows too
  }, []);
  return (
    <div className="msg-limit" role="status">
      <span className="msg-limit-icon" aria-hidden="true">
        <MoonStar size={20} />
      </span>
      <div className="msg-limit-body">
        <strong>You’ve used today’s free AI</strong>
        <p>
          It refills at <b>{at}</b> (in {left}). Want to keep going now? Add your own DeepSeek key and it’s unlimited.
        </p>
        <div className="msg-error-actions">
          <button type="button" className="btn btn-primary btn-sm" onClick={ui.openGuide}>
            <PlayCircle size={13} /> Show me how
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onSettings}>
            <KeyRound size={13} /> Add my own key
          </button>
        </div>
      </div>
    </div>
  );
}

function ErrorCard({ error, onRetry, onSettings, busy }) {
  const [open, setOpen] = useState(false);
  const ui = useUI();
  if (error?.kind === 'limit') return <LimitCard onSettings={onSettings} />;
  if (error?.kind === 'signin')
    return (
      <div className="msg-limit" role="status">
        <span className="msg-limit-icon" aria-hidden="true">
          <KeyRound size={18} />
        </span>
        <div className="msg-limit-body">
          <strong>Sign in to keep chatting</strong>
          <p>The built-in AI is free with an account. It takes 10 seconds, no email.</p>
          <div className="msg-error-actions">
            <button type="button" className="btn btn-primary btn-sm" onClick={ui.openAccount}>
              Sign in
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={onRetry} disabled={busy}>
              <RotateCcw size={13} /> Retry
            </button>
          </div>
        </div>
      </div>
    );
  return (
    <div className="msg-error" role="alert">
      <AlertTriangle size={16} />
      <div className="msg-error-body">
        <p>{error?.message || 'This reply failed.'}</p>
        {error?.detail && (
          <button type="button" className="msg-error-toggle" onClick={() => setOpen((o) => !o)}>
            {open ? 'Hide details' : 'Show details'}
          </button>
        )}
        {open && <pre className="msg-error-detail">{error.detail}</pre>}
        <div className="msg-error-actions">
          <button type="button" className="btn btn-ghost btn-sm" onClick={onRetry} disabled={busy}>
            <RotateCcw size={13} /> Retry
          </button>
          {SETTINGS_KINDS.has(error?.kind) && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={onSettings}>
              <KeyRound size={13} /> Settings
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function ChatMessage({
  message,
  character,
  persona,
  isLastChar,
  busy,
  speaking,
  onSpeak,
  onSwipe,
  onRegenerate,
  onRetry,
  onRate,
  onDelete,
  onOpenImage,
  onOpenProfile,
  onOpenSettings,
}) {
  const names = { user: persona.name, char: character.name };
  // Remember the last committed swipe so a new draft slides in from the right side.
  // Hooks stay above the early return.
  const lastActive = useRef(message.active);
  const liveAtMount = useRef({}); // variantId -> was it still being written when we first showed it
  useEffect(() => {
    lastActive.current = message.active;
  });

  // Swipe the whole reply sideways (latest character message only).
  const total = message.variants?.length || 0;
  const canGenerate = !message.greeting && !busy && total < MAX_SWIPES;
  const onLast = message.active >= total - 1;
  const swipe = useSwipeGesture({
    enabled: message.role === 'char' && isLastChar && (total > 1 || canGenerate),
    canPrev: message.active > 0,
    canNext: !onLast || canGenerate,
    nextIsNew: onLast,
    onPrev: () => onSwipe(message.active - 1),
    onNext: () => (onLast ? onRegenerate() : onSwipe(message.active + 1)),
  });

  // Typewriter and Canvas are both optional (Settings). Hooks stay above the early return.
  const { settings } = useSettings();
  const typewriter = settings.typewriter !== false;
  const canvasOn = settings.canvas !== false;
  const draft = message.role === 'char' ? message.variants?.[message.active] || message.variants?.[0] : null;
  const draftLive = draft?.status === 'pending' || draft?.status === 'streaming';
  const draftId = draft?.id;
  const draftText = draft?.text || '';
  const blockCtx = useMemo(
    () => (canvasOn && draftId ? { charId: character.id, messageId: message.id, variantId: draftId, streaming: draftLive } : null),
    [canvasOn, draftId, draftLive, character.id, message.id],
  );
  // A web page being written opens the Canvas by itself, once, so you can watch it come together.
  useEffect(() => {
    if (!canvasOn || !draftLive || !draftId) return;
    const b = parseFences(draftText).find((x) => kindOf(x.lang, x.code) === 'web');
    if (b) autoOpenCanvas({ charId: character.id, messageId: message.id, variantId: draftId, index: b.index });
  }, [canvasOn, draftLive, draftId, draftText, character.id, message.id]);

  if (message.role === 'user') {
    const text = fillNames(message.text, names);
    return (
      <article className="msg msg-user">
        <div className="msg-head msg-head-user">
          <MessageMenu text={text} onDelete={onDelete} />
          <span className="msg-name">{persona.name}</span>
        </div>
        <div className="bubble">
          {message.images?.length > 0 && (
            <div className={`msg-images n${Math.min(message.images.length, 4)}`}>
              {message.images.map((img) => (
                <MessageImage key={img.id} image={img} onOpen={onOpenImage} />
              ))}
            </div>
          )}
          <FileChips files={message.files} />
          {text && <Markdown text={text} />}
        </div>
      </article>
    );
  }

  const variant = message.variants[message.active] || message.variants[0];
  if (variant && liveAtMount.current[variant.id] === undefined) {
    liveAtMount.current[variant.id] = variant.status === 'pending' || variant.status === 'streaming';
  }
  const swipeDir = message.active > lastActive.current ? 'next' : message.active < lastActive.current ? 'prev' : null;
  const text = fillNames(variant?.text || '', names);
  const pending = variant?.status === 'pending' || (variant?.status === 'streaming' && !text);
  const streaming = variant?.status === 'streaming' || variant?.status === 'pending';
  const thinking = streaming && !text && variant?.reasoning;
  const demo = variant?.meta?.provider === 'demo';

  return (
    <article className="msg msg-char">
      <div className="msg-head">
        <button type="button" className="msg-who" onClick={onOpenProfile} aria-label={`About ${character.name}`}>
          <Avatar avatar={character.avatar} name={character.name} size={26} round />
          <span className="msg-name">{character.name}</span>
        </button>
        <span className="ai-pill">{demo ? 'demo' : 'AI'}</span>
        {variant?.status === 'stopped' && <span className="msg-tag">stopped</span>}
        {variant?.meta?.finishReason === 'length' && <span className="msg-tag">cut off</span>}
        <span style={{ flex: 1 }} />
        {text && !streaming && (
          <MessageMenu
            text={text}
            onDelete={message.greeting ? null : onDelete}
            speaking={speaking}
            onSpeak={() => onSpeak(variant.id, text)}
          />
        )}
      </div>

      <div className={`swipe-track ${swipe.dragging ? 'dragging' : ''}`}>
        {swipe.hint && (
          <span className={`swipe-hint ${swipe.side}`} style={{ opacity: swipe.progress }}>
            {swipe.hint === 'New response' && <RefreshCw size={14} />}
            {swipe.hint}
          </span>
        )}
      <div
        key={variant?.id}
        className={`bubble ${streaming && text ? 'streaming' : ''} ${swipeDir ? `swipe-${swipeDir}` : ''} ${isLastChar ? 'swipeable' : ''}`}
        aria-live={streaming ? 'polite' : undefined}
        style={swipe.style}
        {...swipe.bind}
      >
        {variant?.status === 'error' ? (
          <ErrorCard error={variant.error} busy={busy} onRetry={() => onRetry(variant.id)} onSettings={onOpenSettings} />
        ) : pending ? (
          <>
            <ActivityList items={variant?.activity} />
            <div className="msg-pending">
              <TypingDots />
              {thinking && <span className="msg-thinking">thinking…</span>}
            </div>
          </>
        ) : (
          <BlockContext.Provider value={blockCtx}>
            <ActivityList items={variant?.activity} />
            {typewriter ? (
              <TypedReply
                key={variant?.id}
                text={text}
                live={liveAtMount.current[variant?.id] ?? false}
                cps={character.kind === 'assistant' ? 240 : TYPE_CPS /* Charcoal Chat answers run long: type faster */}
              />
            ) : (
              <Markdown key={variant?.id} text={text} streaming={streaming} />
            )}
          </BlockContext.Provider>
        )}
      </div>
      </div>

      {isLastChar && (
        <div className="msg-actions">
          {!message.greeting && text && !streaming && (
            <>
              <button
                type="button"
                className={`icon-btn ${variant.rating === 'up' ? 'rated' : ''}`}
                onClick={() => onRate(variant.id, 'up')}
                aria-label="Good response"
                aria-pressed={variant.rating === 'up'}
              >
                <ThumbsUp size={18} />
              </button>
              <button
                type="button"
                className={`icon-btn ${variant.rating === 'down' ? 'rated' : ''}`}
                onClick={() => onRate(variant.id, 'down')}
                aria-label="Bad response"
                aria-pressed={variant.rating === 'down'}
              >
                <ThumbsDown size={18} />
              </button>
            </>
          )}
          <span style={{ flex: 1 }} />
          <SwipeController message={message} busy={busy} onSwipe={onSwipe} onRegenerate={onRegenerate} />
        </div>
      )}
    </article>
  );
}

export default memo(ChatMessage);
