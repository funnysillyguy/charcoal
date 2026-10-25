// What a ```html block looks like inside the chat: a compact card that opens the Canvas.
import { useContext, useState } from 'react';
import { Check, Copy, PanelRightOpen, ShieldCheck } from '../icons.jsx';
import { BlockContext, lineCount, openCanvas, pageTitle, useCanvas } from '../../lib/canvas.js';

export default function CanvasCard({ index, code, closed }) {
  const ctx = useContext(BlockContext);
  const cv = useCanvas();
  const [copied, setCopied] = useState(false);
  const writing = !closed && ctx?.streaming;
  const here =
    cv.open && cv.ref && cv.ref.variantId === ctx?.variantId && cv.ref.index === index;
  const title = code ? pageTitle(code) : 'Web page';
  const open = () => ctx && openCanvas({ charId: ctx.charId, messageId: ctx.messageId, variantId: ctx.variantId, index });
  const copy = async (e) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      /* clipboard blocked */
    }
  };
  return (
    <div className={`cv-card ${writing ? 'live' : ''} ${here ? 'here' : ''}`}>
      <span className="cv-card-icon" aria-hidden="true">
        <ShieldCheck size={18} />
      </span>
      <button type="button" className="cv-card-main" onClick={open}>
        <strong>{title}</strong>
        <span>{writing ? `Writing… ${lineCount(code)} lines` : `Canvas · ${lineCount(code)} lines`}</span>
      </button>
      <button type="button" className="icon-btn sm" onClick={copy} aria-label="Copy code" title="Copy code">
        {copied ? <Check size={15} /> : <Copy size={15} />}
      </button>
      <button type="button" className="btn btn-ghost btn-sm" onClick={open} disabled={here}>
        <PanelRightOpen size={14} /> {here ? 'Open' : 'Open canvas'}
      </button>
    </div>
  );
}
