// "Thank @user" for whoever powers Charcoal AI. Heart burst on tap, then a banner drops from the top.
import { useState } from 'react';
import { Check, Heart } from 'lucide-react';
import { useUI } from './ui.jsx';
import { sendThanks, useSocial } from '../lib/social.js';

export default function ThankButton({ compact = false }) {
  const ui = useUI();
  const { sponsor, isSponsor, thankedToday } = useSocial();
  const [busy, setBusy] = useState(false);
  const [burst, setBurst] = useState(0);
  if (!sponsor || isSponsor) return null;
  const done = thankedToday;

  const onClick = async () => {
    if (done || busy) return;
    setBusy(true);
    setBurst((b) => b + 1);
    try {
      const r = await sendThanks();
      ui.notice(r.already ? `You already thanked @${r.to} today` : `Sent thanks to @${r.to}`);
    } catch (e) {
      ui.toast(e.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      className={`thank-btn ${done ? 'done' : ''} ${compact ? 'compact' : ''}`}
      onClick={onClick}
      disabled={busy}
      aria-label={done ? `Thanked @${sponsor.username} today` : `Thank @${sponsor.username}`}
    >
      <span className="thank-icon" key={burst}>
        {done ? <Check size={15} /> : <Heart size={15} />}
        {burst > 0 && (
          <span className="thank-burst" aria-hidden="true">
            {Array.from({ length: 8 }, (_, i) => (
              <i key={i} style={{ '--a': `${i * 45}deg` }} />
            ))}
          </span>
        )}
      </span>
      <span>{done ? 'Thanked' : `Thank @${sponsor.username}`}</span>
    </button>
  );
}

/** "Charcoal AI is free thanks to @own" line with the button. */
export function PoweredBy() {
  const { sponsor, isSponsor } = useSocial();
  if (!sponsor) return null;
  return (
    <div className="powered-by">
      <span>
        {isSponsor ? (
          <>Everyone’s chatting on <b>your</b> key. Thanks show up in your notifications.</>
        ) : (
          <>
            Free thanks to <b>@{sponsor.username}</b>’s key
          </>
        )}
      </span>
      <ThankButton compact />
    </div>
  );
}
