import { memo, useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  Check,
  Copy,
  KeyRound,
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
import { usePopover } from '../ui.jsx';
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

const SETTINGS_KINDS = new Set(['auth', 'model', 'vision', 'balance', 'network']);

function ErrorCard({ error, onRetry, onSettings, busy }) {
  const [open, setOpen] = useState(false);
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

  if (message.role === 'user') {
    const text = fillNames(message.text, names);
    return (
      <article className="msg msg-user">
        <div className="msg-head">
          <span className="msg-name">{persona.name}</span>
          <span style={{ flex: 1 }} />
          <MessageMenu text={text} onDelete={onDelete} />
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
  const canRegen = isLastChar && !message.greeting && !busy && message.variants.length < MAX_SWIPES;

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

      <div
        key={variant?.id}
        className={`bubble ${streaming && text ? 'streaming' : ''} ${swipeDir ? `swipe-${swipeDir}` : ''}`}
        aria-live={streaming ? 'polite' : undefined}
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

      {isLastChar && (
        <div className="msg-actions">
          {!message.greeting && (
            <button type="button" className="icon-btn" onClick={onRegenerate} disabled={!canRegen} aria-label="Regenerate" title="New response">
              <RefreshCw size={18} />
            </button>
          )}
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
