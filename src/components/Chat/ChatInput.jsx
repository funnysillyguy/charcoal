import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { ChevronDown, ImagePlus, SendHorizontal, Square, X, AlertTriangle, KeyRound, RefreshCw, Loader } from '../icons.jsx';
import HelpWriteIcon from '../HelpWriteIcon.jsx';
import { Markdown } from '../../lib/markdown.jsx';
import { suggestReplies } from '../../lib/assist.js';
import { consume, useFuel } from '../../lib/fuel.js';
import PersonaPicker from './PersonaPicker.jsx';
import { useUI } from '../ui.jsx';
import { useSettings, useProvider, useStore, useActivePersona } from '../../lib/store.jsx';
import { supportsVision, SANDBOXED } from '../../lib/settings.js';
import { ACCEPTED_TYPES, MAX_IMAGES_PER_MESSAGE, imageFilesFrom, prepareImage } from '../../lib/images.js';
import { formatBytes } from '../../lib/format.js';

const MAX_LEN = 4000;

const ChatInput = forwardRef(function ChatInput({ character, busy, onSend, onStop }, ref) {
  const ui = useUI();
  const { settings } = useSettings();
  const status = useProvider();
  const [text, setText] = useState('');
  const [images, setImages] = useState([]);
  const [processing, setProcessing] = useState(false);
  const taRef = useRef(null);
  const fileRef = useRef(null);
  const { state } = useStore();
  const persona = useActivePersona();
  const fuel = useFuel();
  const [helper, setHelper] = useState(null);
  const [showInfo, setShowInfo] = useState(false);
  const helperCtl = useRef(null);

  const runHelper = async () => {
    const chat = state.chats[character.id];
    if (!chat || fuel.refueling) return;
    helperCtl.current?.abort();
    const ctl = new AbortController();
    helperCtl.current = ctl;
    const improving = !!text.trim();
    setHelper((h) => ({ ...(h || {}), loading: true, error: '', improving }));
    try {
      const res = await suggestReplies({ settings, character, persona, chat, draft: text, signal: ctl.signal });
      // Every suggestion the AI writes counts toward the break, same as every reply draft (3 ideas = 3).
      if (!res.offline) consume(res.options?.length || 3);
      setHelper({ loading: false, options: res.options, improving, offline: !!res.offline });
    } catch (e) {
      if (e?.name === 'AbortError') return;
      setHelper({ loading: false, options: [], improving, error: e?.message || 'Suggestions failed. Try again.' });
    }
  };
  const closeHelper = () => {
    helperCtl.current?.abort();
    setHelper(null);
  };
  useEffect(() => () => helperCtl.current?.abort(), []);

  const draftKey = `charcoal:draft:${character.id}`;

  // Restore / persist the unsent draft per character (convenience only).
  useEffect(() => {
    try {
      setText(sessionStorage.getItem(draftKey) || '');
    } catch {
      setText('');
    }
    setImages([]);
    setHelper(null);
  }, [draftKey]);
  useEffect(() => {
    try {
      if (text) sessionStorage.setItem(draftKey, text);
      else sessionStorage.removeItem(draftKey);
    } catch {
      /* storage blocked */
    }
  }, [text, draftKey]);

  // Auto-grow up to ~8 lines.
  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${Math.min(ta.scrollHeight, 200)}px`;
  }, [text]);

  const addFiles = useCallback(
    async (files) => {
      const list = [...files];
      if (!list.length) return;
      const room = MAX_IMAGES_PER_MESSAGE - images.length;
      if (room <= 0) {
        ui.toast(`Up to ${MAX_IMAGES_PER_MESSAGE} images per message.`, 'error');
        return;
      }
      setProcessing(true);
      const added = [];
      for (const f of list.slice(0, room)) {
        try {
          added.push(await prepareImage(f));
        } catch (e) {
          ui.toast(e.message, 'error');
        }
      }
      if (list.length > room) ui.toast(`Only the first ${room} image${room > 1 ? 's were' : ' was'} added.`);
      setImages((prev) => [...prev, ...added]);
      setProcessing(false);
      taRef.current?.focus();
    },
    [images.length, ui],
  );

  useImperativeHandle(ref, () => ({ addFiles, focus: () => taRef.current?.focus() }), [addFiles]);

  const canSend = !busy && !processing && !fuel.refueling && (text.trim() || images.length) && text.length <= MAX_LEN;

  const submit = async () => {
    if (!canSend) return;
    const ok = await onSend(text, images);
    if (ok !== false) {
      setText('');
      setImages([]);
      setHelper(null);
    }
  };

  const onKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
    }
  };

  const onPaste = (e) => {
    const files = imageFilesFrom(e.clipboardData);
    if (!files.length) return;
    if (!e.clipboardData.getData('text/plain')) e.preventDefault();
    addFiles(files);
  };

  const visionWarning = images.length > 0 && status.provider === 'deepseek' && !supportsVision(settings.model);

  return (
    <div className="composer">
      {status.mode === 'demo' && (
        <div className="composer-note">
          <span className="status-dot demo" />
          {SANDBOXED
            ? 'Claude isn’t available in this view, so replies are offline demo text.'
            : status.detail === 'Sign in for real replies'
              ? 'Demo replies. Sign in (free) to chat with the real AI.'
              : 'Demo replies. The built-in AI is off right now.'}
          {!SANDBOXED && status.detail === 'Sign in for real replies' && (
            <button type="button" className="composer-note-btn" onClick={ui.openAccount}>
              <KeyRound size={13} /> Sign in
            </button>
          )}
          {!SANDBOXED && status.detail !== 'Sign in for real replies' && (
            <button type="button" className="composer-note-btn" onClick={ui.openSettings}>
              <KeyRound size={13} /> Settings
            </button>
          )}
        </div>
      )}

      {visionWarning && (
        <div className="composer-note warn">
          <AlertTriangle size={14} />
          {settings.model} may not accept images. deepseek-flash does.
        </div>
      )}

      {(images.length > 0 || processing) && (
        <div className="attachments">
          {images.map((img) => (
            <div key={img.id} className="attachment">
              <img src={img.dataUrl} alt={img.name} />
              <span className="attachment-size">{formatBytes(img.bytes)}</span>
              <button
                type="button"
                className="attachment-remove"
                onClick={() => setImages((prev) => prev.filter((x) => x.id !== img.id))}
                aria-label={`Remove ${img.name}`}
              >
                <X size={12} />
              </button>
            </div>
          ))}
          {processing && <div className="attachment loading" aria-label="Processing image" />}
        </div>
      )}

      {helper && (
        <div className="helper-panel" role="region" aria-label="Help me write">
          <div className="helper-panel-head">
            <span className="help-tile sm">
              <HelpWriteIcon size={13} />
            </span>
            <span className="helper-panel-title">{helper.improving ? 'Rewrites of your draft' : 'Ideas for what to say'}</span>
            {helper.offline && <span className="msg-tag">offline</span>}
            <span style={{ flex: 1 }} />
            <button type="button" className="icon-btn sm" onClick={runHelper} disabled={helper.loading} aria-label="More suggestions" title="More suggestions">
              {helper.loading ? <Loader size={14} className="spin" /> : <RefreshCw size={14} />}
            </button>
            <button type="button" className="icon-btn sm" onClick={closeHelper} aria-label="Close suggestions">
              <X size={14} />
            </button>
          </div>
          {helper.error && <p className="field-error">{helper.error}</p>}
          <div className="helper-options">
            {helper.loading && !helper.options?.length
              ? [0, 1, 2].map((i) => <div key={i} className="helper-option skeleton" />)
              : (helper.options || []).map((o, i) => (
                  <button
                    key={i}
                    type="button"
                    className={`helper-option ${helper.loading ? 'stale' : ''}`}
                    onClick={() => {
                      setText(o.text);
                      setHelper(null);
                      taRef.current?.focus();
                    }}
                  >
                    <span className="helper-option-label">{o.label}</span>
                    <Markdown text={o.text} />
                  </button>
                ))}
          </div>
        </div>
      )}

      <div className="composer-row">
        <div className="composer-box">
          <PersonaPicker />
          <textarea
            ref={taRef}
            id={`composer-${character.id}`}
            className="composer-input"
            rows={1}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={onKeyDown}
            onPaste={onPaste}
            placeholder={fuel.refueling ? 'Refueling…' : 'Message…'}
            aria-label={`Message ${character.name}`}
            disabled={fuel.refueling}
          />
          {busy ? (
            <button type="button" className="send-btn stop" onClick={onStop} aria-label="Stop generating" title="Stop">
              <Square size={13} fill="currentColor" />
            </button>
          ) : (
            <button type="button" className="send-btn" onClick={submit} disabled={!canSend} aria-label="Send">
              <SendHorizontal size={19} fill="currentColor" />
            </button>
          )}
        </div>
        <button
          type="button"
          className={`circle-btn lg help-btn ${helper ? 'on' : ''}`}
          onClick={() => (helper ? closeHelper() : runHelper())}
          aria-label={text.trim() ? 'Help me write: rewrite my draft' : 'Help me write: suggest a reply'}
          title={text.trim() ? 'Help me write (rewrite draft)' : 'Help me write (suggest replies)'}
          disabled={fuel.refueling}
        >
          <HelpWriteIcon size={19} />
        </button>
        <button
          type="button"
          className="circle-btn lg"
          onClick={() => fileRef.current?.click()}
          aria-label="Attach images"
          title="Attach images (PNG, JPEG, WebP). You can also paste or drop them."
          disabled={images.length >= MAX_IMAGES_PER_MESSAGE || fuel.refueling}
        >
          <ImagePlus size={20} />
        </button>
        <input
          ref={fileRef}
          type="file"
          accept={ACCEPTED_TYPES.join(',')}
          multiple
          hidden
          onChange={(e) => {
            addFiles(e.target.files);
            e.target.value = '';
          }}
        />
      </div>
      <button type="button" className="disclaimer" onClick={() => setShowInfo((v) => !v)} aria-expanded={showInfo}>
        This is A.I. and not a real person. Treat everything it says as fiction
        <ChevronDown size={14} className={showInfo ? 'flip' : ''} />
      </button>
      {showInfo && (
        <p className="disclaimer-more">
          {status.provider === 'claude'
            ? 'Replies are written by Claude, built into this page.'
            : status.provider === 'deepseek'
              ? `Replies are written by DeepSeek (${status.short}).`
              : status.provider === 'shared'
                ? 'Replies are written by Charcoal AI (DeepSeek Flash).'
                : 'Replies are offline demo text.'}{' '}
          Enter sends, Shift+Enter adds a line. Paste or drop images to attach them.
          {text.length > MAX_LEN * 0.8 && ` ${text.length}/${MAX_LEN} characters.`}
        </p>
      )}
    </div>
  );
});

export default ChatInput;
