import { useRef } from 'react';
import { ChevronLeft, ChevronRight, MessageSquare } from 'lucide-react';
import Avatar from './Avatar.jsx';
import { useUI } from './ui.jsx';
import { formatCount } from '../lib/format.js';

/**
 * "For you": the trending/featured carousel. A horizontal, snap-scrolling row of large
 * cards (swipe on phones, arrow buttons on desktop).
 */
export default function FeaturedCarousel({ characters, title = 'For you' }) {
  const ui = useUI();
  const rowRef = useRef(null);
  if (!characters.length) return null;

  const scroll = (dir) => {
    const el = rowRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * Math.max(280, el.clientWidth * 0.8), behavior: 'smooth' });
  };

  return (
    <section className="foryou" aria-label={title} aria-roledescription="carousel">
      <div className="section-head">
        <h2 className="section-title">
          {title} <ChevronRight size={18} className="title-chevron" />
        </h2>
        <div className="section-arrows">
          <button type="button" className="circle-btn sm" onClick={() => scroll(-1)} aria-label="Scroll left">
            <ChevronLeft size={16} />
          </button>
          <button type="button" className="circle-btn sm" onClick={() => scroll(1)} aria-label="Scroll right">
            <ChevronRight size={16} />
          </button>
        </div>
      </div>
      <div className="foryou-row" ref={rowRef}>
        {characters.map((c) => (
          <article key={c.id} className="foryou-card">
            <button type="button" className="foryou-main" onClick={() => ui.openChat(c)}>
              <Avatar avatar={c.avatar} name={c.name} size={104} radius={18} />
              <span className="foryou-text">
                <span className="card-name">{c.name}</span>
                <span className="card-creator">By @{c.creator}</span>
                <span className="foryou-desc">{c.tagline}</span>
                <span className="card-stat">
                  <MessageSquare size={13} /> {formatCount(c.interactions)}
                </span>
              </span>
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}
