// Draws an original anthro bust from portrait params (see lib/portraits.js).
// Flat shapes in a 200×200 box; the avatar wrapper supplies the glowing background.

const EYE_L = 82;
const EYE_R = 118;
const EYE_Y = 100;

function Ears({ p }) {
  const { species: s, fur, light, accent } = p;
  if (s === 'fox')
    return (
      <g>
        <path d="M58 96 L62 26 L100 66 Z" fill={fur} />
        <path d="M142 96 L138 26 L100 66 Z" fill={fur} />
        <path d="M66 84 L67 42 L90 66 Z" fill={light} opacity="0.9" />
        <path d="M134 84 L133 42 L110 66 Z" fill={light} opacity="0.9" />
        <path d="M62 26 L60.6 46 L73 39 Z" fill={accent} />
        <path d="M138 26 L139.4 46 L127 39 Z" fill={accent} />
      </g>
    );
  if (s === 'wolf')
    return (
      <g>
        <path d="M58 92 L66 32 L98 64 Z" fill={fur} />
        <path d="M142 92 L134 32 L102 64 Z" fill={fur} />
        <path d="M67 82 L70 46 L89 64 Z" fill={accent} opacity="0.75" />
        <path d="M133 82 L130 46 L111 64 Z" fill={accent} opacity="0.75" />
      </g>
    );
  if (s === 'cat')
    return (
      <g>
        <path d="M56 86 Q58 44 66 40 Q80 48 94 62 Z" fill={fur} />
        <path d="M144 86 Q142 44 134 40 Q120 48 106 62 Z" fill={fur} />
        <path d="M65 78 Q67 54 70 51 Q79 56 87 64 Z" fill={accent} opacity="0.7" />
        <path d="M135 78 Q133 54 130 51 Q121 56 113 64 Z" fill={accent} opacity="0.7" />
      </g>
    );
  if (s === 'rabbit')
    return (
      <g>
        <ellipse cx="80" cy="40" rx="13" ry="40" fill={fur} transform="rotate(-12 80 40)" />
        <ellipse cx="120" cy="40" rx="13" ry="40" fill={fur} transform="rotate(12 120 40)" />
        <ellipse cx="80" cy="42" rx="6.5" ry="30" fill={light} opacity="0.85" transform="rotate(-12 80 42)" />
        <ellipse cx="120" cy="42" rx="6.5" ry="30" fill={light} opacity="0.85" transform="rotate(12 120 42)" />
      </g>
    );
  if (s === 'redpanda')
    return (
      <g>
        <circle cx="64" cy="64" r="18" fill={light} />
        <circle cx="136" cy="64" r="18" fill={light} />
        <circle cx="65" cy="65" r="13" fill={accent} />
        <circle cx="135" cy="65" r="13" fill={accent} />
      </g>
    );
  if (s === 'bear')
    return (
      <g>
        <circle cx="66" cy="64" r="16" fill={fur} />
        <circle cx="134" cy="64" r="16" fill={fur} />
        <circle cx="66" cy="65" r="8" fill={light} />
        <circle cx="134" cy="65" r="8" fill={light} />
      </g>
    );
  // dragon: swept-back horns + fin ears
  return (
    <g>
      <path d="M72 70 Q52 40 40 22 Q66 34 84 62 Z" fill={accent} />
      <path d="M128 70 Q148 40 160 22 Q134 34 116 62 Z" fill={accent} />
      <path d="M58 98 L34 84 L44 108 Z" fill={light} />
      <path d="M142 98 L166 84 L156 108 Z" fill={light} />
    </g>
  );
}

function Head({ p }) {
  const { species: s, fur } = p;
  const cheekTufts = s === 'fox' || s === 'wolf' || s === 'cat' || s === 'redpanda';
  return (
    <g>
      {cheekTufts && (
        <>
          <path d="M62 98 L40 126 L72 120 Z" fill={fur} />
          <path d="M138 98 L160 126 L128 120 Z" fill={fur} />
        </>
      )}
      <ellipse
        cx="100"
        cy="100"
        rx={s === 'rabbit' ? 40 : s === 'bear' ? 46 : s === 'dragon' ? 40 : 44}
        ry={s === 'dragon' ? 38 : 41}
        fill={fur}
      />
    </g>
  );
}

function Markings({ p }) {
  const { species: s, accent, light, markings } = p;
  if (s === 'cat' && markings === 'stripes')
    return (
      <g fill={accent}>
        <path d="M96 62 Q100 74 104 62 Q100 66 96 62 Z" />
        <path d="M86 66 Q89 76 92 66 Z" />
        <path d="M108 66 Q111 76 114 66 Z" />
        <path d="M58 100 Q66 103 70 99 Q64 99 58 100 Z" />
        <path d="M142 100 Q134 103 130 99 Q136 99 142 100 Z" />
      </g>
    );
  if (s === 'cat' && markings === 'spots')
    return (
      <g fill={accent} opacity="0.85">
        <circle cx="92" cy="70" r="3" />
        <circle cx="104" cy="66" r="3.4" />
        <circle cx="114" cy="74" r="2.6" />
        <circle cx="66" cy="96" r="2.8" />
        <circle cx="134" cy="96" r="2.8" />
        <circle cx="70" cy="84" r="2.2" />
        <circle cx="130" cy="84" r="2.2" />
      </g>
    );
  if (s === 'wolf' && markings === 'cap')
    return <path d="M60 92 Q100 40 140 92 Q122 82 100 96 Q78 82 60 92 Z" fill={accent} opacity="0.55" />;
  if (s === 'redpanda')
    return (
      <g>
        <ellipse cx="80" cy="84" rx="9" ry="5" fill={light} />
        <ellipse cx="120" cy="84" rx="9" ry="5" fill={light} />
        <path d="M78 106 Q74 120 80 132 Q86 120 84 106 Z" fill={p.accent} opacity="0.8" />
        <path d="M122 106 Q126 120 120 132 Q114 120 116 106 Z" fill={p.accent} opacity="0.8" />
      </g>
    );
  if (s === 'dragon')
    return (
      <g fill={light} opacity="0.5">
        <path d="M100 64 L94 74 L106 74 Z" />
        <path d="M100 76 L95 84 L105 84 Z" />
      </g>
    );
  return null;
}

function Muzzle({ p }) {
  const { species: s, light, fur } = p;
  if (s === 'fox')
    return (
      <g>
        <path d="M60 106 Q80 100 100 120 Q120 100 140 106 Q130 138 100 148 Q70 138 60 106 Z" fill={light} />
      </g>
    );
  if (s === 'wolf')
    return (
      <g>
        <path d="M70 110 Q100 96 130 110 Q128 142 100 148 Q72 142 70 110 Z" fill={light} />
      </g>
    );
  if (s === 'cat' || s === 'rabbit')
    return (
      <g fill={light}>
        <circle cx="92" cy="126" r={s === 'cat' ? 11 : 9} />
        <circle cx="108" cy="126" r={s === 'cat' ? 11 : 9} />
        <ellipse cx="100" cy="137" rx="7" ry="5" />
      </g>
    );
  if (s === 'redpanda') return <ellipse cx="100" cy="126" rx="20" ry="16" fill={light} />;
  if (s === 'bear') return <ellipse cx="100" cy="126" rx="19" ry="15" fill={light} />;
  return <ellipse cx="100" cy="128" rx="22" ry="16" fill={fur} stroke={light} strokeOpacity="0.35" strokeWidth="2" />;
}

function Eyes({ p }) {
  const { expression, eye, fur, species } = p;
  const slit = species === 'cat' || species === 'dragon';
  if (expression === 'happy')
    return (
      <g stroke="#17161a" strokeWidth="3.4" strokeLinecap="round" fill="none">
        <path d={`M${EYE_L - 7} ${EYE_Y + 2} Q${EYE_L} ${EYE_Y - 7} ${EYE_L + 7} ${EYE_Y + 2}`} />
        <path d={`M${EYE_R - 7} ${EYE_Y + 2} Q${EYE_R} ${EYE_Y - 7} ${EYE_R + 7} ${EYE_Y + 2}`} />
      </g>
    );
  const eyeShape = (cx) => (
    <g key={cx}>
      <ellipse cx={cx} cy={EYE_Y} rx="7.5" ry="8.5" fill="#f4f1ec" />
      <ellipse cx={cx} cy={EYE_Y + 0.5} rx="6" ry="7.2" fill={eye} />
      <ellipse cx={cx} cy={EYE_Y + 0.5} rx={slit ? 1.6 : 3} ry={slit ? 6.2 : 4.2} fill="#141317" />
      <circle cx={cx - 2.2} cy={EYE_Y - 3} r="1.8" fill="#fff" />
    </g>
  );
  return (
    <g>
      {eyeShape(EYE_L)}
      {eyeShape(EYE_R)}
      {expression === 'half' && (
        <g fill={fur}>
          <rect x={EYE_L - 9} y={EYE_Y - 10} width="18" height="9" rx="2" />
          <rect x={EYE_R - 9} y={EYE_Y - 10} width="18" height="9" rx="2" />
        </g>
      )}
    </g>
  );
}

function NoseMouth({ p }) {
  const { species: s } = p;
  const pink = s === 'cat' || s === 'rabbit';
  const dark = '#1a1719';
  return (
    <g>
      {s === 'dragon' ? (
        <g fill={dark} opacity="0.75">
          <ellipse cx="93" cy="122" rx="2.6" ry="1.8" />
          <ellipse cx="107" cy="122" rx="2.6" ry="1.8" />
        </g>
      ) : (
        <path
          d={s === 'bear' ? 'M90 118 Q100 112 110 118 Q106 128 100 128 Q94 128 90 118 Z' : 'M93 120 Q100 116 107 120 Q104 127 100 128 Q96 127 93 120 Z'}
          fill={pink ? '#e79aa8' : dark}
        />
      )}
      <path
        d="M92 134 Q96 139 100 134 Q104 139 108 134"
        stroke={dark}
        strokeOpacity="0.75"
        strokeWidth="2.2"
        fill="none"
        strokeLinecap="round"
      />
      {s === 'rabbit' && <rect x="97" y="135" width="6" height="6" rx="1.5" fill="#fbf7f2" stroke={dark} strokeOpacity="0.3" />}
    </g>
  );
}

function Body({ p }) {
  const { fur, light, clothes } = p;
  return (
    <g>
      <rect x="84" y="132" width="32" height="44" fill={fur} />
      <path d="M22 204 Q30 168 72 160 L128 160 Q170 168 178 204 Z" fill={clothes} />
      <path d="M84 160 L116 160 L100 186 Z" fill={light} />
      <path d="M72 160 L100 192 L128 160" fill="none" stroke="rgba(0,0,0,0.25)" strokeWidth="2" />
    </g>
  );
}

function Accessory({ p }) {
  const { accessory, accent, eye, clothes } = p;
  const pop = eye;
  switch (accessory) {
    case 'scarf':
      return (
        <g>
          <path d="M70 156 Q100 172 130 156 L132 168 Q100 184 68 168 Z" fill={pop} />
          <path d="M112 170 L124 198 L112 200 L104 174 Z" fill={pop} />
        </g>
      );
    case 'glasses':
      return (
        <g stroke="#e9e4da" strokeWidth="2.4" fill="rgba(255,255,255,0.06)">
          <circle cx={EYE_L} cy={EYE_Y} r="12" />
          <circle cx={EYE_R} cy={EYE_Y} r="12" />
          <path d={`M${EYE_L + 12} ${EYE_Y} Q100 ${EYE_Y - 4} ${EYE_R - 12} ${EYE_Y}`} fill="none" />
        </g>
      );
    case 'earring':
      return (
        <g>
          <circle cx="62" cy="90" r="3.2" fill="#f2c66d" />
          <circle cx="62" cy="98" r="2.6" fill="none" stroke="#f2c66d" strokeWidth="1.8" />
        </g>
      );
    case 'collar':
      return (
        <g>
          <rect x="80" y="150" width="40" height="8" rx="4" fill={accent === clothes ? '#c94f4f' : '#c94f4f'} />
          <circle cx="100" cy="162" r="5" fill="#f2c66d" />
        </g>
      );
    case 'flower':
      return (
        <g transform="translate(130 64)">
          {[0, 72, 144, 216, 288].map((a) => (
            <ellipse key={a} cx="0" cy="-6" rx="4" ry="6" fill={pop} transform={`rotate(${a})`} />
          ))}
          <circle r="3.5" fill="#f7e27a" />
        </g>
      );
    case 'bandana':
      return <path d="M58 82 Q100 52 142 82 L140 74 Q100 44 60 74 Z" fill={pop} />;
    default:
      return null;
  }
}

export default function Portrait({ portrait: p }) {
  if (!p) return null;
  return (
    <svg viewBox="0 0 200 200" className="portrait" aria-hidden="true">
      <Body p={p} />
      <Ears p={p} />
      <Head p={p} />
      <Markings p={p} />
      <Muzzle p={p} />
      <Eyes p={p} />
      <NoseMouth p={p} />
      <Accessory p={p} />
    </svg>
  );
}
