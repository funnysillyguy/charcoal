import { useMemo, useRef } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import Avatar from '../Avatar.jsx';
import CharacterTile from './CharacterTile.jsx';
import { snippet } from './Hero.jsx';
import { useUI } from '../ui.jsx';
import { useActivePersona, useCharacters, useStore } from '../../lib/store.jsx';

function RowShell({ title, children, label }) {
  const ref = useRef(null);
  const scroll = (dir) => ref.current?.scrollBy({ left: dir * Math.max(300, ref.current.clientWidth * 0.8), behavior: 'smooth' });
  return (
    <section className="row" aria-label={label || title}>
      <div className="section-head">
        <h2 className="section-title">{title}</h2>
        <div className="section-arrows">
          <button type="button" className="circle-btn sm" onClick={() => scroll(-1)} aria-label="Scroll left">
            <ChevronLeft size={16} />
          </button>
          <button type="button" className="circle-btn sm" onClick={() => scroll(1)} aria-label="Scroll right">
            <ChevronRight size={16} />
          </button>
        </div>
      </div>
      <div className="row-scroll" ref={ref}>
        {children}
      </div>
    </section>
  );
}

/** Horizontal row of tiles (Trending etc.). */
export function TileRow({ title, characters }) {
  if (!characters.length) return null;
  return (
    <RowShell title={title}>
      {characters.map((c, i) => (
        <CharacterTile key={c.id} character={c} style={{ '--i': i }} />
      ))}
    </RowShell>
  );
}

/** Your recent chats, newest first, with the last thing said. */
export function ContinueRow() {
  const ui = useUI();
  const { state } = useStore();
  const characters = useCharacters();
  const persona = useActivePersona();
  const items = useMemo(() => {
    const byId = new Map(characters.map((c) => [c.id, c]));
    return Object.entries(state.chats)
      .map(([id, chat]) => ({ c: byId.get(id), chat }))
      .filter((x) => x.c && x.chat.messages.length > 1)
      .sort((a, b) => b.chat.updatedAt - a.chat.updatedAt)
      .slice(0, 10);
  }, [state.chats, characters]);
  if (!items.length) return null;

  return (
    <RowShell title="Continue chatting">
      {items.map(({ c, chat }) => {
        const last = chat.messages[chat.messages.length - 1];
        const raw = last.role === 'user' ? `You: ${last.text}` : last.variants?.[last.active || 0]?.text;
        return (
          <button key={c.id} type="button" className="resume" onClick={() => ui.openChat(c)}>
            <Avatar avatar={c.avatar} name={c.name} size={48} round />
            <span className="resume-text">
              <span className="resume-name">{c.name}</span>
              <span className="resume-last">{snippet(raw, { char: c.name, user: persona.name }, 70)}</span>
            </span>
          </button>
        );
      })}
    </RowShell>
  );
}
