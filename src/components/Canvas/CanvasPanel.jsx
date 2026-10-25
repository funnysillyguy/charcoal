// Charcoal Canvas: the side panel where a character's web page is written live, with the code on one
// side (colored as it types) and the running page on the other, in an isolated sandbox.
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  Code2,
  Copy,
  Download,
  Eye,
  Maximize2,
  Minimize2,
  Monitor,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  SquareSplitHorizontal,
  X,
} from '../icons.jsx';
import SandboxFrame from './SandboxFrame.jsx';
import { useStore } from '../../lib/store.jsx';
import { closeCanvas, kindOf, lineCount, pageTitle, parseFences, setCanvas, useCanvas } from '../../lib/canvas.js';
import { highlight } from '../../lib/highlight.js';

function useThrottled(value, ms) {
  const [v, setV] = useState(value);
  const latest = useRef(value);
  const timer = useRef(0);
  latest.current = value;
  useEffect(() => {
    if (timer.current) return undefined;
    timer.current = setTimeout(() => {
      timer.current = 0;
      setV(latest.current);
    }, ms);
    return undefined;
  }, [value, ms]);
  useEffect(() => () => clearTimeout(timer.current), []);
  return v;
}

function CodePane({ code, lang, following }) {
  const scroller = useRef(null);
  const stick = useRef(true);
  const shown = useThrottled(code, 90);
  const html = useMemo(() => highlight(shown, lang), [shown, lang]);
  const lines = useMemo(() => {
    const n = Math.max(1, lineCount(shown));
    let s = '';
    for (let i = 1; i <= n; i++) s += `${i}\n`;
    return s;
  }, [shown]);

  useEffect(() => {
    const el = scroller.current;
    if (el && following && stick.current) el.scrollTop = el.scrollHeight;
  }, [html, following]);

  return (
    <div
      className="cv-code"
      ref={scroller}
      onScroll={(e) => {
        const el = e.currentTarget;
        stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
      }}
    >
      <pre className="cv-gutter" aria-hidden="true">
        {lines}
      </pre>
      <pre className="cv-src">
        <code dangerouslySetInnerHTML={{ __html: html + (following ? '<span class="cv-caret"></span>' : '\n') }} />
      </pre>
    </div>
  );
}

export default function CanvasPanel() {
  const cv = useCanvas();
  const { state } = useStore();
  const [reload, setReload] = useState(0);
  const [copied, setCopied] = useState(false);
  const ref = cv.ref;

  const variant = useMemo(() => {
    if (!ref) return null;
    const msg = state.chats[ref.charId]?.messages.find((m) => m.id === ref.messageId);
    return msg?.variants.find((v) => v.id === ref.variantId) || null;
  }, [state.chats, ref]);

  const block = useMemo(() => {
    const b = parseFences(variant?.text || '')[ref?.index ?? 0];
    return b && kindOf(b.lang, b.code) === 'web' ? b : null;
  }, [variant?.text, ref?.index]);

  // Close when the thing being shown is gone (message deleted, chat reset).
  useEffect(() => {
    if (cv.open && ref && !variant) closeCanvas();
  }, [cv.open, ref, variant]);

  // Escape closes full screen first, then the panel.
  useEffect(() => {
    if (!cv.open) return undefined;
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      if (cv.full) setCanvas({ full: false });
      else closeCanvas();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [cv.open, cv.full]);

  if (!cv.open) return null;

  const writing = !!block && !block.closed && (variant?.status === 'streaming' || variant?.status === 'pending');
  const code = block?.code || '';
  const lang = block?.lang === 'svg' ? 'html' : block?.lang || 'html';

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      /* clipboard blocked */
    }
  };
  const download = () => {
    const url = URL.createObjectURL(new Blob([code], { type: 'text/html' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `${pageTitle(code).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'page'}.html`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };

  const view = cv.view;
  return (
    <aside className={`cv ${cv.full ? 'full' : ''} v-${view}`} aria-label="Charcoal Canvas">
      <header className="cv-head">
        <div className="cv-title">
          <span className="cv-brand">Canvas</span>
          <strong>{block ? pageTitle(code) : 'Nothing here'}</strong>
          {block && (
            <span className={`cv-status ${writing ? 'live' : ''}`}>
              {writing ? `Writing · ${lineCount(code)} lines` : `${lineCount(code)} lines`}
            </span>
          )}
        </div>
        <div className="cv-tabs" role="tablist" aria-label="View">
          {[
            ['code', 'Code', Code2],
            ['split', 'Both', SquareSplitHorizontal],
            ['preview', 'Preview', Eye],
          ].map(([id, label, Icon]) => (
            <button key={id} type="button" role="tab" aria-selected={view === id} className={`cv-tab t-${id} ${view === id ? 'active' : ''}`} onClick={() => setCanvas({ view: id })}>
              <Icon size={14} /> <span>{label}</span>
            </button>
          ))}
        </div>
        <div className="cv-tools">
          <button type="button" className={`icon-btn sm cv-dev ${cv.device === 'phone' ? 'on' : ''}`} onClick={() => setCanvas({ device: cv.device === 'phone' ? 'desktop' : 'phone' })} aria-label={cv.device === 'phone' ? 'Desktop width' : 'Phone width'} title={cv.device === 'phone' ? 'Desktop width' : 'Phone width'}>
            {cv.device === 'phone' ? <Smartphone size={15} /> : <Monitor size={15} />}
          </button>
          <button type="button" className="icon-btn sm" onClick={() => setReload((n) => n + 1)} aria-label="Reload preview" title="Reload preview" disabled={!block}>
            <RefreshCw size={15} />
          </button>
          <button type="button" className="icon-btn sm" onClick={copy} aria-label="Copy code" title="Copy code" disabled={!block}>
            {copied ? <Check size={15} /> : <Copy size={15} />}
          </button>
          <button type="button" className="icon-btn sm" onClick={download} aria-label="Download .html" title="Download .html" disabled={!block}>
            <Download size={15} />
          </button>
          <button type="button" className="icon-btn sm cv-fs" onClick={() => setCanvas({ full: !cv.full })} aria-label={cv.full ? 'Exit full screen' : 'Full screen'} title={cv.full ? 'Exit full screen' : 'Full screen'}>
            {cv.full ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
          </button>
          <button type="button" className="icon-btn sm" onClick={closeCanvas} aria-label="Close canvas" title="Close">
            <X size={16} />
          </button>
        </div>
      </header>

      {block ? (
        <div className="cv-body">
          <section className="cv-pane cv-pane-code" aria-label="Code">
            <CodePane code={code} lang={lang} following={writing} />
          </section>
          <section className="cv-pane cv-pane-view" aria-label="Preview">
            <div className={`cv-stage ${cv.device === 'phone' ? 'phone' : ''}`}>
              <SandboxFrame code={code} streaming={writing} reloadKey={reload} title={pageTitle(code)} />
            </div>
            {writing && <div className="cv-building">Building…</div>}
          </section>
        </div>
      ) : (
        <div className="cv-empty">This code is no longer in the chat.</div>
      )}

      <footer className="cv-foot">
        <ShieldCheck size={13} />
        Runs in an isolated sandbox: no internet, no storage, no access to Charcoal or your account.
      </footer>
    </aside>
  );
}
