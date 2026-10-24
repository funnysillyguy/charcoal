// Port a character you already made on another platform: screenshots in, filled-in character out.
// The AI transcribes what's visible (no rewriting) and finds the avatar so it can be cropped.
import { useEffect, useRef, useState } from 'react';
import { Check, ImagePlus, Loader, Move, ScanText, X } from 'lucide-react';
import { useUI } from './ui.jsx';
import { Markdown } from '../lib/markdown.jsx';
import { useSettings } from '../lib/store.jsx';
import { prepareImage, imageFilesFrom, loadImage, cropRect, cropSquare, boxToCrop } from '../lib/images.js';
import { readScreenshots } from '../lib/assist.js';
import { consume, estimateTokens } from '../lib/fuel.js';
import { fillNames } from '../lib/format.js';
import '../styles/port.css';

const SLOTS = [
  { id: 'profile', label: 'Profile page', hint: 'Name, tagline, description, creator' },
  { id: 'greeting', label: 'Greeting', hint: 'The chat with their first message' },
  { id: 'image', label: 'Character image', hint: 'Optional, sharper avatar' },
];

function Slot({ slot, shot, onPick, onClear }) {
  const ref = useRef(null);
  return (
    <div className={`port-slot ${shot ? 'filled' : ''}`}>
      <button type="button" className="port-slot-btn" onClick={() => ref.current?.click()} aria-label={`Add ${slot.label}`}>
        {shot ? (
          <img src={shot.dataUrl} alt={slot.label} />
        ) : (
          <span className="port-slot-empty">
            <ImagePlus size={20} />
          </span>
        )}
      </button>
      {shot && (
        <button type="button" className="attachment-remove" onClick={onClear} aria-label={`Remove ${slot.label}`}>
          <X size={12} />
        </button>
      )}
      <span className="port-slot-label">{slot.label}</span>
      <span className="port-slot-hint">{slot.hint}</span>
      <input
        ref={ref}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (f) onPick(f);
        }}
      />
    </div>
  );
}

/** Tap the screenshot to move the square, slider to zoom. */
function CropEditor({ src, crop, onChange }) {
  const [dims, setDims] = useState(null);
  const canvasRef = useRef(null);
  const imgRef = useRef(null);

  useEffect(() => {
    let alive = true;
    loadImage(src).then((img) => {
      if (!alive) return;
      imgRef.current = img;
      setDims({ W: img.naturalWidth, H: img.naturalHeight });
    });
    return () => {
      alive = false;
    };
  }, [src]);

  useEffect(() => {
    const img = imgRef.current;
    const c = canvasRef.current;
    if (!img || !c || !dims) return;
    const { sx, sy, side } = cropRect(dims.W, dims.H, crop);
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.drawImage(img, sx, sy, side, side, 0, 0, c.width, c.height);
  }, [crop, dims]);

  if (!dims) return <div className="port-crop loading" />;
  const r = cropRect(dims.W, dims.H, crop);

  return (
    <div className="port-crop">
      <div
        className="port-stage"
        style={
          dims.W >= dims.H
            ? { width: '100%', aspectRatio: `${dims.W} / ${dims.H}` }
            : { height: 'min(340px, 60vh)', aspectRatio: `${dims.W} / ${dims.H}` }
        }
        onClick={(e) => {
          const b = e.currentTarget.getBoundingClientRect();
          onChange({ ...crop, cx: (e.clientX - b.left) / b.width, cy: (e.clientY - b.top) / b.height });
        }}
        role="presentation"
      >
        <img src={src} alt="" />
        <span
          className="port-box"
          style={{
            left: `${(r.sx / dims.W) * 100}%`,
            top: `${(r.sy / dims.H) * 100}%`,
            width: `${(r.side / dims.W) * 100}%`,
            height: `${(r.side / dims.H) * 100}%`,
          }}
        />
      </div>
      <div className="port-crop-side">
        <canvas ref={canvasRef} width={160} height={160} className="port-preview" aria-label="Avatar preview" />
        <label className="field-hint port-zoom" htmlFor="port-zoom">
          <Move size={13} /> Tap the screenshot to move it, slide to resize
        </label>
        <input
          id="port-zoom"
          className="range"
          type="range"
          min={0.08}
          max={1}
          step={0.01}
          value={crop.s}
          onChange={(e) => onChange({ ...crop, s: Number(e.target.value) })}
          style={{ '--pct': `${((crop.s - 0.08) / 0.92) * 100}%` }}
        />
      </div>
    </div>
  );
}

export default function ScreenshotPort({ onApply, onClose }) {
  const { settings } = useSettings();
  const ui = useUI();
  const [shots, setShots] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const [cropSrc, setCropSrc] = useState(null);
  const [crop, setCrop] = useState({ cx: 0.5, cy: 0.5, s: 1 });
  const [useAvatar, setUseAvatar] = useState(true);
  const ctlRef = useRef(null);
  useEffect(() => () => ctlRef.current?.abort(), []);

  const pick = async (id, file) => {
    try {
      const img = await prepareImage(file);
      setShots((s) => ({ ...s, [id]: img }));
      setResult(null);
      setError('');
    } catch (e) {
      setError(e.message);
    }
  };

  const onPaste = (e) => {
    const files = imageFilesFrom(e.clipboardData);
    if (!files.length) return;
    e.preventDefault();
    const empty = SLOTS.map((s) => s.id).filter((id) => !shots[id]);
    files.slice(0, empty.length).forEach((f, i) => pick(empty[i], f));
  };

  const run = async () => {
    if (!shots.profile && !shots.greeting) {
      setError('Add the profile page or the greeting screenshot first.');
      return;
    }
    ctlRef.current?.abort();
    const ctl = new AbortController();
    ctlRef.current = ctl;
    setBusy(true);
    setError('');
    try {
      const r = await readScreenshots({
        settings,
        shots: Object.fromEntries(Object.entries(shots).map(([k, v]) => [k, v.dataUrl])),
        signal: ctl.signal,
      });
      consume(estimateTokens([r.description, r.greeting, r.personality].join(' ')) + 120);
      setResult(r);
      const source = r.avatar ? shots[r.avatar.source] : shots.image;
      if (source) {
        const img = await loadImage(source.dataUrl);
        setCropSrc(source.dataUrl);
        setCrop(boxToCrop(img.naturalWidth, img.naturalHeight, r.avatar?.box || null));
        setUseAvatar(true);
      } else {
        setCropSrc(null);
        setUseAvatar(false);
      }
    } catch (e) {
      if (e?.name !== 'AbortError') setError(e?.message || 'Couldn’t read the screenshots. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const apply = async () => {
    if (!result) return;
    let avatar = null;
    if (useAvatar && cropSrc) {
      try {
        avatar = { kind: 'image', src: await cropSquare(cropSrc, crop) };
      } catch {
        avatar = null;
      }
    }
    const persona = [result.description, result.personality].filter(Boolean).join('\n\n');
    onApply({
      name: result.name,
      tagline: result.tagline,
      description: result.description,
      greetings: [result.greeting || ''],
      persona,
      tags: result.tags.join(', '),
      category: result.category,
      ...(result.creator ? { creator: result.creator } : {}),
      ...(avatar ? { avatar } : {}),
      visibility: 'private',
    });
    ui.toast(`Ported ${result.name || 'your character'}${result.platform ? ` from ${result.platform}` : ''}`, 'ok');
  };

  return (
    <section className="helper port" onPaste={onPaste}>
      <header className="helper-head">
        <span className="help-tile">
          <ScanText size={16} />
        </span>
        <div>
          <h3>Port from screenshots</h3>
          <p>Bring over a character you made on another app. Add screenshots of its page and greeting, and the text gets copied in exactly as written.</p>
        </div>
        <button type="button" className="icon-btn sm port-close" onClick={onClose} aria-label="Close">
          <X size={16} />
        </button>
      </header>

      <div className="port-slots">
        {SLOTS.map((slot) => (
          <Slot
            key={slot.id}
            slot={slot}
            shot={shots[slot.id]}
            onPick={(f) => pick(slot.id, f)}
            onClear={() => setShots((s) => ({ ...s, [slot.id]: undefined }))}
          />
        ))}
      </div>

      <div className="helper-row">
        <span className="field-hint">You can also paste screenshots here.</span>
        <span style={{ flex: 1 }} />
        <button type="button" className="btn btn-primary btn-sm" onClick={run} disabled={busy}>
          {busy ? <Loader size={14} className="spin" /> : <ScanText size={14} />}
          {result ? 'Read again' : 'Read screenshots'}
        </button>
      </div>

      {error && <p className="field-error">{error}</p>}
      {busy && !result && (
        <div className="helper-skeleton" aria-label="Reading">
          <span />
          <span />
          <span />
        </div>
      )}

      {result && (
        <div className={`helper-result ${busy ? 'stale' : ''}`}>
          <div className="port-summary">
            <strong>{result.name || 'Unnamed'}</strong>
            {result.creator && <span>by @{result.creator}</span>}
            {result.platform && <span className="chip">{result.platform}</span>}
          </div>
          {result.tagline && <p className="helper-tagline">{result.tagline}</p>}
          {result.description && <p className="port-desc">{result.description}</p>}
          {result.greeting && (
            <div className="helper-greeting">
              <Markdown text={fillNames(result.greeting, { char: result.name || 'them', user: 'you' })} />
            </div>
          )}

          {cropSrc && (
            <>
              <label className="check-label">
                <input type="checkbox" checked={useAvatar} onChange={(e) => setUseAvatar(e.target.checked)} />
                Use this as the profile picture
              </label>
              {useAvatar && <CropEditor src={cropSrc} crop={crop} onChange={setCrop} />}
            </>
          )}

          <div className="helper-actions">
            <span className="field-hint">Saved as Private. Check everything before you publish it.</span>
            <button type="button" className="btn btn-glow btn-sm" onClick={apply} disabled={busy}>
              <Check size={14} /> Use this
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
