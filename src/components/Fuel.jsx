// Fuel gauge (top right) and the 25-second refuel break.
import { useEffect, useRef, useState } from 'react';
import { Fuel } from './icons.jsx';
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
  const label = fuel.refueling ? `On a break, ${secondsLeft}s left` : `${fuel.left} replies left until a break`;

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
              <p>replies left until a {Math.round(REFUEL_MS / 1000)}s break</p>
              <div className="fuel-pop-bar">
                <span style={{ transform: `scaleX(${fuel.fraction})` }} />
              </div>
              <p className="fuel-pop-hint">Everything the AI writes counts: each reply draft (3 at once = 3), every swipe and regeneration, and each Help me write idea.</p>
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
    const t = setTimeout(() => setVisible(false), 900);
    return () => clearTimeout(t);
  }, [fuel.refueling]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!visible) return null;
  const done = !fuel.refueling;
  const progress = done ? 1 : p;
  const secondsLeft = Math.max(0, Math.ceil(((1 - progress) * REFUEL_MS) / 1000));
  const R = 70;
  const C = 2 * Math.PI * R;

  return (
    <div className={`brk ${leaving ? 'leaving' : ''} ${done ? 'done' : ''}`} role="dialog" aria-modal="true" aria-label="Short break">
      <div className="brk-card">
        <div className="brk-ring">
          <svg viewBox="0 0 160 160" aria-hidden="true">
            <circle cx="80" cy="80" r={R} className="brk-track" />
            <circle cx="80" cy="80" r={R} className="brk-progress" strokeDasharray={C} strokeDashoffset={C * (1 - progress)} />
          </svg>
          <div className="brk-center">
            {done ? (
              <span className="logo-mark brk-logo" aria-hidden="true" />
            ) : (
              <>
                <span className="brk-secs">{secondsLeft}</span>
                <span className="brk-unit">sec</span>
              </>
            )}
          </div>
        </div>
        <div className="brk-text">
          <span className="brk-eyebrow">
            <span className="logo-mark brk-mini" aria-hidden="true" /> charcoal
          </span>
          <h2>{done ? 'You’re back' : 'Quick breather'}</h2>
          <p>{done ? 'Pick up right where you left off.' : `${fuel.capacity} replies in. Stretch, sip some water, chat unlocks in a sec.`}</p>
        </div>
      </div>
    </div>
  );
}
