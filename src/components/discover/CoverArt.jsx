// Full-bleed character art for big tiles and the hero. Uploaded images fill the frame;
// generated portraits sit on their lit gradient; emblem characters get a poster treatment.
import { EMBLEMS } from '../emblems.js';
import Portrait from '../Portrait.jsx';

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
  const Icon = EMBLEMS[a.emblem];
  const initials = (character?.name || '?')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();
  return (
    <div className={`cover cover-gen cover-emblem ${className}`} style={style} aria-hidden="true">
      {Icon ? (
        <>
          <Icon className="cover-emblem-ghost" strokeWidth={0.6} />
          <Icon className="cover-emblem-main" strokeWidth={1.3} />
        </>
      ) : (
        <span className="cover-initials">{initials}</span>
      )}
    </div>
  );
}
