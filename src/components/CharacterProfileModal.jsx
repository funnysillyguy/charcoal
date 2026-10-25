import { useState } from 'react';
import { Copy, ExternalLink, Globe, Link2, Lock, MessageSquare, Pencil, Trash2 } from './icons.jsx';
import { Modal, ConfirmDialog, useUI } from './ui.jsx';
import Avatar from './Avatar.jsx';
import { Markdown } from '../lib/markdown.jsx';
import { useStore, useCharacter, useActivePersona } from '../lib/store.jsx';
import { fillNames, formatCount } from '../lib/format.js';
import { chatsLabel } from '../lib/counts.js';

const VIS = { public: [Globe, 'Public'], unlisted: [Link2, 'Unlisted'], private: [Lock, 'Private'] };

export default function CharacterProfileModal({ characterId, onClose }) {
  const character = useCharacter(characterId);
  const { state, dispatch } = useStore();
  const persona = useActivePersona();
  const ui = useUI();
  const [confirm, setConfirm] = useState(false);
  const [greetingIdx, setGreetingIdx] = useState(0);
  if (!character) return null;

  const hasChat = !!state.chats[character.id];
  const greetings = character.greetings || [];
  const vis = character.custom ? VIS[character.visibility] || VIS.private : null;
  const VisIcon = vis?.[0];

  return (
    <>
      <Modal open={!!characterId} onClose={onClose} size="md" title="" labelledBy="profile-name">
        <div className="profile">
          <div className="profile-top">
            <Avatar avatar={character.avatar} name={character.name} size={112} radius={32} glow />
            <div className="profile-id">
              <h2 id="profile-name">{character.name}</h2>
              <p className="profile-tagline">{character.tagline}</p>
              <p className="profile-meta">
                by <strong>@{character.creator}</strong>
                {character.sourceUrl && (
                  <a href={character.sourceUrl} target="_blank" rel="noreferrer noopener" className="profile-source">
                    original <ExternalLink size={12} />
                  </a>
                )}
                <span>·</span>
                <MessageSquare size={13} /> {chatsLabel(character.interactions)}
              </p>
              {character.basedOn && (
                <p className="profile-meta">
                  Remix of {character.basedOn.name} by @{character.basedOn.creator}
                </p>
              )}
            </div>
          </div>

          <div className="profile-chips">
            <span className="chip">{character.custom ? 'Custom' : character.category}</span>
            {VisIcon && (
              <span className="chip">
                <VisIcon size={11} /> {vis[1]}
              </span>
            )}
            {(character.tags || []).map((t) => (
              <span key={t} className="chip">
                {t}
              </span>
            ))}
          </div>

          {character.description && <p className="profile-desc">{character.description}</p>}

          {greetings.length > 0 && (
            <div className="profile-greeting">
              <div className="profile-greeting-head">
                <span className="eyebrow">Greeting</span>
                {greetings.length > 1 && (
                  <div className="segmented">
                    {greetings.map((_, i) => (
                      <button key={i} type="button" className={greetingIdx === i ? 'active' : ''} onClick={() => setGreetingIdx(i)}>
                        {i + 1}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <Markdown text={fillNames(greetings[greetingIdx] || greetings[0], { user: persona.name, char: character.name })} />
            </div>
          )}

          {character.custom && character.definition?.persona && (
            <details className="advanced">
              <summary>Definition</summary>
              <pre className="profile-def">{character.definition.persona}</pre>
            </details>
          )}

          <div className="profile-actions">
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                onClose();
                ui.openChat(character);
              }}
            >
              <MessageSquare size={15} /> {hasChat ? 'Continue chat' : 'Start chatting'}
            </button>
            {character.custom ? (
              <>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => {
                    onClose();
                    ui.openCreator({ character });
                  }}
                >
                  <Pencil size={15} /> Edit
                </button>
                <button type="button" className="btn btn-danger" onClick={() => setConfirm(true)}>
                  <Trash2 size={15} /> Delete
                </button>
              </>
            ) : (
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => {
                  onClose();
                  ui.openCreator({ character, remix: true });
                }}
                title="Make your own editable copy, credited to the original creator"
              >
                <Copy size={15} /> Remix
              </button>
            )}
          </div>
        </div>
      </Modal>
      <ConfirmDialog
        open={confirm}
        title={`Delete ${character.name}?`}
        body="The character and your chat with them are removed from this browser. This can't be undone."
        confirmLabel="Delete character"
        onClose={() => setConfirm(false)}
        onConfirm={() => {
          dispatch({ type: 'character/delete', id: character.id });
          onClose();
          ui.goHome();
          ui.toast(`Deleted ${character.name}`);
        }}
      />
    </>
  );
}
