import Portrait from './Portrait.jsx';

/**
 * Character avatar. Uploaded images render as-is, drawn portraits sit on their color,
 * and everyone else gets a monogram: their initial, set in the cover serif on their own color.
 */
export default function Avatar({ avatar, name = '', size = 40, radius, round = false, className = '', glow = false }) {
  const r = round ? '50%' : radius ?? Math.round(size * 0.22);
  const style = { width: size, height: size, borderRadius: r };

  if (avatar?.kind === 'image' && avatar.src) {
    return (
      <span className={`avatar ${glow ? 'avatar-glow' : ''} ${className}`} style={style}>
        <img src={avatar.src} alt="" />
      </span>
    );
  }

  if (avatar?.kind === 'logo') {
    // Charcoal Chat: the app's own mark
    return (
      <span className={`avatar avatar-logo ${className}`} style={style} aria-hidden="true">
        <span className="logo-mark" style={{ width: Math.round(size * 0.56), height: Math.round(size * 0.56) }} />
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

  const initial = (name.trim()[0] || '?').toUpperCase();
  return (
    <span
      className={`avatar avatar-gen avatar-mono ${glow ? 'avatar-glow' : ''} ${className}`}
      style={{ ...style, '--av-base': base, '--av-light': light }}
      aria-hidden="true"
    >
      <span className="avatar-initials" style={{ fontSize: Math.round(size * 0.5) }}>
        {initial}
      </span>
    </span>
  );
}
