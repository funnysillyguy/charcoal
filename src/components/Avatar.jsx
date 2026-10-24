import { EMBLEMS } from './emblems.js';
import Portrait from './Portrait.jsx';

/**
 * Character avatar. Uploaded images render as-is; generated ones are a lit-from-within
 * gradient with an emblem, so every persona has a recognizable mark without stock art.
 */
export default function Avatar({ avatar, name = '', size = 40, radius, round = false, className = '', glow = false }) {
  const r = round ? '50%' : radius ?? Math.round(size * 0.28);
  const style = { width: size, height: size, borderRadius: r };

  if (avatar?.kind === 'image' && avatar.src) {
    return (
      <span className={`avatar ${glow ? 'avatar-glow' : ''} ${className}`} style={style}>
        <img src={avatar.src} alt="" />
      </span>
    );
  }

  const [base, light] = avatar?.palette || ['#2a2a2e', '#d8d8de'];

  if (avatar?.kind === 'portrait' && avatar.portrait) {
    return (
      <span
        className={`avatar avatar-gen avatar-portrait ${glow ? 'avatar-glow' : ''} ${className}`}
        style={{ ...style, '--av-base': base, '--av-light': light }}
        aria-hidden="true"
      >
        <Portrait portrait={avatar.portrait} />
      </span>
    );
  }

  const Icon = EMBLEMS[avatar?.emblem];
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();

  return (
    <span
      className={`avatar avatar-gen ${glow ? 'avatar-glow' : ''} ${className}`}
      style={{
        ...style,
        '--av-base': base,
        '--av-light': light,
      }}
      aria-hidden="true"
    >
      {Icon ? (
        <Icon size={Math.round(size * 0.46)} strokeWidth={size > 64 ? 1.4 : 1.8} />
      ) : (
        <span className="avatar-initials" style={{ fontSize: size * 0.4 }}>
          {initials}
        </span>
      )}
    </span>
  );
}
