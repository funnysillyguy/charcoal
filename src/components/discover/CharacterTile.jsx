import { Globe, Info, Link2, Lock, MessageCircle } from 'lucide-react';
import CoverArt from './CoverArt.jsx';
import { useUI } from '../ui.jsx';
import { formatCount } from '../../lib/format.js';

const VIS = {
  public: { icon: Globe, label: 'Public' },
  unlisted: { icon: Link2, label: 'Unlisted' },
  private: { icon: Lock, label: 'Private' },
};

/** Art-first character card: big cover, name, creator, two-line tagline. */
export default function CharacterTile({ character, style }) {
  const ui = useUI();
  const vis = character.custom ? VIS[character.visibility] || VIS.private : null;
  return (
    <article className="tile" style={style}>
      <button type="button" className="tile-main" onClick={() => ui.openChat(character)} aria-label={`Chat with ${character.name}`}>
        <div className="tile-art">
          <CoverArt character={character} />
          {vis && (
            <span className="tile-badge">
              <vis.icon size={11} />
              {vis.label}
            </span>
          )}
          <span className="tile-stat">
            <MessageCircle size={12} />
            {formatCount(character.interactions)}
          </span>
        </div>
        <span className="tile-name">{character.name}</span>
        <span className="tile-by">@{character.creator}</span>
        <span className="tile-tag">{character.tagline || character.description}</span>
      </button>
      <button type="button" className="tile-info" onClick={() => ui.openProfile(character.id)} aria-label={`About ${character.name}`}>
        <Info size={15} />
      </button>
    </article>
  );
}
