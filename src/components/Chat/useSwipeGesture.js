// Drag a reply sideways to flip through its responses, like a card.
// Left = next (past the last one = write a new response), right = previous.
// Vertical drags are left to the page so scrolling still works (touch-action: pan-y on the target).
import { useCallback, useRef, useState } from 'react';

const LOCK_PX = 10; // movement before we decide horizontal vs vertical
const COMMIT_FRACTION = 0.22; // of the bubble width
const COMMIT_MIN_PX = 64;
const FLICK_SPEED = 0.55; // px/ms

export function useSwipeGesture({ enabled, canPrev, canNext, nextIsNew, onPrev, onNext }) {
  const [dx, setDx] = useState(0);
  const [phase, setPhase] = useState('idle'); // idle | drag | out-left | out-right | back
  const g = useRef(null);

  const resist = useCallback(
    (x) => {
      // Rubber band when there's nothing that way.
      if (x < 0 && !canNext) return x * 0.25;
      if (x > 0 && !canPrev) return x * 0.25;
      return x;
    },
    [canNext, canPrev],
  );

  const onPointerDown = (e) => {
    if (!enabled || (e.pointerType === 'mouse' && e.button !== 0)) return;
    if (e.target.closest('button, a, input, textarea, pre, .md-code')) return;
    g.current = { id: e.pointerId, x0: e.clientX, y0: e.clientY, t0: performance.now(), lock: null, w: e.currentTarget.offsetWidth, el: e.currentTarget };
  };

  const onPointerMove = (e) => {
    const s = g.current;
    if (!s || s.id !== e.pointerId) return;
    const mx = e.clientX - s.x0;
    const my = e.clientY - s.y0;
    if (!s.lock) {
      if (Math.abs(mx) < LOCK_PX && Math.abs(my) < LOCK_PX) return;
      s.lock = Math.abs(mx) > Math.abs(my) * 1.2 ? 'x' : 'y';
      if (s.lock === 'y') {
        g.current = null;
        return;
      }
      s.el.setPointerCapture?.(e.pointerId);
      window.getSelection?.()?.removeAllRanges();
      setPhase('drag');
    }
    s.last = { x: mx, t: performance.now() };
    setDx(resist(mx));
  };

  const finish = (e) => {
    const s = g.current;
    g.current = null;
    if (!s || s.lock !== 'x') return;
    const mx = e.clientX - s.x0;
    const dt = Math.max(1, performance.now() - s.t0);
    const speed = Math.abs(mx) / dt;
    const far = Math.abs(mx) > Math.max(COMMIT_MIN_PX, s.w * COMMIT_FRACTION);
    const go = far || (speed > FLICK_SPEED && Math.abs(mx) > 24);
    if (go && mx < 0 && canNext) {
      setPhase('out-left');
      setTimeout(() => {
        onNext();
        setDx(0);
        setPhase('idle');
      }, 140);
    } else if (go && mx > 0 && canPrev) {
      setPhase('out-right');
      setTimeout(() => {
        onPrev();
        setDx(0);
        setPhase('idle');
      }, 140);
    } else {
      setPhase('back');
      setDx(0);
      setTimeout(() => setPhase('idle'), 220);
    }
  };

  const style =
    phase === 'drag'
      ? { transform: `translateX(${dx}px) rotate(${dx / 60}deg)`, transition: 'none' }
      : phase === 'out-left'
        ? { transform: 'translateX(-60%) rotate(-4deg)', opacity: 0, transition: 'transform 0.14s ease-in, opacity 0.14s ease-in' }
        : phase === 'out-right'
          ? { transform: 'translateX(60%) rotate(4deg)', opacity: 0, transition: 'transform 0.14s ease-in, opacity 0.14s ease-in' }
          : phase === 'back'
            ? { transform: 'translateX(0)', transition: 'transform 0.22s cubic-bezier(0.3, 1.4, 0.5, 1)' }
            : undefined;

  // What's revealed behind the card while dragging.
  const hint =
    phase === 'drag' && Math.abs(dx) > 18
      ? dx < 0
        ? canNext
          ? nextIsNew
            ? 'New response'
            : 'Next'
          : null
        : canPrev
          ? 'Previous'
          : null
      : null;

  return {
    bind: enabled ? { onPointerDown, onPointerMove, onPointerUp: finish, onPointerCancel: finish } : {},
    style,
    hint,
    side: dx < 0 ? 'left' : 'right',
    dragging: phase === 'drag',
    progress: Math.min(1, Math.abs(dx) / 120),
  };
}
