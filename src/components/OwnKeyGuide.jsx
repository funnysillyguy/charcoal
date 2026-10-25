// "Add your own key" walkthrough: a cursor-following screen recording plus the steps in writing.
import { ExternalLink, KeyRound } from 'lucide-react';
import { Modal } from './ui.jsx';

const VIDEO = `${import.meta.env.BASE_URL || './'}guide-own-key.mp4`;

export default function OwnKeyGuide({ open, onClose, onOpenSettings }) {
  return (
    <Modal open={open} onClose={onClose} title="Keep chatting with your own key" subtitle="Unlimited, billed to your own DeepSeek account. Takes about 2 minutes." size="md">
      <div className="guide">
        <video className="guide-video" src={VIDEO} autoPlay muted loop playsInline controls preload="auto" />
        <ol className="guide-steps">
          <li>
            <strong>Get a key from DeepSeek.</strong> Go to{' '}
            <a href="https://platform.deepseek.com/api_keys" target="_blank" rel="noreferrer">
              platform.deepseek.com <ExternalLink size={12} />
            </a>
            , sign up, add a little credit (a couple of dollars lasts a long time), then <em>API keys → Create new API key</em>. Copy
            it. It starts with <code>sk-</code>.
          </li>
          <li>
            <strong>Open Settings</strong> in Charcoal (the gear at the top, or Settings in the menu).
          </li>
          <li>
            <strong>Paste it</strong> into <em>Your own DeepSeek key</em>.
          </li>
          <li>
            <strong>Tap Test connection</strong>, then <strong>Save</strong>.
          </li>
          <li>
            <strong>Chat.</strong> No daily limit now. Your key stays in your browser (and encrypted in your account if you’re
            signed in).
          </li>
        </ol>
        <button
          type="button"
          className="btn btn-primary btn-block"
          onClick={() => {
            onClose();
            onOpenSettings();
          }}
        >
          <KeyRound size={15} /> Open Settings
        </button>
      </div>
    </Modal>
  );
}
