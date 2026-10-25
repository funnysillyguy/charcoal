// Port a character from another platform: screenshots in, filled-in character out.
// The AI transcribes exactly (bold/italics kept as Markdown), optionally offers a light rewrite,
// and finds the avatar; we snap the crop to the real circle edge when the avatar is round.
import { useEffect, useRef, useState } from 'react';
import { Check, ImagePlus, Loader, Magnet, ScanText, Sparkles, X } from 'lucide-react';
import { useUI } from './ui.jsx';
import { Markdown } from '../lib/markdown.jsx';
import { useSettings } from '../lib/store.jsx';
import { prepareImage, imageFilesFrom, loadImage, cropRect, cropSquare, boxToCrop, uid } from '../lib/images.js';
import { snapCircle } from '../lib/snap.js';
import { readScreenshots, PORT_MAX_SHOTS } from '../lib/assist.js';
import { fillNames } from '../lib/format.js';
import '../styles/port.css';

/** Drag (or tap) the screenshot to move the square, slider to resize. */
function CropEditor({ src, crop, onChange, circle }) {
  const [dims, setDims] = useState(null);
  const canvasRef = useRef(null);
  const imgRef = useRef(null);
  const dragRef = useRef(null);

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

  const pointTo = (e, rect) => ({ cx: (e.clientX - rect.left) / rect.width, cy: (e.clientY - rect.top) / rect.height });
  const onDown = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    const p = pointTo(e, rect);
    // Grab the box where you touched it, so dragging doesn't jump.
    const box = { x: r.sx / dims.W, y: r.sy / dims.H, w: r.side / dims.W, h: r.side / dims.H };
    const inside = p.cx >= box.x && p.cx <= box.x + box.w && p.cy >= box.y && p.cy <= box.y + box.h;
    const center = { cx: box.x + box.w / 2, cy: box.y + box.h / 2 };
    dragRef.current = { rect, off: inside ? { x: center.cx - p.cx, y: center.cy - p.cy } : { x: 0, y: 0 } };
    if (!inside) onChange({ ...crop, cx: p.cx, cy: p.cy, snapped: false });
  };
  const onMove = (e) => {
    const d = dragRef.current;
    if (!d) return;
    const p = pointTo(e, d.rect);
    onChange({ ...crop, cx: p.cx + d.off.x, cy: p.cy + d.off.y, snapped: false });
  };
  const onUp = () => {
    dragRef.current = null;
  };

  return (
    <div className="port-crop">
      <div
        className="port-stage"
        style={
          dims.W >= dims.H
            ? { width: '100%', aspectRatio: `${dims.W} / ${dims.H}` }
            : { height: 'min(360px, 62vh)', aspectRatio: `${dims.W} / ${dims.H}` }
        }
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        role="presentation"
      >
        <img src={src} alt="" draggable={false} />
        <span
          className={`port-box ${circle ? 'round' : ''} ${crop.snapped ? 'snapped' : ''}`}
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
        {crop.snapped && (
          <span className="chip snap-chip">
            <Magnet size={12} /> Snapped to the avatar edge
          </span>
        )}
        <label className="field-hint port-zoom" htmlFor="port-zoom">
          Drag to move · slide to resize
        </label>
        <input
          id="port-zoom"
          className="range"
          type="range"
          min={0.08}
          max={1}
          step={0.005}
          value={crop.s}
          onChange={(e) => onChange({ ...crop, s: Number(e.target.value), snapped: false })}
          style={{ '--pct': `${((crop.s - 0.08) / 0.92) * 100}%` }}
        />
      </div>
    </div>
  );
}

export default function ScreenshotPort({ onApply, onClose }) {
  const { settings } = useSettings();
  const ui = useUI();
  const [shots, setShots] = useState([]); // [{ id, dataUrl }]
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const [useImproved, setUseImproved] = useState(true);
  const [cropSrc, setCropSrc] = useState(null);
  const [crop, setCrop] = useState({ cx: 0.5, cy: 0.5, s: 1 });
  const [circle, setCircle] = useState(false);
  const [useAvatar, setUseAvatar] = useState(true);
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef(null);
  const ctlRef = useRef(null);
  useEffect(() => () => ctlRef.current?.abort(), []);

  const add = async (files) => {
    const room = PORT_MAX_SHOTS - shots.length;
    if (room <= 0) {
      setError(`Up to ${PORT_MAX_SHOTS} screenshots.`);
      return;
    }
    const picked = [...files].slice(0, room);
    try {
      const prepared = await Promise.all(picked.map((f) => prepareImage(f)));
      setShots((s) => [...s, ...prepared.map((p) => ({ id: uid('shot'), dataUrl: p.dataUrl }))].slice(0, PORT_MAX_SHOTS));
      setError(files.length > room ? `Only the first ${PORT_MAX_SHOTS} screenshots are used.` : '');
    } catch (e) {
      setError(e.message);
    }
  };

  const onPaste = (e) => {
    const files = imageFilesFrom(e.clipboardData);
    if (!files.length) return;
    e.preventDefault();
    add(files);
  };

  const run = async () => {
    if (!shots.length) {
      setError('Add screenshots of the profile page and the greeting first.');
      return;
    }
    ctlRef.current?.abort();
    const ctl = new AbortController();
    ctlRef.current = ctl;
    setBusy(true);
    setError('');
    try {
      const r = await readScreenshots({ settings, shots: shots.map((s) => s.dataUrl), signal: ctl.signal });
      setResult(r);
      setUseImproved(Object.keys(r.improved).length > 0);
      if (r.avatar) {
        const src = shots[r.avatar.index].dataUrl;
        const img = await loadImage(src);
        let next = boxToCrop(img.naturalWidth, img.naturalHeight, r.avatar.box);
        const round = r.avatar.shape === 'circle';
        if (round) {
          const snapped = snapCircle(img, r.avatar.box);
          if (snapped) next = snapped;
        }
        setCropSrc(src);
        setCrop(next);
        setCircle(round);
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

  const hasImproved = !!result && Object.keys(result.improved).length > 0;
  const view = result ? (useImproved && hasImproved ? { ...result, ...result.improved } : result) : null;

  const apply = async () => {
    if (!view) return;
    let avatar = null;
    if (useAvatar && cropSrc) {
      try {
        avatar = { kind: 'image', src: await cropSquare(cropSrc, crop, 320, { circle: circle && crop.snapped }) };
      } catch {
        avatar = null;
      }
    }
    onApply({
      name: view.name,
      tagline: view.tagline,
      description: view.description,
      greetings: [view.greeting || ''],
      persona: view.personality || view.description,
      tags: view.tags.join(', '),
      category: view.category,
      ...(view.creator ? { creator: view.creator } : {}),
      ...(avatar ? { avatar } : {}),
      visibility: 'private',
    });
    ui.toast(`Ported ${view.name || 'your character'}${view.platform ? ` from ${view.platform}` : ''}`, 'ok');
  };

  return (
    <section className="helper port" onPaste={onPaste}>
      <header className="helper-head">
        <span className="help-tile">
          <ScanText size={16} />
        </span>
        <div>
          <h3>Port from screenshots</h3>
          <p>Bring a character over from another app. Add the profile page, the greeting, and (tap the avatar first) the zoomed-in picture.</p>
        </div>
        <button type="button" className="icon-btn sm port-close" onClick={onClose} aria-label="Close">
          <X size={16} />
        </button>
      </header>

      <div
        className={`port-drop ${dragging ? 'over' : ''} ${shots.length ? 'has' : ''}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          add(imageFilesFrom(e.dataTransfer));
        }}
      >
        {shots.map((s, i) => (
          <div className="port-thumb" key={s.id}>
            <img src={s.dataUrl} alt={`Screenshot ${i + 1}`} />
            <span className="port-thumb-n">{i + 1}</span>
            <button
              type="button"
              className="attachment-remove"
              onClick={() => {
                setShots((all) => all.filter((x) => x.id !== s.id));
                setResult(null);
              }}
              aria-label={`Remove screenshot ${i + 1}`}
            >
              <X size={12} />
            </button>
          </div>
        ))}
        {shots.length < PORT_MAX_SHOTS && (
          <button type="button" className="port-add" onClick={() => fileRef.current?.click()}>
            <ImagePlus size={22} />
            <span>{shots.length ? 'Add more' : 'Add screenshots'}</span>
            {!shots.length && <small>or drop / paste them here · up to {PORT_MAX_SHOTS}</small>}
          </button>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          multiple
          hidden
          onChange={(e) => {
            const f = [...(e.target.files || [])];
            e.target.value = '';
            if (f.length) add(f);
          }}
        />
      </div>

      <div className="helper-row">
        <span className="field-hint">Bold and italics carry over. Long greetings? Add each scrolled screenshot.</span>
        <span style={{ flex: 1 }} />
        <button type="button" className="btn btn-primary btn-sm" onClick={run} disabled={busy || !shots.length}>
          {busy ? <Loader size={14} className="spin" /> : <ScanText size={14} />}
          {busy ? 'Reading…' : result ? 'Read again' : 'Read screenshots'}
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

      {view && (
        <div className={`helper-result ${busy ? 'stale' : ''}`}>
          <div className="port-summary">
            <strong>{view.name || 'Unnamed'}</strong>
            {view.creator && <span>by @{view.creator}</span>}
            {view.platform && <span className="chip">{view.platform}</span>}
          </div>

          {hasImproved && (
            <div className="port-version">
              <div className="segmented" role="radiogroup" aria-label="Which version">
                <button type="button" role="radio" aria-checked={!useImproved} className={!useImproved ? 'active' : ''} onClick={() => setUseImproved(false)}>
                  Original
                </button>
                <button type="button" role="radio" aria-checked={useImproved} className={useImproved ? 'active' : ''} onClick={() => setUseImproved(true)}>
                  <Sparkles size={13} /> Improved
                </button>
              </div>
              <span className="field-hint">{result.improvedNote || 'Light edits for clarity. Same voice and facts.'}</span>
            </div>
          )}

          {view.tagline && <p className="helper-tagline">{view.tagline}</p>}
          {view.description && (
            <div className="port-desc">
              <Markdown text={view.description} />
            </div>
          )}
          {view.greeting && (
            <div className="helper-greeting port-greeting">
              <Markdown text={fillNames(view.greeting, { char: view.name || 'them', user: 'you' })} />
            </div>
          )}

          {cropSrc && (
            <>
              <label className="check-label">
                <input type="checkbox" checked={useAvatar} onChange={(e) => setUseAvatar(e.target.checked)} />
                Use this as the profile picture
              </label>
              {useAvatar && <CropEditor src={cropSrc} crop={crop} onChange={setCrop} circle={circle} />}
            </>
          )}

          <div className="helper-actions">
            <span className="field-hint">Saved as Private, creator credit kept. Check it before you publish.</span>
            <button type="button" className="btn btn-glow btn-sm" onClick={apply} disabled={busy}>
              <Check size={14} /> Use this
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
