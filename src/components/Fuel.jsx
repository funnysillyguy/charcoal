// Fuel gauge (top right) and the 25-second refuel break.
import { useEffect, useRef, useState } from 'react';
import { Fuel } from 'lucide-react';
import { useFuel, REFUEL_MS } from '../lib/fuel.js';
import { useSettings } from '../lib/store.jsx';
import { usePopover } from './ui.jsx';
import { formatCount } from '../lib/format.js';

export function FuelGauge() {
  const fuel = useFuel();
  const { settings } = useSettings();
  const pop = usePopover();
  const refill = useRefuelProgress(fuel.refueling ? fuel.refuelStartedAt : null);
  const fraction = fuel.refueling ? refill : fuel.fraction;
  const low = !fuel.refueling && fuel.fraction < 0.2;
  const secondsLeft = Math.max(0, Math.ceil(((1 - refill) * REFUEL_MS) / 1000));
  const perMessage = Math.max(1, settings?.repliesPerMessage || 3) * 260; // rough output per message with parallel drafts
  const messages = Math.floor(fuel.left / perMessage);
  const label = fuel.refueling ? `On a break, ${secondsLeft}s left` : `${fuel.left.toLocaleString()} tokens left until a break`;

  return (
    <div className="fuel-wrap" ref={pop.ref}>
      <button
        type="button"
        className={`fuel-gauge ${low ? 'low' : ''} ${fuel.refueling ? 'refilling' : ''}`}
        onClick={pop.toggle}
        aria-expanded={pop.open}
        aria-label={`Usage: ${label}`}
        title={label}
      >
        <span className="fuel-tube">
          <span className="fuel-level" style={{ transform: `scaleX(${fraction})` }} />
        </span>
      </button>
      {pop.open && (
        <div className="fuel-pop" role="dialog" aria-label="Usage">
          {fuel.refueling ? (
            <>
              <strong>Taking a {Math.round(REFUEL_MS / 1000)}s break</strong>
              <p>Chat unlocks in {secondsLeft}s.</p>
            </>
          ) : (
            <>
              <strong>
                {fuel.left.toLocaleString()} <span>/ {fuel.capacity.toLocaleString()}</span>
              </strong>
              <p>output tokens left until a {Math.round(REFUEL_MS / 1000)}s break</p>
              <div className="fuel-pop-bar">
                <span style={{ transform: `scaleX(${fuel.fraction})` }} />
              </div>
              <p className="fuel-pop-hint">
                {messages > 0
                  ? `About ${messages} more message${messages === 1 ? '' : 's'} at ${settings?.repliesPerMessage || 3} replies each.`
                  : 'Your next message will likely trigger the break.'}
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/** Smooth 0→1 progress for the refuel, derived from the start time so reloads resume mid-pour. */
function useRefuelProgress(startedAt) {
  const [p, setP] = useState(0);
  useEffect(() => {
    if (!startedAt) return undefined;
    let raf = 0;
    const tick = () => {
      const v = Math.min(1, (Date.now() - startedAt) / REFUEL_MS);
      setP(v);
      if (v < 1) raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [startedAt]);
  return p;
}

const TUBE = { x: 196, y: 54, w: 54, h: 176 };

export function RefuelOverlay() {
  const fuel = useFuel();
  const [visible, setVisible] = useState(fuel.refueling);
  const [leaving, setLeaving] = useState(false);
  const startedRef = useRef(fuel.refuelStartedAt);
  if (fuel.refuelStartedAt) startedRef.current = fuel.refuelStartedAt;
  const p = useRefuelProgress(startedRef.current);

  useEffect(() => {
    if (fuel.refueling) {
      setVisible(true);
      setLeaving(false);
      return undefined;
    }
    if (!visible) return undefined;
    setLeaving(true);
    const t = setTimeout(() => setVisible(false), 600);
    return () => clearTimeout(t);
  }, [fuel.refueling]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!visible) return null;
  const done = !fuel.refueling;
  const progress = done ? 1 : p;
  const secondsLeft = Math.max(0, Math.ceil(((1 - progress) * REFUEL_MS) / 1000));
  const liquidH = TUBE.h * progress;
  const surfaceY = TUBE.y + TUBE.h - liquidH;

  return (
    <div className={`refuel ${leaving ? 'leaving' : ''}`} role="dialog" aria-modal="true" aria-label="Refueling">
      <div className="refuel-card">
        <svg viewBox="0 0 300 250" className="refuel-art" aria-hidden="true">
          <defs>
            <linearGradient id="fuelLiquid" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#ffd08a" />
              <stop offset="0.45" stopColor="#f2a25c" />
              <stop offset="1" stopColor="#c2652a" />
            </linearGradient>
            <linearGradient id="canBody" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#f07a4a" />
              <stop offset="1" stopColor="#a8361f" />
            </linearGradient>
            <clipPath id="tubeClip">
              <rect x={TUBE.x} y={TUBE.y} width={TUBE.w} height={TUBE.h} rx="22" />
            </clipPath>
          </defs>

          {/* Gas can, tipped toward the tube */}
          <g className={`refuel-can ${done ? 'upright' : ''}`}>
            <g transform="translate(98 70) rotate(38)">
              <rect x="-46" y="-36" width="92" height="104" rx="12" fill="url(#canBody)" />
              <rect x="-46" y="-36" width="92" height="104" rx="12" fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="2" />
              <path d="M-30 -12 L30 52 M30 -12 L-30 52" stroke="rgba(0,0,0,0.22)" strokeWidth="6" strokeLinecap="round" />
              <rect x="-30" y="-56" width="40" height="22" rx="8" fill="none" stroke="#7a2615" strokeWidth="8" />
              <path d="M28 -36 L52 -64 L60 -58 L40 -30 Z" fill="#3a3a42" />
              <rect x="50" y="-70" width="14" height="10" rx="3" fill="#24242a" transform="rotate(38 57 -65)" />
            </g>
          </g>

          {/* Glass tube */}
          <rect x={TUBE.x - 4} y={TUBE.y - 4} width={TUBE.w + 8} height={TUBE.h + 8} rx="26" fill="#121214" stroke="#3a3a43" strokeWidth="2" />
          <g clipPath="url(#tubeClip)">
            <rect x={TUBE.x} y={surfaceY} width={TUBE.w} height={liquidH + 2} fill="url(#fuelLiquid)" />
            <path
              className="refuel-wave"
              d={`M ${TUBE.x - 54} ${surfaceY} q 13.5 -6 27 0 t 27 0 t 27 0 t 27 0 t 27 0 t 27 0 v 10 h -162 z`}
              fill="#ffd08a"
              opacity="0.9"
            />
            {!done &&
              [0, 1, 2, 3].map((i) => (
                <circle
                  key={i}
                  className="refuel-bubble"
                  cx={TUBE.x + 12 + i * 10}
                  cy={TUBE.y + TUBE.h - 6}
                  r={2 + (i % 2)}
                  style={{ animationDelay: `${i * 0.55}s` }}
                />
              ))}
            <rect x={TUBE.x + 8} y={TUBE.y + 8} width="7" height={TUBE.h - 16} rx="3.5" fill="rgba(255,255,255,0.08)" />
          </g>
          {[0.25, 0.5, 0.75].map((t) => (
            <line
              key={t}
              x1={TUBE.x + TUBE.w + 6}
              x2={TUBE.x + TUBE.w + 14}
              y1={TUBE.y + TUBE.h * (1 - t)}
              y2={TUBE.y + TUBE.h * (1 - t)}
              stroke="#71717c"
              strokeWidth="2"
            />
          ))}
          {/* Pour stream: spout → tube mouth → liquid surface */}
          {!done && (
            <path
              className="refuel-stream"
              d={`M180 56 Q ${TUBE.x + 4} 36 ${TUBE.x + TUBE.w / 2} ${TUBE.y + 2} L ${TUBE.x + TUBE.w / 2} ${surfaceY + 2}`}
              fill="none"
              stroke="url(#fuelLiquid)"
              strokeWidth="7"
              strokeLinecap="round"
            />
          )}

        </svg>

        <div className="refuel-text">
          <div className="eyebrow">{done ? 'Tank full' : 'Quick break'}</div>
          <h2>{done ? 'Ready when you are' : 'Refueling Charcoal'}</h2>
          <p>
            {done
              ? 'Back to chatting.'
              : `${formatCount(fuel.capacity)} output tokens used. Chat unlocks in ${secondsLeft}s.`}
          </p>
          <div className="refuel-bar" aria-hidden="true">
            <span style={{ width: `${progress * 100}%` }} />
          </div>
          <span className="refuel-pct">{Math.floor(progress * 100)}%</span>
        </div>
      </div>
    </div>
  );
}
