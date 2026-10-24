import { Globe, Info, Link2, Lock, MessageSquare } from 'lucide-react';
import Avatar from './Avatar.jsx';
import { useUI } from './ui.jsx';
import { formatCount } from '../lib/format.js';

const VIS = {
  public: { icon: Globe, label: 'Public' },
  unlisted: { icon: Link2, label: 'Unlisted' },
  private: { icon: Lock, label: 'Private' },
};

export default function CharacterCard({ character }) {
  const ui = useUI();
  const vis = character.custom ? VIS[character.visibility] || VIS.private : null;

  return (
    <article className="card">
      <button type="button" className="card-main" onClick={() => ui.openChat(character)}>
        <Avatar avatar={character.avatar} name={character.name} size={88} radius={16} />
        <span className="card-text">
          <span className="card-name">{character.name}</span>
          <span className="card-creator">By @{character.creator}</span>
          <span className="card-tagline">{character.tagline || character.description}</span>
        </span>
      </button>
      <footer className="card-foot">
        <span className="card-stat" title={`${character.interactions.toLocaleString()} chats`}>
          <MessageSquare size={13} />
          {formatCount(character.interactions)}
        </span>
        <span className="chip">{character.category}</span>
        {vis && (
          <span className="chip">
            <vis.icon size={11} />
            {vis.label}
          </span>
        )}
        <button
          type="button"
          className="icon-btn sm card-info"
          onClick={() => ui.openProfile(character.id)}
          aria-label={`About ${character.name}`}
        >
          <Info size={15} />
        </button>
      </footer>
    </article>
  );
}
