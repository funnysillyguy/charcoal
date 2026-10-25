// Home-page heads-up when today's free built-in AI is used up.
import { MoonStar, PlayCircle } from 'lucide-react';
import { useUI } from '../ui.jsx';
import { useSettings } from '../../lib/store.jsx';
import { useShared } from '../../lib/endpoint.js';
import { resetInfo } from '../../lib/format.js';

export default function LimitBanner() {
  const ui = useUI();
  const { settings } = useSettings();
  const shared = useShared();
  const hit = shared.signedIn && shared.enabled && !settings.apiKey && shared.dailyLimit && shared.usedToday >= shared.dailyLimit;
  if (!hit) return null;
  const { at, left } = resetInfo();
  return (
    <div className="limit-banner" role="status">
      <span className="msg-limit-icon" aria-hidden="true">
        <MoonStar size={20} />
      </span>
      <div className="limit-banner-text">
        <strong>You’ve used today’s free AI</strong>
        <p>
          It refills at <b>{at}</b> (in {left}). Add your own DeepSeek key to keep going with no limit.
        </p>
      </div>
      <div className="limit-banner-actions">
        <button type="button" className="btn btn-primary btn-sm" onClick={ui.openGuide}>
          <PlayCircle size={15} /> Show me how
        </button>
      </div>
    </div>
  );
}
