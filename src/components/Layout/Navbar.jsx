import { useEffect, useRef } from 'react';
import { Menu, Plus, Search, Settings, X } from 'lucide-react';
import { MenuDot } from '../NotificationsPanel.jsx';
import { useUI } from '../ui.jsx';
import { FuelGauge } from '../Fuel.jsx';
import { useActivePersona, useProvider } from '../../lib/store.jsx';

export function SearchPill({ query, onQuery, id = 'discover-search', hotkey = false }) {
  const inputRef = useRef(null);
  useEffect(() => {
    if (!hotkey) return undefined;
    const onKey = (e) => {
      if (e.key === '/' && !/input|textarea|select/i.test(document.activeElement?.tagName || '')) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [hotkey]);
  return (
    <label className="search">
      <Search size={16} />
      <input
        ref={inputRef}
        id={id}
        type="search"
        value={query}
        onChange={(e) => onQuery(e.target.value)}
        placeholder="Search"
        autoComplete="off"
      />
      {query && (
        <button type="button" className="search-clear" onClick={() => onQuery('')} aria-label="Clear search">
          <X size={14} />
        </button>
      )}
    </label>
  );
}

/** Discover top bar: welcome on the left; search, fuel, settings and Create on the right. */
export default function Navbar({ query, onQuery }) {
  const ui = useUI();
  const persona = useActivePersona();
  const status = useProvider();

  return (
    <header className="topbar">
      <button type="button" className="icon-btn nav-menu" onClick={ui.openDrawer} aria-label="Open menu">
        <Menu size={22} />
        <MenuDot />
      </button>
      <div className="welcome">
        <span className="welcome-sub">Welcome back,</span>
        <span className="welcome-name">
          <span className="persona-dot">{persona.name.slice(0, 1).toUpperCase()}</span>
          {persona.name}
        </span>
      </div>
      <div className="topbar-right">
        <div className="topbar-search">
          <SearchPill query={query} onQuery={onQuery} hotkey />
        </div>
        <FuelGauge />
        <button
          type="button"
          className={`circle-btn provider-btn ${status.mode}`}
          onClick={ui.openSettings}
          aria-label={`Settings. ${status.label}: ${status.detail}`}
          title={`${status.label} · ${status.detail}`}
        >
          <Settings size={17} />
          <span className={`status-dot ${status.mode}`} />
        </button>
        <button type="button" className="btn btn-primary nav-create" onClick={() => ui.openCreator()}>
          <Plus size={16} />
          <span>Create</span>
        </button>
      </div>
    </header>
  );
}
