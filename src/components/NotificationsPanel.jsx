// Notification center (opened from the sidebar megaphone). Opening it marks everything read.
import { useEffect } from 'react';
import { Heart, Megaphone } from 'lucide-react';
import { Modal } from './ui.jsx';
import { PoweredBy } from './ThankButton.jsx';
import { markAllRead, refreshNotifications, useSocial } from '../lib/social.js';
import { useSession } from '../lib/cloud.js';
import { relativeTime } from '../lib/format.js';

export default function NotificationsPanel({ open, onClose, onSignIn }) {
  const session = useSession();
  const { items, loaded } = useSocial();

  useEffect(() => {
    if (!open || !session) return undefined;
    refreshNotifications().then(() => setTimeout(markAllRead, 900)); // let the unread highlight register first
    return undefined;
  }, [open, session]);

  return (
    <Modal open={open} onClose={onClose} title="Notifications" size="sm">
      {!session ? (
        <div className="notif-empty">
          <Megaphone size={22} />
          <p>Sign in to get notifications.</p>
          <button type="button" className="btn btn-primary btn-sm" onClick={onSignIn}>
            Sign in
          </button>
        </div>
      ) : (
        <div className="notif">
          <PoweredBy />
          {loaded && !items.length ? (
            <div className="notif-empty">
              <Megaphone size={22} />
              <p>Nothing yet. Thanks and announcements show up here.</p>
            </div>
          ) : (
            <ul className="notif-list">
              {items.map((n, i) => (
                <li key={n.id} className={`notif-item ${n.read_at ? '' : 'unread'}`} style={{ '--i': i }}>
                  <span className={`notif-icon ${n.kind}`}>{n.kind === 'thanks' ? <Heart size={16} /> : <Megaphone size={16} />}</span>
                  <div className="notif-text">
                    <p>
                      {n.actor_username && <b>@{n.actor_username} </b>}
                      {n.body}
                      {n.kind === 'thanks' && ' 🧡'}
                    </p>
                    <span>{relativeTime(new Date(n.created_at).getTime())}</span>
                  </div>
                  {!n.read_at && <span className="notif-dot" aria-label="Unread" />}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Modal>
  );
}

/** Red dot on the phone menu button when something's unread (the sidebar badge is hidden in the drawer). */
export function MenuDot() {
  const { unread } = useSocial();
  return unread > 0 ? <span className="menu-dot" aria-hidden="true" /> : null;
}
