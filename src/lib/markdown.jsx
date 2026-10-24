// Small, safe markdown renderer for chat messages (no innerHTML).
// Supports: ```code fences``` (with copy), `inline code`, **bold**, *roleplay actions*, _italics_,
// "- " / "1. " lists, "> " quotes, and paragraphs. While streaming, an unclosed *action or
// code fence renders as if closed, so text doesn't flicker between styles.
import { useState } from 'react';
import { Check, Copy } from 'lucide-react';

const INLINE = /(`[^`\n]+`)|(\*\*\*[^*\n]+?\*\*\*)|(\*\*[^*\n]+?\*\*)|(\*[^*\n]+?\*)|(\b_[^_\n]+?_\b)/g;

function renderInline(text, keyBase, streaming) {
  const out = [];
  let last = 0;
  let m;
  let i = 0;
  INLINE.lastIndex = 0;
  while ((m = INLINE.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const tok = m[0];
    const key = `${keyBase}-${i++}`;
    if (m[1]) out.push(<code key={key} className="md-inline-code">{tok.slice(1, -1)}</code>);
    else if (m[2])
      out.push(
        <strong key={key} className="md-strong-action">
          <em>{tok.slice(3, -3)}</em>
        </strong>,
      );
    else if (m[3]) out.push(<strong key={key}>{renderInline(tok.slice(2, -2), key, false)}</strong>);
    else if (m[4]) out.push(<em key={key} className="md-action">{tok.slice(1, -1)}</em>);
    else if (m[5]) out.push(<em key={key}>{tok.slice(1, -1)}</em>);
    last = m.index + tok.length;
  }
  let rest = text.slice(last);
  if (streaming) {
    // An action still being typed: "*walks toward the win" -> italic already.
    const open = rest.lastIndexOf('*');
    if (open !== -1 && rest[open + 1] && rest[open + 1] !== '*' && rest[open + 1] !== ' ') {
      if (open > 0) out.push(rest.slice(0, open));
      out.push(<em key={`${keyBase}-open`} className="md-action">{rest.slice(open + 1)}</em>);
      rest = '';
    }
  }
  if (rest) out.push(rest);
  return out;
}

function CodeBlock({ lang, code }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      /* clipboard refused; user can select manually */
    }
  };
  return (
    <div className="md-code">
      <div className="md-code-bar">
        <span>{lang || 'code'}</span>
        <button type="button" onClick={copy} aria-label="Copy code">
          {copied ? <Check size={13} /> : <Copy size={13} />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre>
        <code>{code}</code>
      </pre>
    </div>
  );
}

function renderTextBlocks(text, keyBase, streaming) {
  const blocks = [];
  const paragraphs = text.split(/\n{2,}/);
  paragraphs.forEach((para, pi) => {
    if (!para.trim()) return;
    const lines = para.split('\n');
    const key = `${keyBase}-p${pi}`;
    const isLast = pi === paragraphs.length - 1;
    if (lines.every((l) => /^\s*[-*•]\s+/.test(l))) {
      blocks.push(
        <ul key={key}>
          {lines.map((l, li) => (
            <li key={li}>{renderInline(l.replace(/^\s*[-*•]\s+/, ''), `${key}-${li}`, streaming && isLast)}</li>
          ))}
        </ul>,
      );
    } else if (lines.every((l) => /^\s*\d+[.)]\s+/.test(l))) {
      blocks.push(
        <ol key={key}>
          {lines.map((l, li) => (
            <li key={li}>{renderInline(l.replace(/^\s*\d+[.)]\s+/, ''), `${key}-${li}`, streaming && isLast)}</li>
          ))}
        </ol>,
      );
    } else if (lines.every((l) => /^\s*>/.test(l))) {
      blocks.push(
        <blockquote key={key}>
          {renderInline(lines.map((l) => l.replace(/^\s*>\s?/, '')).join('\n'), key, streaming && isLast)}
        </blockquote>,
      );
    } else {
      blocks.push(
        <p key={key}>
          {lines.map((l, li) => (
            <span key={li}>
              {li > 0 && <br />}
              {renderInline(l, `${key}-${li}`, streaming && isLast && li === lines.length - 1)}
            </span>
          ))}
        </p>,
      );
    }
  });
  return blocks;
}

export function Markdown({ text, streaming = false }) {
  const segments = String(text || '').split('```');
  const out = [];
  segments.forEach((seg, i) => {
    const isCode = i % 2 === 1;
    const isLast = i === segments.length - 1;
    if (isCode) {
      const nl = seg.indexOf('\n');
      const lang = nl === -1 ? '' : seg.slice(0, nl).trim();
      const code = nl === -1 ? seg : seg.slice(nl + 1);
      out.push(<CodeBlock key={`c${i}`} lang={lang} code={code.replace(/\n$/, '')} />);
    } else if (seg.trim()) {
      out.push(...renderTextBlocks(seg.replace(/^\n+|\n+$/g, ''), `t${i}`, streaming && isLast));
    }
  });
  return <div className="md">{out}</div>;
}
