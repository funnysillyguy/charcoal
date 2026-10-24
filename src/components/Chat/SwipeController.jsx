import { ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react';
import { MAX_SWIPES } from '../../lib/settings.js';

/**
 * < 2/3 > control under the latest character message.
 * Right arrow on the last draft generates a new one (until MAX_SWIPES).
 */
export default function SwipeController({ message, busy, onSwipe, onRegenerate }) {
  const total = message.variants.length;
  const index = message.active;
  const writing = message.variants.filter((v) => v.status === 'pending' || v.status === 'streaming').length;
  const atCap = total >= MAX_SWIPES;
  const canGenerate = !message.greeting && !busy && !atCap;
  const onLast = index === total - 1;
  const temp = message.variants[index]?.meta?.temperature;

  const next = () => {
    if (!onLast) onSwipe(index + 1);
    else if (canGenerate) onRegenerate();
  };

  const nextDisabled = onLast && !canGenerate;
  const nextLabel = onLast
    ? atCap
      ? `Limit of ${MAX_SWIPES} responses reached`
      : message.greeting
        ? 'No more greetings'
        : 'Generate a new response'
    : 'Next response';

  if (total <= 1 && message.greeting) return null;

  return (
    <div className="swipe" aria-label="Response variations">
      <button
        type="button"
        className="icon-btn sm"
        onClick={() => onSwipe(index - 1)}
        disabled={index === 0}
        aria-label="Previous response"
      >
        <ChevronLeft size={16} />
      </button>
      <span className="swipe-count" title={temp ? `temperature ${temp}` : undefined}>
        {index + 1}/{total}
        {writing > 0 && <span className="swipe-writing" aria-label={`${writing} still writing`} />}
      </span>
      <button type="button" className="icon-btn sm" onClick={next} disabled={nextDisabled} aria-label={nextLabel} title={nextLabel}>
        <ChevronRight size={16} />
      </button>
      {!message.greeting && (
        <button
          type="button"
          className="icon-btn sm"
          onClick={onRegenerate}
          disabled={!canGenerate}
          aria-label={atCap ? `Limit of ${MAX_SWIPES} responses reached` : 'Regenerate'}
          title={atCap ? `Limit of ${MAX_SWIPES} responses reached` : 'Regenerate (adds a new response)'}
        >
          <RefreshCw size={14} />
        </button>
      )}
    </div>
  );
}
