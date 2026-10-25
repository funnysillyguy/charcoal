// Full-bleed character art for big tiles, the hero and profiles. Uploaded images fill the frame,
// drawn portraits sit on their color, and everyone else gets a type-set cover: the character's
// name in a book-jacket serif on their own color, with their genre above it.
import Portrait from '../Portrait.jsx';

/** Size the name so its longest word fits the width (in container-width units). */
export function coverNameSize(name) {
  const words = String(name || '?').split(/\s+/).filter(Boolean);
  const longest = Math.max(4, ...words.map((w) => w.length));
  const lines = words.length;
  const byWidth = 84 / (longest * 0.56);
  const byLines = lines >= 4 ? 13 : lines === 3 ? 15 : 19;
  return Math.max(9, Math.min(byWidth, byLines));
}

export default function CoverArt({ character, className = '' }) {
  const a = character?.avatar || {};
  if (a.kind === 'image' && a.src) {
    return (
      <div className={`cover ${className}`}>
        <img src={a.src} alt="" loading="lazy" draggable={false} />
      </div>
    );
  }
  const [base, light] = a.palette || ['#2a2a2e', '#d8d8de'];
  const style = { '--av-base': base, '--av-light': light };
  if (a.kind === 'portrait' && a.portrait) {
    return (
      <div className={`cover cover-gen cover-portrait ${className}`} style={style} aria-hidden="true">
        <Portrait portrait={a.portrait} />
      </div>
    );
  }
  const name = character?.name || 'Untitled';
  const label = character?.tags?.[0] || character?.category || '';
  return (
    <div className={`cover cover-gen cover-type ${className}`} style={style} aria-hidden="true">
      <div className="cover-type-in">
        {label && <span className="cover-type-label">{label}</span>}
        <span className="cover-type-name" style={{ fontSize: `${coverNameSize(name)}cqw` }}>
          {name}
        </span>
      </div>
    </div>
  );
}
