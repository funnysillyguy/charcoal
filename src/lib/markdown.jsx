// Small, safe markdown renderer for chat messages (no innerHTML).
// Supports: ```code fences``` (with copy), `inline code`, **bold**, *roleplay actions*, _italics_,
// "- " / "1. " lists, "> " quotes, and paragraphs. While streaming, an unclosed *action or
// code fence renders as if closed, so text doesn't flicker between styles.
import { useContext, useState } from 'react';
import { Check, Copy } from '../components/icons.jsx';
import CanvasCard from '../components/Canvas/CanvasCard.jsx';
import RunBlock from '../components/Canvas/RunBlock.jsx';
import { BlockContext, kindOf } from './canvas.js';

const INLINE =
  /(`[^`\n]+`)|(\*\*\*[^*\n]+?\*\*\*)|(\*\*[^*\n]+?\*\*)|(\*[^*\n]+?\*)|(\b_[^_\n]+?_\b)|\[([^\]\n]+)\]\((https?:\/\/[^)\s]+)\)|(https?:\/\/[^\s<>()"']+[^\s<>()"'.,;:!?])/g;

function renderInline(text, keyBase, streaming) {
  const out = [];
  let last = 0;
  let m;
  let i = 0;
  // Fresh regex per call: bold recurses into renderInline, and a shared /g regex would have its
  // lastIndex reset by the inner call, making the outer loop re-match the same token forever.
  const re = new RegExp(INLINE.source, 'g');
  while ((m = re.exec(text))) {
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
    else if (m[6])
      out.push(
        <a key={key} href={m[7]} target="_blank" rel="noreferrer noopener" className="md-link">
          {m[6]}
        </a>,
      );
    else if (m[8])
      out.push(
        <a key={key} href={m[8]} target="_blank" rel="noreferrer noopener" className="md-link">
          {m[8].replace(/^https?:\/\/(www\.)?/, '').slice(0, 60)}
        </a>,
      );
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

const splitCells = (line) =>
  line
    .trim()
    .replace(/^\||\|$/g, '')
    .split('|')
    .map((c) => c.trim());

function renderTextBlocks(text, keyBase, streaming) {
  const blocks = [];
  // Headings and rules stand on their own, even without blank lines around them.
  const paragraphs = text.replace(/^(#{1,4} .+|-{3,}|\*{3,})$/gm, '\n\n$1\n\n').split(/\n{2,}/);
  paragraphs.forEach((para, pi) => {
    if (!para.trim()) return;
    const lines = para.split('\n');
    const key = `${keyBase}-p${pi}`;
    const isLast = pi === paragraphs.length - 1;
    const h = lines.length === 1 && /^(#{1,4}) (.+)$/.exec(lines[0]);
    if (h) {
      const Tag = `h${Math.min(4, h[1].length + 1)}`;
      blocks.push(
        <Tag key={key} className="md-h">
          {renderInline(h[2].replace(/\s*#+$/, ''), key, false)}
        </Tag>,
      );
      return;
    }
    if (lines.length === 1 && /^(-{3,}|\*{3,})$/.test(lines[0].trim())) {
      blocks.push(<hr key={key} className="md-hr" />);
      return;
    }
    if (lines.length >= 2 && lines.every((l) => /^\s*\|.*\|\s*$/.test(l)) && /^\s*\|[\s:|-]+\|\s*$/.test(lines[1])) {
      const head = splitCells(lines[0]);
      const rows = lines.slice(2).map(splitCells);
      blocks.push(
        <div key={key} className="md-table-wrap">
          <table className="md-table">
            <thead>
              <tr>
                {head.map((c, ci) => (
                  <th key={ci}>{renderInline(c, `${key}-h${ci}`, false)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, ri) => (
                <tr key={ri}>
                  {head.map((_, ci) => (
                    <td key={ci}>{renderInline(r[ci] || '', `${key}-${ri}-${ci}`, false)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      return;
    }
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
  const canvas = useContext(BlockContext); // set for character replies when Canvas is on
  const segments = String(text || '').split('```');
  const out = [];
  segments.forEach((seg, i) => {
    const isCode = i % 2 === 1;
    const isLast = i === segments.length - 1;
    if (isCode) {
      const nl = seg.indexOf('\n');
      const lang = nl === -1 ? '' : seg.slice(0, nl).trim();
      const code = (nl === -1 ? '' : seg.slice(nl + 1)).replace(/\n$/, '');
      const closed = !isLast;
      const kind = canvas ? kindOf(lang.split(/\s+/)[0], code) : null;
      if (kind === 'web') out.push(<CanvasCard key={`c${i}`} index={(i - 1) / 2} code={code} closed={closed} />);
      else if (kind === 'run') out.push(<RunBlock key={`c${i}`} lang={lang.split(/\s+/)[0]} code={code} closed={closed} />);
      else out.push(<CodeBlock key={`c${i}`} lang={lang} code={code} />);
    } else if (seg.trim()) {
      out.push(...renderTextBlocks(seg.replace(/^\n+|\n+$/g, ''), `t${i}`, streaming && isLast));
    }
  });
  return <div className="md">{out}</div>;
}
