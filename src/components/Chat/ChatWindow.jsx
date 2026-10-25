import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ArrowDown, Download, Drama, Eraser, ImagePlus, KeyRound, Menu, MoreHorizontal, NotePencil, Paperclip, Trash2, UserRound, X } from '../icons.jsx';
import { isAssistantId } from '../../lib/assistant.js';
import { MenuDot } from '../NotificationsPanel.jsx';
import Avatar from '../Avatar.jsx';
import ChatMessage from './ChatMessage.jsx';
import ChatInput from './ChatInput.jsx';
import ExportModal from './ExportModal.jsx';
import { FuelGauge } from '../Fuel.jsx';
import { ConfirmDialog, EmptyState, usePopover, useUI } from '../ui.jsx';
import { useStore, useCharacter, useActivePersona } from '../../lib/store.jsx';
import { useChatEngine } from '../../lib/useChatEngine.js';
import { imageFilesFrom, deleteImages } from '../../lib/images.js';
import { firstName } from '../../lib/format.js';
import { registerSender } from '../../lib/canvas.js';
import { MOOD_PRESETS, SEED_CHARACTERS } from '../../data/characters.js';

function MoodPicker({ chat, character, onChange }) {
  const pop = usePopover();
  const [draft, setDraft] = useState('');
  const current = chat.mood || '';
  return (
    <div className="pop-anchor" ref={pop.ref}>
      <button
        type="button"
        className={`circle-btn ${current ? 'on' : ''}`}
        onClick={() => {
          setDraft(current);
          pop.toggle();
        }}
        aria-label="Set mood"
        title="Mood"
        aria-expanded={pop.open}
      >
        <Drama size={18} />
      </button>
      {pop.open && (
        <div className="popover mood-pop" role="dialog" aria-label="Mood">
          <div className="eyebrow pop-title">Mood for this chat</div>
          <p className="pop-help">Sent with every reply. Default: {character.mood || 'none set'}.</p>
          <div className="mood-chips">
            <button
              type="button"
              className={`chip chip-btn ${!current ? 'active' : ''}`}
              onClick={() => {
                onChange('');
                pop.setOpen(false);
              }}
            >
              Default
            </button>
            {MOOD_PRESETS.map((m) => (
              <button
                key={m}
                type="button"
                className={`chip chip-btn ${current === m ? 'active' : ''}`}
                onClick={() => {
                  onChange(m);
                  pop.setOpen(false);
                }}
              >
                {m}
              </button>
            ))}
          </div>
          <form
            className="mood-custom"
            onSubmit={(e) => {
              e.preventDefault();
              onChange(draft.trim().slice(0, 120));
              pop.setOpen(false);
            }}
          >
            <input
              id="mood-custom"
              className="input"
              value={draft}
              maxLength={120}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Or describe one: jealous but hiding it"
            />
            <button type="submit" className="btn btn-primary btn-sm">
              Set
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

/** Charcoal Chat's empty state: what it can do, as one-tap starters. */
function AssistantStart({ onPick }) {
  const { state } = useStore();
  const recent = Object.entries(state.chats)
    .filter(([id, c]) => !isAssistantId(id) && c.messages.some((m) => m.role === 'user'))
    .sort((a, b) => b[1].updatedAt - a[1].updatedAt)[0];
  const recentName = recent ? firstNameOf(recent[0], state) : null;
  const ideas = [
    recentName ? `What did ${recentName} and I talk about last time?` : 'What can you do with my roleplay chats?',
    'What’s in the news today?',
    'Build me a landing page for a tiny bakery',
    'Plot compound interest on $5,000 at 7% for 30 years',
  ];
  return (
    <div className="asst-start">
      <span className="logo-mark asst-start-mark" aria-hidden="true" />
      <h1>What’s on your mind?</h1>
      <p>Ask anything. It can look back through your chats when you ask, search the web, read files and write code you can watch run.</p>
      <div className="asst-ideas">
        {ideas.map((t) => (
          <button key={t} type="button" className="asst-idea" onClick={() => onPick(t)}>
            {t}
          </button>
        ))}
      </div>
    </div>
  );
}

function firstNameOf(id, state) {
  const c = SEED_CHARACTERS.find((x) => x.id === id) || state.customCharacters.find((x) => x.id === id);
  return c?.name?.split(' ')[0] || null;
}

function OptionsMenu({ items }) {
  const pop = usePopover();
  return (
    <div className="pop-anchor" ref={pop.ref}>
      <button type="button" className="circle-btn" onClick={pop.toggle} aria-label="Chat options" aria-expanded={pop.open}>
        <MoreHorizontal size={18} />
      </button>
      {pop.open && (
        <div className="popover menu" role="menu">
          {items.map((it, i) =>
            it === '-' ? (
              <div key={`sep${i}`} className="menu-sep" />
            ) : (
              <button
                key={it.label}
                type="button"
                role="menuitem"
                className={`menu-item ${it.danger ? 'danger' : ''}`}
                onClick={() => {
                  pop.setOpen(false);
                  it.onClick();
                }}
              >
                <it.icon size={16} />
                {it.label}
              </button>
            ),
          )}
        </div>
      )}
    </div>
  );
}

export default function ChatWindow({ characterId }) {
  const character = useCharacter(characterId);
  const { state, dispatch } = useStore();
  const chat = state.chats[characterId];
  const persona = useActivePersona();
  const ui = useUI();
  const engine = useChatEngine(character);

  // Lets a Run block hand its output to the character as your next message.
  useEffect(() => registerSender((text) => engine.send(text)), [engine.send]);

  const scrollRef = useRef(null);
  const inputRef = useRef(null);
  const stickRef = useRef(true);
  const [showJump, setShowJump] = useState(false);
  const [confirm, setConfirm] = useState(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [lightbox, setLightbox] = useState(null);
  const [dragging, setDragging] = useState(false);
  const dragDepth = useRef(0);

  const messages = chat?.messages || [];
  const lastMsg = messages[messages.length - 1];
  const isAsst = isAssistantId(characterId);

  // Stick to the bottom while text streams, unless the reader scrolled up.
  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const near = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    stickRef.current = near;
    setShowJump(!near);
  };
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el && stickRef.current) el.scrollTop = el.scrollHeight;
  });
  useEffect(() => {
    stickRef.current = true;
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [characterId]);
  // Replies type out inside memoized messages, so follow the column's height too.
  useEffect(() => {
    const el = scrollRef.current;
    const col = el?.firstElementChild;
    if (!el || !col || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(() => {
      if (stickRef.current) el.scrollTop = el.scrollHeight;
    });
    ro.observe(col);
    return () => ro.disconnect();
  }, [characterId]);

  if (!character) {
    return (
      <div className="page">
        <EmptyState
          icon={UserRound}
          title="This character is gone"
          body="It may have been deleted. Your other chats are in the sidebar."
          action={
            <button type="button" className="btn btn-ghost" onClick={ui.goHome}>
              Back to Discover
            </button>
          }
        />
      </div>
    );
  }
  if (!chat) return null;

  const jump = () => {
    const el = scrollRef.current;
    if (!el) return;
    stickRef.current = true;
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  };

  const onDragEnter = (e) => {
    if (![...(e.dataTransfer?.types || [])].includes('Files')) return;
    e.preventDefault();
    dragDepth.current += 1;
    setDragging(true);
  };
  const onDragLeave = () => {
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (!dragDepth.current) setDragging(false);
  };
  const onDrop = (e) => {
    e.preventDefault();
    dragDepth.current = 0;
    setDragging(false);
    const files = isAsst ? [...(e.dataTransfer?.files || [])] : imageFilesFrom(e.dataTransfer);
    if (files.length) inputRef.current?.addFiles(files);
  };

  const deleteMessage = (m) =>
    setConfirm({
      title: 'Delete this message?',
      body: m.role === 'char' ? 'All of its swipes are deleted too.' : 'It is removed from the chat and from what the character remembers.',
      confirmLabel: 'Delete',
      run: () => {
        if (m.images?.length) deleteImages(m.images.map((i) => i.id));
        dispatch({ type: 'msg/delete', charId: character.id, messageId: m.id });
      },
    });

  const menuItems = isAsst
    ? [
        { label: 'New chat', icon: NotePencil, onClick: () => ui.openAssistant() },
        { label: 'Export chat', icon: Download, onClick: () => setExportOpen(true) },
        { label: 'Settings', icon: KeyRound, onClick: ui.openSettings },
        '-',
        {
          label: 'Delete chat',
          icon: Trash2,
          danger: true,
          onClick: () =>
            setConfirm({
              title: 'Delete this chat?',
              body: 'All messages and attachments in it are removed from this browser.',
              confirmLabel: 'Delete',
              run: () => {
                engine.stop();
                dispatch({ type: 'chat/delete', charId: character.id });
                ui.goHome();
              },
            }),
        },
      ]
    : [
    { label: 'View profile', icon: UserRound, onClick: () => ui.openProfile(character.id) },
    { label: 'Export chat', icon: Download, onClick: () => setExportOpen(true) },
    { label: 'Settings', icon: KeyRound, onClick: ui.openSettings },
    '-',
    {
      label: 'Reset chat',
      icon: Eraser,
      onClick: () =>
        setConfirm({
          title: 'Reset this chat?',
          body: `Everything after ${firstName(character.name)}'s greeting is cleared, including all swipes and images.`,
          confirmLabel: 'Reset chat',
          run: () => {
            engine.stop();
            dispatch({ type: 'chat/reset', character });
          },
        }),
    },
    {
      label: 'Delete history',
      icon: Trash2,
      danger: true,
      onClick: () =>
        setConfirm({
          title: 'Delete chat history?',
          body: `This removes your whole conversation with ${character.name} from this browser. It can't be undone.`,
          confirmLabel: 'Delete history',
          run: () => {
            engine.stop();
            dispatch({ type: 'chat/delete', charId: character.id });
            ui.goHome();
            ui.toast('Chat history deleted');
          },
        }),
    },
  ];

  return (
    <div className="page chat" style={{ '--chat-light': character.avatar?.palette?.[1] || '#8a8a96' }} onDragEnter={onDragEnter} onDragOver={(e) => dragging && e.preventDefault()} onDragLeave={onDragLeave} onDrop={onDrop}>
      <header className="chat-head">
        <button type="button" className="icon-btn nav-menu" onClick={ui.openDrawer} aria-label="Open menu">
          <Menu size={22} />
          <MenuDot />
        </button>
        <button type="button" className="chat-who" onClick={() => !isAsst && ui.openProfile(character.id)}>
          <Avatar avatar={character.avatar} name={character.name} size={40} round />
          <span className="chat-who-text">
            <span className="chat-name">{isAsst ? chat.title || 'New chat' : character.name}</span>
            <span className={`chat-sub ${engine.busy ? 'typing-text' : ''}`}>
              {isAsst
                ? engine.busy
                  ? 'Charcoal is working…'
                  : 'Charcoal Chat · DeepSeek'
                : engine.busy
                  ? `${firstName(character.name)} is typing…`
                  : chat.mood
                    ? `Mood: ${chat.mood}`
                    : `By @${character.creator}`}
            </span>
          </span>
        </button>
        <div className="chat-head-actions">
          <FuelGauge />
          {isAsst ? (
            <button type="button" className="circle-btn" onClick={() => ui.openAssistant()} aria-label="New chat" title="New chat">
              <NotePencil size={18} />
            </button>
          ) : (
            <MoodPicker chat={chat} character={character} onChange={(mood) => dispatch({ type: 'chat/mood', charId: character.id, mood })} />
          )}
          <OptionsMenu items={menuItems} />
        </div>
      </header>

      <div className="chat-scroll" ref={scrollRef} onScroll={onScroll}>
        <div className="chat-column">
          {isAsst ? (
            !messages.length && <AssistantStart onPick={(t) => engine.send(t)} />
          ) : (
            <div className="chat-intro">
              <Avatar avatar={character.avatar} name={character.name} size={84} round />
              <h1>{character.name}</h1>
              <p>{character.tagline}</p>
              <span className="chat-intro-meta">By @{character.creator}</span>
            </div>
          )}

          {messages.map((m, i) => (
            <ChatMessage
              key={m.id}
              message={m}
              character={character}
              persona={persona}
              isLastChar={m.role === 'char' && i === messages.length - 1}
              busy={engine.busy}
              onSwipe={(index) => engine.swipe(m.id, index)}
              onRegenerate={() => engine.regenerate(m.id)}
              onRetry={(variantId) => engine.retry(m.id, variantId)}
              onRate={(variantId, rating) => dispatch({ type: 'msg/rate', charId: character.id, messageId: m.id, variantId, rating })}
              onDelete={engine.busy ? null : () => deleteMessage(m)}
              onOpenImage={setLightbox}
              onOpenProfile={() => ui.openProfile(character.id)}
              onOpenSettings={ui.openSettings}
            />
          ))}

          {lastMsg?.role === 'user' && !engine.busy && (
            <div className="no-reply">
              <span>No reply yet.</span>
              <button type="button" className="btn btn-ghost btn-sm" onClick={engine.replyAgain}>
                Get a reply
              </button>
            </div>
          )}
        </div>
      </div>

      {showJump && (
        <button type="button" className="jump-btn" onClick={jump} aria-label="Jump to latest">
          <ArrowDown size={16} />
        </button>
      )}

      <div className="chat-foot">
        <div className="chat-column">
          <ChatInput ref={inputRef} character={character} busy={engine.busy} onSend={engine.send} onStop={engine.stop} />
        </div>
      </div>

      {dragging && (
        <div className="drop-overlay">
          {isAsst ? <Paperclip size={28} /> : <ImagePlus size={28} />}
          <span>{isAsst ? 'Drop files or images to attach' : 'Drop images to attach'}</span>
        </div>
      )}

      {lightbox && (
        <div className="lightbox" onClick={() => setLightbox(null)} role="dialog" aria-label="Image preview">
          <img src={lightbox} alt="Attachment full size" />
          <button type="button" className="icon-btn lightbox-close" aria-label="Close">
            <X size={20} />
          </button>
        </div>
      )}

      <ConfirmDialog
        open={!!confirm}
        title={confirm?.title}
        body={confirm?.body}
        confirmLabel={confirm?.confirmLabel}
        onConfirm={confirm?.run}
        onClose={() => setConfirm(null)}
      />
      <ExportModal open={exportOpen} onClose={() => setExportOpen(false)} chat={chat} character={character} persona={persona} />
    </div>
  );
}
