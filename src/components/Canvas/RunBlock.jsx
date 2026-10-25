// A python / javascript block with a Run button. The code runs in an isolated frame (see canvas.js);
// the output can be sent to the character so they can talk about the result.
import { useContext, useEffect, useRef, useState } from 'react';
import { Check, Copy, Loader, Play, Send, Square } from '../icons.jsx';
import { BlockContext, canSendToChat, lastResult, runCode, runLang, sendToChat } from '../../lib/canvas.js';
import { chatFiles } from '../../lib/files.js';
import { useStore } from '../../lib/store.jsx';
import { highlight } from '../../lib/highlight.js';

export default function RunBlock({ lang, code, closed }) {
  const kind = runLang(lang);
  const [res, setRes] = useState(() => lastResult(kind, code));
  const [running, setRunning] = useState(false);
  const [copied, setCopied] = useState(false);
  const [sent, setSent] = useState(false);
  const job = useRef(null);
  const ctx = useContext(BlockContext);
  const { getState } = useStore();
  useEffect(() => () => job.current?.stop(), []);

  const run = async () => {
    setSent(false);
    setRunning(true);
    // Files attached anywhere in this chat are readable by the code (Python: data/<name>, JS: files[name]).
    const files = ctx ? await chatFiles(getState().chats[ctx.charId]) : [];
    job.current = runCode({
      lang: kind,
      code,
      files,
      onUpdate: (r) => {
        setRes(r);
        if (r.done) setRunning(false);
      },
    });
  };
  const stop = () => job.current?.stop();
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      /* clipboard blocked */
    }
  };
  const share = async () => {
    const body = [res?.out?.trim(), res?.error ? `Error: ${res.error}` : ''].filter(Boolean).join('\n').slice(0, 3000);
    const note = res?.images?.length ? `\n(${res.images.length} chart${res.images.length > 1 ? 's were' : ' was'} drawn too.)` : '';
    const ok = await sendToChat(`Here is the output when I ran your ${kind === 'python' ? 'Python' : 'JavaScript'}:\n\`\`\`\n${body || '(no output)'}\n\`\`\`${note}`);
    if (ok !== false) setSent(true);
  };

  const label = kind === 'python' ? 'python' : 'javascript';
  const html = highlight(code, kind === 'python' ? 'python' : 'js');
  return (
    <div className="md-code run-block">
      <div className="md-code-bar">
        <span>{label}</span>
        <span className="run-actions">
          <button type="button" onClick={copy} aria-label="Copy code">
            {copied ? <Check size={13} /> : <Copy size={13} />}
            {copied ? 'Copied' : 'Copy'}
          </button>
          {running ? (
            <button type="button" className="run-btn stop" onClick={stop}>
              <Square size={12} fill="currentColor" /> Stop
            </button>
          ) : (
            <button type="button" className="run-btn" onClick={run} disabled={!closed || !code.trim()} title={closed ? 'Run in a sandbox' : 'Wait for the code to finish'}>
              <Play size={12} fill="currentColor" /> Run
            </button>
          )}
        </span>
      </div>
      <pre>
        <code dangerouslySetInnerHTML={{ __html: html }} />
      </pre>
      {(running || res) && (
        <div className="run-out" role="status" aria-live="polite">
          <div className="run-out-head">
            {running ? (
              <>
                <Loader size={13} className="spin" /> {res?.status || 'Running…'}
              </>
            ) : (
              <>Output</>
            )}
          </div>
          {res?.out ? <pre className="run-text">{res.out}</pre> : !running && !res?.error && !res?.images?.length ? <pre className="run-text dim">(no output)</pre> : null}
          {res?.truncated && <p className="run-note">Output was cut at 20,000 characters.</p>}
          {res?.images?.map((src, i) => (
            <img key={i} className="run-img" src={src} alt={`Chart ${i + 1}`} />
          ))}
          {res?.error && <pre className="run-text err">{res.error}</pre>}
          {!running && res && (
            <div className="run-share">
              {canSendToChat() && (
                <button type="button" className="btn btn-ghost btn-sm" onClick={share} disabled={sent}>
                  <Send size={13} /> {sent ? 'Sent' : 'Send result to the chat'}
                </button>
              )}
              <span className="run-safe">Ran in an isolated sandbox with no access to your data.</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
