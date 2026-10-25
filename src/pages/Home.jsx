import { useMemo, useState } from 'react';
import Navbar, { SearchPill } from '../components/Layout/Navbar.jsx';
import Hero from '../components/discover/Hero.jsx';
import LimitBanner from '../components/discover/LimitBanner.jsx';
import { ContinueRow, TileRow } from '../components/discover/Rows.jsx';
import CategoryTabs from '../components/CategoryTabs.jsx';
import CharacterGrid from '../components/CharacterGrid.jsx';
import { useCharacters } from '../lib/store.jsx';
import { CATEGORIES } from '../data/characters.js';

const TABS = ['All', ...CATEGORIES, 'Custom'];

function matches(c, q) {
  const hay = [c.name, c.tagline, c.description, c.creator, c.category, ...(c.tags || [])].join(' ').toLowerCase();
  return q
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((w) => hay.includes(w.replace(/^@/, '')));
}

export default function Home() {
  const characters = useCharacters();
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState('All');

  // Public characters appear everywhere; unlisted/private ones only in Custom and search.
  const listed = useMemo(() => characters.filter((c) => !c.custom || c.visibility === 'public'), [characters]);


  const visible = useMemo(() => {
    const q = query.trim();
    if (q) return characters.filter((c) => matches(c, q));
    if (tab === 'All') return [...listed].sort((a, b) => b.interactions - a.interactions);
    if (tab === 'Custom') return characters.filter((c) => c.custom);
    return listed.filter((c) => c.category === tab).sort((a, b) => b.interactions - a.interactions);
  }, [characters, listed, tab, query]);

  const featured = useMemo(() => listed.filter((c) => c.featured).slice(0, 6), [listed]);
  const trending = useMemo(() => [...listed].sort((a, b) => b.interactions - a.interactions).slice(0, 12), [listed]);

  const q = query.trim();

  return (
    <div className="page">
      <Navbar query={query} onQuery={setQuery} />

      <div className="page-scroll">
        <div className="discover">
          <div className="mobile-search">
            <SearchPill query={query} onQuery={setQuery} id="discover-search-mobile" />
          </div>

          {q ? (
            <div className="results-head">
              <h1>
                {visible.length} {visible.length === 1 ? 'result' : 'results'} for “{q}”
              </h1>
            </div>
          ) : (
            <>
              <LimitBanner />
              <Hero characters={featured} />
              <ContinueRow />
              <TileRow title="Trending" characters={trending} />
              <div className="browse-head">
                <h2 className="section-title">Discover</h2>
              </div>
              <CategoryTabs tabs={TABS} active={tab} onChange={setTab} />
            </>
          )}

          <CharacterGrid characters={visible} query={q} tab={tab} />
        </div>
      </div>
    </div>
  );
}
