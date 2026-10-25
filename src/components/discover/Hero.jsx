// Featured spotlight: one big character at a time, with their opening line. Rotates slowly.
import { useEffect, useState } from 'react';
import { Info, MessageCircle } from '../icons.jsx';
import CoverArt from './CoverArt.jsx';
import { useUI } from '../ui.jsx';
import { useActivePersona } from '../../lib/store.jsx';
import { chatsLabel, useCountsReady } from '../../lib/counts.js';

const ROTATE_MS = 8000;

export function snippet(text, { char, user }, max = 190) {
  const t = String(text || '')
    .replace(/\{\{char\}\}/gi, char)
    .replace(/\{\{user\}\}/gi, user)
    .replace(/\*+|_+/g, '')
    .replace(/\(\([^)]*\)\)/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return t.length > max ? `${t.slice(0, max).replace(/\s+\S*$/, '')}…` : t;
}

export default function Hero({ characters }) {
  const countsReady = useCountsReady();
  const ui = useUI();
  const persona = useActivePersona();
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  const n = characters.length;

  useEffect(() => {
    if (paused || n < 2) return undefined;
    const t = setTimeout(() => setI((x) => (x + 1) % n), ROTATE_MS);
    return () => clearTimeout(t);
  }, [i, paused, n]);

  if (!n) return null;
  const c = characters[i % n];
  const [, light] = c.avatar?.palette || ['#2a2a2e', '#9a9aa6'];
  const line = snippet(c.greetings?.[0], { char: c.name, user: persona.name });

  return (
    <section
      className="hero"
      style={{ '--hero-light': light }}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      aria-roledescription="carousel"
      aria-label="Featured characters"
    >
      <div className="hero-bg" key={`bg-${c.id}`}>
        <CoverArt character={c} />
      </div>
      <div className="hero-inner" key={c.id}>
        <button type="button" className="hero-art" onClick={() => ui.openChat(c)} aria-label={`Chat with ${c.name}`}>
          <CoverArt character={c} />
        </button>
        <div className="hero-text">
          <span className="hero-eyebrow">Featured</span>
          <h1 className="hero-name">{c.name}</h1>
          <p className="hero-meta">
            @{c.creator} · {countsReady ? <><MessageCircle size={13} /> {chatsLabel(c.interactions)}</> : <span className="skel" style={{ display: 'inline-block', width: 56, height: 12 }} />}
          </p>
          {line && <p className="hero-line">“{line}”</p>}
          <div className="hero-actions">
            <button type="button" className="btn btn-primary" onClick={() => ui.openChat(c)}>
              <MessageCircle size={16} /> Chat
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => ui.openProfile(c.id)}>
              <Info size={16} /> About
            </button>
          </div>
        </div>
      </div>
      {n > 1 && (
        <div className="hero-dots" role="tablist">
          {characters.map((x, j) => (
            <button
              key={x.id}
              type="button"
              role="tab"
              aria-selected={j === i % n}
              aria-label={x.name}
              className={j === i % n ? 'on' : ''}
              onClick={() => setI(j)}
            >
              {j === i % n && !paused && <span style={{ animationDuration: `${ROTATE_MS}ms` }} />}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
