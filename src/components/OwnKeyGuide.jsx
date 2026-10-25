// "Add your own key" walkthrough: a cursor-following screen recording plus the steps in writing.
import { useRef, useState } from 'react';
import { ExternalLink, KeyRound, Volume2, VolumeX } from './icons.jsx';
import { Modal } from './ui.jsx';

const VIDEO = `${import.meta.env.BASE_URL || './'}guide-own-key.mp4`;

export default function OwnKeyGuide({ open, onClose, onOpenSettings }) {
  const videoRef = useRef(null);
  const [muted, setMuted] = useState(true);
  const toggleSound = () => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = !v.muted;
    if (!v.muted && v.paused) v.play().catch(() => {});
    setMuted(v.muted);
  };
  return (
    <Modal open={open} onClose={onClose} title="Keep chatting with your own key" subtitle="Unlimited, billed to your own DeepSeek account. Watch with sound, it walks you through every tap." size="md">
      <div className="guide">
        <div className="guide-player">
          <video
            ref={videoRef}
            className="guide-video"
            src={VIDEO}
            autoPlay
            muted
            loop
            playsInline
            preload="auto"
            onClick={(e) => (e.currentTarget.paused ? e.currentTarget.play() : e.currentTarget.pause())}
            onVolumeChange={(e) => setMuted(e.currentTarget.muted)}
          />
          <button type="button" className={`guide-sound ${muted ? 'nudge' : ''}`} onClick={toggleSound} aria-label={muted ? 'Turn sound on' : 'Mute'}>
            {muted ? <VolumeX size={15} /> : <Volume2 size={15} />}
            {muted ? 'Tap for sound' : 'Mute'}
          </button>
        </div>
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
