import { useEffect, useState } from 'react';
import { CheckCircle2, Eye, EyeOff, Loader, PlugZap, ShieldAlert, Sparkles, Users, XCircle } from './icons.jsx';
import { Modal, useUI } from './ui.jsx';
import { SHARED_BASE, SHARED_MODEL, setSharedKey, useShared, refreshShared } from '../lib/endpoint.js';
import { CLOUD_ENABLED, CLOUD_KEY, accessToken } from '../lib/cloud.js';
import { PoweredBy } from './ThankButton.jsx';
import { useSettings, useProvider } from '../lib/store.jsx';
import { getSample } from '../lib/hostAI.js';
import { listModels } from '../lib/deepseek.js';
import {
  DEFAULT_BASE_URL,
  DEFAULT_MODEL,
  ENV_KEY,
  SANDBOXED,
  VISION_MODELS,
  effectiveBaseUrl,
  supportsVision,
} from '../lib/settings.js';

function maskTail(key) {
  return key ? `••••${key.slice(-4)}` : '';
}

export default function SettingsModal({ open, onClose, onSaved }) {
  const { settings, updateSettings } = useSettings();
  const status = useProvider();
  const shared = useShared();
  const ui = useUI();
  const [sharing, setSharing] = useState(false);
  const [draft, setDraft] = useState(settings);
  const [reveal, setReveal] = useState(false);
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState(null);

  useEffect(() => {
    if (open) {
      refreshShared();
      setDraft(settings);
      setReveal(false);
      setResult(settings.lastCheck || null);
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (patch) => setDraft((d) => ({ ...d, ...patch }));
  const keyChanged = (draft.apiKey || '') !== (settings.apiKey || '') || draft.baseUrl !== settings.baseUrl;
  const usingEnv = !draft.apiKey && !!ENV_KEY;

  const save = (extra = {}) => {
    const next = {
      ...draft,
      apiKey: (draft.apiKey || '').trim(),
      model: (draft.model || '').trim() || DEFAULT_MODEL,
      baseUrl: (draft.baseUrl || '').trim(),
      lastCheck: keyChanged ? null : settings.lastCheck,
      ...extra,
    };
    updateSettings(next);
    return next;
  };

  const testClaude = async () => {
    setTesting(true);
    setResult(null);
    try {
      const sample = await getSample();
      if (!sample) throw { code: 'unavailable' };
      await sample('Reply with exactly: OK', { modelTier: 'quick', cache: false });
      setResult({ ok: true, message: 'Claude is connected. Replies, swipes, images and Help me write all work on this page.' });
    } catch (e) {
      const msg =
        e?.code === 'not_granted'
          ? 'Permission was declined. Reload the page and choose Allow to turn on real replies.'
          : e?.code === 'rate_limited'
            ? 'Rate limited. Wait a minute and test again.'
            : e?.code === 'unavailable'
              ? 'Claude isn’t available in this view (it works inside the claude.ai app and site).'
              : 'Claude didn’t answer. Try again in a moment.';
      setResult({ ok: false, message: msg });
    } finally {
      setTesting(false);
    }
  };

  const test = async () => {
    if (SANDBOXED) return testClaude();
    const next = save();
    const key = next.apiKey || ENV_KEY;
    if (!key && shared.signedIn) {
      setTesting(true);
      setResult(null);
      try {
        await listModels({ baseUrl: SHARED_BASE, apiKey: await accessToken(), headers: { apikey: CLOUD_KEY } });
        setResult({ ok: true, message: `Connected to Charcoal's built-in AI (${SHARED_MODEL}). No key needed.` });
      } catch (e) {
        setResult({ ok: false, message: e.message });
      } finally {
        setTesting(false);
      }
      return;
    }
    if (!key) {
      setResult({ ok: false, message: CLOUD_ENABLED ? 'Sign in to use the built-in AI, or paste your own key.' : 'Paste an API key first.' });
      return;
    }
    setTesting(true);
    setResult(null);
    try {
      const models = await listModels({ baseUrl: effectiveBaseUrl(next), apiKey: key });
      const hasModel = models.includes(next.model);
      const check = {
        ok: true,
        at: Date.now(),
        models,
        message: hasModel
          ? `Connected. ${next.model} is available.`
          : `Key works, but "${next.model}" isn't in your model list (${models.join(', ') || 'none returned'}).`,
        warn: !hasModel,
      };
      setResult(check);
      updateSettings({ lastCheck: check });
    } catch (e) {
      const check = { ok: false, at: Date.now(), message: e.message };
      setResult(check);
      updateSettings({ lastCheck: check });
    } finally {
      setTesting(false);
    }
  };

  const n = draft.repliesPerMessage || 1;
  const sentences = draft.maxSentences ?? 5;

  const shareKey = async (key) => {
    setSharing(true);
    try {
      const r = await setSharedKey(key);
      ui.toast(r.enabled ? 'Built-in AI is on for everyone' : 'Built-in AI is off', 'ok');
    } catch (e) {
      ui.toast(e.message, 'error');
    } finally {
      setSharing(false);
      refreshShared();
    }
  };
  const used = shared.usedToday || 0;
  const limit = shared.dailyLimit || 0;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Settings"
      subtitle="DeepSeek connection and reply generation"
      size="md"
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={test} disabled={testing}>
            {testing ? <Loader size={15} className="spin" /> : <PlugZap size={15} />}
            {SANDBOXED ? 'Test Claude' : 'Test connection'}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              save();
              onSaved?.();
              onClose();
            }}
          >
            Save
          </button>
        </>
      }
    >
      {SANDBOXED && (
        <>
          <div className="provider-card">
            <span className={`status-dot ${status.mode}`} />
            <div>
              <strong>{status.provider === 'claude' ? 'Replies by Claude, built into this page' : status.label}</strong>
              <p>
                {status.provider === 'claude'
                  ? 'Streaming, parallel swipes, image uploads and Help me write run on your Claude usage. The first reply asks you to allow it.'
                  : status.detail}
              </p>
            </div>
          </div>
          <div className="notice">
            <ShieldAlert size={16} />
            <p>
              claude.ai blocks hosted pages from sending requests to other sites, so this page can't reach DeepSeek, and
              that block can't be switched off from the page. Your DeepSeek key works anywhere else Charcoal runs: the
              downloaded project (<code>npm run dev</code>) or its build deployed to any host. DeepSeek allows browser
              requests, so no server is needed.
            </p>
          </div>
        </>
      )}

      {!SANDBOXED && CLOUD_ENABLED && (
        <div className="builtin-card">
          <div className="builtin-head">
            <span className="logo-mark sm" aria-hidden="true" />
            <strong>Charcoal AI</strong>
            <span className={`status-dot ${shared.enabled ? 'live' : shared.signedIn ? 'demo' : 'unverified'}`} />
          </div>
          {!shared.signedIn ? (
            <p>
              Free built-in AI for everyone with an account, no key needed.{' '}
              <button type="button" className="link-btn" onClick={() => { onClose(); ui.openAccount(); }}>
                Sign in or create an account
              </button>
            </p>
          ) : shared.enabled ? (
            <>
              <p>{settings.apiKey ? 'Available, but your own key below takes priority.' : 'You’re on the built-in AI (DeepSeek Flash). Nothing to set up.'}</p>
              <PoweredBy />
              {limit > 0 && (
                <div className="builtin-usage">
                  <span>Today: {used.toLocaleString()} / {limit.toLocaleString()} tokens</span>
                  <div className="fuel-pop-bar"><span style={{ transform: `scaleX(${Math.min(1, used / limit)})` }} /></div>
                </div>
              )}
            </>
          ) : (
            <p>The owner hasn’t switched the built-in AI on yet.</p>
          )}
          {shared.owner && (
            <div className="builtin-owner">
              <Users size={15} />
              <span>
                {shared.enabled ? `On for everyone, using your key ••••${shared.keyTail}. It never leaves the server.` : 'Let everyone with an account use your key. It stays on the server; nobody can see it.'}
              </span>
              {shared.enabled ? (
                <div className="builtin-owner-actions">
                  {settings.apiKey && settings.apiKey.slice(-4) !== shared.keyTail && (
                    <button type="button" className="btn btn-ghost btn-sm" disabled={sharing} onClick={() => shareKey(settings.apiKey)}>
                      Use my current key
                    </button>
                  )}
                  <button type="button" className="btn btn-ghost btn-sm" disabled={sharing} onClick={() => shareKey(null)}>
                    Turn off
                  </button>
                </div>
              ) : (
                <button type="button" className="btn btn-primary btn-sm" disabled={sharing || !(draft.apiKey || settings.apiKey)} onClick={() => shareKey((draft.apiKey || settings.apiKey).trim())}>
                  {sharing ? <Loader size={14} className="spin" /> : <Users size={14} />} Share my key with everyone
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {!SANDBOXED && (
      <>
      <div className="field">
        <label className="field-label" htmlFor="ds-key">
          {CLOUD_ENABLED ? 'Your own DeepSeek key (optional)' : 'DeepSeek API key'}
          {settings.apiKey && !keyChanged && <span className="count">saved {maskTail(settings.apiKey)}</span>}
        </label>
        <div className="input-group">
          <input
            id="ds-key"
            className="input mono"
            type={reveal ? 'text' : 'password'}
            value={draft.apiKey || ''}
            onChange={(e) => set({ apiKey: e.target.value })}
            placeholder={usingEnv ? `Using VITE_DEEPSEEK_API_KEY (${maskTail(ENV_KEY)})` : 'sk-…'}
            autoComplete="off"
            spellCheck={false}
            disabled={SANDBOXED}
            data-autofocus
          />
          <button
            type="button"
            className="icon-btn"
            onClick={() => setReveal((r) => !r)}
            aria-label={reveal ? 'Hide key' : 'Show key'}
            aria-pressed={reveal}
            disabled={SANDBOXED}
          >
            {reveal ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
        <p className="field-hint">
          Stored in this browser's localStorage and sent only to the base URL below. Get one at platform.deepseek.com.
          {usingEnv && ' Leave empty to keep using the key from your .env file.'}
        </p>
      </div>

      {result && (
        <div className={`check ${result.ok ? (result.warn ? 'warn' : 'ok') : 'bad'}`} role="status">
          {result.ok ? result.warn ? <ShieldAlert size={16} /> : <CheckCircle2 size={16} /> : <XCircle size={16} />}
          <span>{result.message}</span>
        </div>
      )}

      <div className="field">
        <label className="field-label" htmlFor="ds-model">
          Model
        </label>
        <input
          id="ds-model"
          className="input mono"
          list="ds-models"
          value={draft.model || ''}
          onChange={(e) => set({ model: e.target.value })}
          placeholder={DEFAULT_MODEL}
          spellCheck={false}
          disabled={SANDBOXED}
        />
        <datalist id="ds-models">
          {[...new Set([...VISION_MODELS.slice(0, 1), 'deepseek-v4-pro', ...(result?.models || [])])].map((m) => (
            <option key={m} value={m} />
          ))}
        </datalist>
        <p className="field-hint">
          V4.1-Flash is <code>deepseek-flash</code> on api.deepseek.com and it's the one that reads images.
          {draft.model && !supportsVision(draft.model) && ' This model may reject image uploads.'}
        </p>
      </div>

      </>
      )}

      <div className="field">
        <span className="field-label">Replies per message</span>
        <div className="segmented" role="radiogroup" aria-label="Replies per message">
          {[1, 2, 3].map((v) => (
            <button
              key={v}
              type="button"
              role="radio"
              aria-checked={n === v}
              className={n === v ? 'active' : ''}
              onClick={() => set({ repliesPerMessage: v })}
            >
              {v}
            </button>
          ))}
        </div>
        <p className="field-hint">
          Drafts written at once for every message you send. Swipe left past the last one for another, up to 40.
        </p>
      </div>

      <div className="field">
        <span className="field-label">Reply length</span>
        <div className="segmented" role="radiogroup" aria-label="Maximum sentences per reply">
          {[[3, '3 sentences'], [5, '5'], [8, '8'], [0, 'No cap']].map(([v, label]) => (
            <button key={v} type="button" role="radio" aria-checked={sentences === v} className={sentences === v ? 'active' : ''} onClick={() => set({ maxSentences: v })}>
              {label}
            </button>
          ))}
        </div>
        <p className="field-hint">Most sentences a reply can have, actions included. “No cap” uses each character’s own length setting.</p>
      </div>

      <div className="field">
        <div className="switch-row">
          <span>
            <span className="field-label">Typewriter effect</span>
            <span className="field-hint">
              Replies type out letter by letter. Turn it off and text shows up as fast as it arrives.
            </span>
          </span>
          <button
            type="button"
            className="switch"
            role="switch"
            aria-checked={draft.typewriter !== false}
            aria-label="Typewriter effect"
            onClick={() => set({ typewriter: draft.typewriter === false })}
          />
        </div>
      </div>

      <div className="field">
        <div className="switch-row">
          <span>
            <span className="field-label">Canvas and code runner</span>
            <span className="field-hint">
              Web pages a character writes open in a live preview beside the chat, and Python or JavaScript can be run
              on the spot. Everything runs in an isolated sandbox with no internet and no access to your account.
            </span>
          </span>
          <button
            type="button"
            className="switch"
            role="switch"
            aria-checked={draft.canvas !== false}
            aria-label="Canvas and code runner"
            onClick={() => set({ canvas: draft.canvas === false })}
          />
        </div>
      </div>

      {!SANDBOXED && (
      <>
      <div className="field">
        <div className="switch-row">
          <span>
            <span className="field-label">Thinking mode</span>
            <span className="field-hint">
              Off by default for roleplay: faster first token, and temperature (including swipe variation) only applies
              with thinking off.
            </span>
          </span>
          <button
            type="button"
            className="switch"
            role="switch"
            aria-checked={!!draft.thinking}
            aria-label="Thinking mode"
            onClick={() => set({ thinking: !draft.thinking })}
            disabled={SANDBOXED}
          />
        </div>
      </div>

      <details className="advanced">
        <summary>Advanced</summary>
        <div className="field">
          <label className="field-label" htmlFor="ds-base">
            Base URL
          </label>
          <input
            id="ds-base"
            className="input mono"
            value={draft.baseUrl || ''}
            onChange={(e) => set({ baseUrl: e.target.value })}
            placeholder={DEFAULT_BASE_URL}
            spellCheck={false}
            disabled={SANDBOXED}
          />
          <p className="field-hint">
            Requests go to <code>{'{base}'}/chat/completions</code>. Use <code>/deepseek/v1</code> to route through the
            Vite dev proxy.
          </p>
        </div>
      </details>
      </>
      )}
    </Modal>
  );
}
