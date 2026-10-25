import { useMemo, useState } from 'react';
import { ChevronsLeft, Cloud, Compass, Megaphone, MessageCircle, MessageSquareDashed, MoreHorizontal, Plus, Search, Settings, Trash2, UserRound, X } from '../icons.jsx';
import { assistantCharacter, isAssistantId } from '../../lib/assistant.js';
import { CLOUD_ENABLED, useSession } from '../../lib/cloud.js';
import { useSyncStatus } from '../../lib/sync.js';
import { useSocial, badgeText } from '../../lib/social.js';
import Avatar from '../Avatar.jsx';
import PersonaPicker from '../Chat/PersonaPicker.jsx';
import { useUI, usePopover, ConfirmDialog } from '../ui.jsx';
import { useStore, useCharacters, useProvider } from '../../lib/store.jsx';

function RowMenu({ character, onDelete }) {
  const ui = useUI();
  const pop = usePopover();
  return (
    <div className="pop-anchor" ref={pop.ref}>
      <button
        type="button"
        className="icon-btn sm recent-more"
        onClick={(e) => {
          e.stopPropagation();
          pop.toggle();
        }}
        aria-label={`Options for ${character.name}`}
        aria-expanded={pop.open}
      >
        <MoreHorizontal size={16} />
      </button>
      {pop.open && (
        <div className="popover menu" role="menu">
          {character.kind !== 'assistant' && (
            <button
              type="button"
              role="menuitem"
              className="menu-item"
              onClick={() => {
                pop.setOpen(false);
                ui.openProfile(character.id);
              }}
            >
              <UserRound size={16} /> View profile
            </button>
          )}
          <button
            type="button"
            role="menuitem"
            className="menu-item danger"
            onClick={() => {
              pop.setOpen(false);
              onDelete();
            }}
          >
            <Trash2 size={16} /> Delete chat
          </button>
        </div>
      )}
    </div>
  );
}

const DAY = 864e5;

export default function Sidebar({ open, onClose, onCollapse, activeId, view }) {
  const { state, dispatch } = useStore();
  const characters = useCharacters();
  const ui = useUI();
  const status = useProvider();
  const session = useSession();
  const sync = useSyncStatus();
  const { unread } = useSocial();
  const [q, setQ] = useState('');
  const [confirm, setConfirm] = useState(null);

  // Chats grouped like c.ai: Today / Yesterday / This Week / Last Week / Older
  const groups = useMemo(() => {
    const term = q.trim().toLowerCase();
    const rows = Object.entries(state.chats)
      .map(([id, chat]) =>
        isAssistantId(id)
          ? { chat, character: assistantCharacter(id, chat), label: chat.title || 'New chat', skip: !chat.messages.length }
          : { chat, character: characters.find((c) => c.id === chat.characterId) },
      )
      .map((r) => ({ ...r, label: r.label || r.character?.name }))
      .filter((r) => r.character && !r.skip && (!term || r.label.toLowerCase().includes(term)))
      .sort((a, b) => b.chat.updatedAt - a.chat.updatedAt);
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const today = start.getTime();
    const buckets = [
      ['Today', today],
      ['Yesterday', today - DAY],
      ['This Week', today - 6 * DAY],
      ['Last Week', today - 13 * DAY],
      ['Older', -Infinity],
    ].map(([label, from]) => ({ label, from, rows: [] }));
    for (const r of rows) buckets.find((b) => r.chat.updatedAt >= b.from).rows.push(r);
    return buckets.filter((b) => b.rows.length);
  }, [state.chats, characters, q]);

  const hasChats = Object.keys(state.chats).length > 0;

  return (
    <>
      <div className={`drawer-scrim ${open ? 'open' : ''}`} onClick={onClose} aria-hidden="true" />
      <aside className={`sidebar ${open ? 'open' : ''}`} aria-label="Navigation">
        <div className="sidebar-top">
          <button type="button" className="brand" onClick={ui.goHome}>
            <span className="logo-mark" aria-hidden="true" />
            <span>charcoal</span>
          </button>
          <button type="button" className="icon-btn sidebar-collapse" onClick={onCollapse} aria-label="Collapse sidebar" title="Collapse">
            <ChevronsLeft size={20} />
          </button>
          <button type="button" className="icon-btn sidebar-close" onClick={onClose} aria-label="Close menu">
            <X size={20} />
          </button>
        </div>

        <div className="sidebar-actions">
          <button type="button" className="create-pill" onClick={() => ui.openCreator()}>
            <Plus size={20} /> Create
          </button>
          <button
            type="button"
            className={`create-pill chat-pill ${isAssistantId(activeId) ? 'active' : ''}`}
            onClick={() => ui.openAssistant()}
            title="Charcoal Chat: chat with DeepSeek, search the web, read your chats"
          >
            <MessageCircle size={19} /> Chat
          </button>
        </div>

        <nav className="sidebar-nav">
          <button type="button" className={`nav-item ${view === 'home' ? 'active' : ''}`} onClick={ui.goHome}>
            <span className="nav-icon">
              <Compass size={15} />
            </span>
            Discover
          </button>
          <button type="button" className="nav-item" onClick={ui.openSettings}>
            <span className="nav-icon plain">
              <Settings size={17} />
            </span>
            Settings
            <span className={`status-dot ${status.mode}`} style={{ marginLeft: 'auto' }} title={`${status.label} · ${status.detail}`} />
          </button>
          {CLOUD_ENABLED && (
            <button type="button" className="nav-item" onClick={ui.openNotifications} aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'}>
              <span className="nav-icon plain notif-nav-icon">
                <Megaphone size={17} />
                {unread > 0 && <span className="notif-badge">{badgeText(unread)}</span>}
              </span>
              Notifications
            </button>
          )}
          {CLOUD_ENABLED && (
            <button type="button" className="nav-item" onClick={ui.openAccount}>
              <span className="nav-icon plain">
                <Cloud size={17} />
              </span>
              <span className="nav-label-trunc">{session ? `@${session.username}` : 'Sign in'}</span>
              {session && (
                <span
                  className={`status-dot ${sync.phase === 'ok' ? 'live' : sync.phase === 'error' || sync.phase === 'offline' ? 'error' : 'unverified'}`}
                  style={{ marginLeft: 'auto' }}
                  title={sync.phase === 'error' ? sync.error : `Sync: ${sync.phase}`}
                />
              )}
            </button>
          )}
        </nav>

        <label className="sidebar-search">
          <Search size={17} />
          <input id="sidebar-search" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" autoComplete="off" />
        </label>

        <div className="sidebar-section">
          {!hasChats ? (
            <div className="sidebar-empty">
              <MessageSquareDashed size={18} />
              <p>No chats yet. Pick someone on Discover and say hi.</p>
            </div>
          ) : groups.length === 0 ? (
            <p className="sidebar-none">No chats match “{q}”.</p>
          ) : (
            <div className="recent-groups">
              {groups.map((g) => (
                <div key={g.label} className="recent-group">
                  <div className="recent-label">{g.label}</div>
                  <ul className="recent-list">
                    {g.rows.map(({ chat, character, label }) => (
                      <li key={chat.characterId} className={`recent-row ${activeId === character.id ? 'active' : ''}`}>
                        <button
                          type="button"
                          className="recent"
                          onClick={() => (character.kind === 'assistant' ? ui.openAssistant(character.id) : ui.openChat(character))}
                        >
                          <Avatar avatar={character.avatar} name={character.name} size={38} round />
                          <span className="recent-name">{label}</span>
                        </button>
                        <RowMenu
                          character={character}
                          onDelete={() =>
                            setConfirm({
                              title: character.kind === 'assistant' ? `Delete “${label}”?` : `Delete your chat with ${character.name}?`,
                              body: 'All messages, swipes and images in this chat are removed from this browser.',
                              run: () => {
                                dispatch({ type: 'chat/delete', charId: character.id });
                                if (activeId === character.id) ui.goHome();
                              },
                            })
                          }
                        />
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </div>

        <nav className="legal-links" aria-label="Legal">
          <button type="button" onClick={() => ui.openLegal('terms')}>
            Terms
          </button>
          <button type="button" onClick={() => ui.openLegal('privacy')}>
            Privacy
          </button>
        </nav>
        <div className="sidebar-foot">
          <PersonaPicker variant="row" />
        </div>
      </aside>
      <ConfirmDialog
        open={!!confirm}
        title={confirm?.title}
        body={confirm?.body}
        confirmLabel="Delete chat"
        onConfirm={confirm?.run}
        onClose={() => setConfirm(null)}
      />
    </>
  );
}
