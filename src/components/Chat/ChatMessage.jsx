import { memo, useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  Check,
  Copy,
  KeyRound,
  MoonStar,
  MoreHorizontal,
  RefreshCw,
  RotateCcw,
  ThumbsDown,
  ThumbsUp,
  Trash2,
  Volume2,
  VolumeX,
} from 'lucide-react';
import Avatar from '../Avatar.jsx';
import SwipeController from './SwipeController.jsx';
import { useSwipeGesture } from './useSwipeGesture.js';
import { usePopover, useUI } from '../ui.jsx';
import { Markdown } from '../../lib/markdown.jsx';
import { useImageUrl } from '../../lib/images.js';
import { fillNames } from '../../lib/format.js';
import { MAX_SWIPES } from '../../lib/settings.js';

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

/** Next midnight UTC (when the built-in AI allowance resets), in the viewer's own time. */
function resetInfo() {
  const now = new Date();
  const reset = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
  const mins = Math.max(1, Math.round((reset - now) / 60000));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return {
    at: reset.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
    left: h ? `${h}h ${m}m` : `${m}m`,
  };
}

function LimitCard({ onSettings }) {
  const { at, left } = resetInfo();
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
          <button type="button" className="btn btn-primary btn-sm" onClick={onSettings}>
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
          {text && <Markdown text={text} />}
        </div>
      </article>
    );
  }

  const variant = message.variants[message.active] || message.variants[0];
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
          <div className="msg-pending">
            <TypingDots />
            {thinking && <span className="msg-thinking">thinking…</span>}
          </div>
        ) : (
          <Markdown text={text} streaming={streaming} />
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
