// Snap a rough AI bounding box onto the real edge of a round avatar.
// Vision models are only roughly right with coordinates (often 5-15% off), but avatars on most chat apps are
// drawn as circles with a hard edge, so we search near the guess for the circle with the strongest edge.
// Pure canvas math, no dependencies. Returns a square crop {cx, cy, s} (see cropRect) or null if nothing convincing.

const WORK = 480; // analysis size (longest side)
const SAMPLES = 120; // points around each candidate circle

function grayscale(img) {
  const W = img.naturalWidth || img.width;
  const H = img.naturalHeight || img.height;
  const k = Math.min(1, WORK / Math.max(W, H));
  const w = Math.max(8, Math.round(W * k));
  const h = Math.max(8, Math.round(H * k));
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, w, h);
  const d = ctx.getImageData(0, 0, w, h).data;
  const g = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) g[i] = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2];
  return { g, w, h, W, H };
}

function gradients({ g, w, h }) {
  const gx = new Float32Array(w * h);
  const gy = new Float32Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      // Sobel
      gx[i] = g[i - w + 1] + 2 * g[i + 1] + g[i + w + 1] - g[i - w - 1] - 2 * g[i - 1] - g[i + w - 1];
      gy[i] = g[i + w - 1] + 2 * g[i + w] + g[i + w + 1] - g[i - w - 1] - 2 * g[i - w] - g[i - w + 1];
    }
  }
  return { gx, gy };
}

const COS = Float32Array.from({ length: SAMPLES }, (_, i) => Math.cos((i / SAMPLES) * Math.PI * 2));
const SIN = Float32Array.from({ length: SAMPLES }, (_, i) => Math.sin((i / SAMPLES) * Math.PI * 2));

/** Edge score: how strongly and how consistently the image changes across this circle's rim. */
function score(G, w, h, cx, cy, r) {
  let sum = 0;
  let inside = 0;
  let strong = 0;
  for (let i = 0; i < SAMPLES; i++) {
    const x = Math.round(cx + r * COS[i]);
    const y = Math.round(cy + r * SIN[i]);
    if (x < 1 || y < 1 || x >= w - 1 || y >= h - 1) continue;
    inside++;
    const j = y * w + x;
    const radial = Math.abs(G.gx[j] * COS[i] + G.gy[j] * SIN[i]);
    sum += radial;
    if (radial > 60) strong++;
  }
  if (inside < SAMPLES * 0.85) return -1; // circle runs off the image
  // Mean edge strength, weighted by how much of the rim is a real edge (a full ring beats one loud line).
  return (sum / inside) * (strong / inside);
}

export function snapCircle(img, box) {
  if (!img || !box) return null;
  const base = grayscale(img);
  const { w, h, W, H } = base;
  const G = gradients(base);

  const c0x = (box.x + box.w / 2) * w;
  const c0y = (box.y + box.h / 2) * h;
  const r0 = ((box.w * w + box.h * h) / 4) || 10;
  if (r0 < 6) return null;

  // Coarse search around the guess, then a fine pass around the winner.
  let best = { s: -1, cx: c0x, cy: c0y, r: r0 };
  const reach = r0 * 0.3;
  const step = Math.max(1, r0 * 0.04);
  for (let dy = -reach; dy <= reach; dy += step) {
    for (let dx = -reach; dx <= reach; dx += step) {
      for (let rr = r0 * 0.7; rr <= r0 * 1.35; rr += Math.max(1, r0 * 0.02)) {
        const s = score(G, w, h, c0x + dx, c0y + dy, rr);
        if (s > best.s) best = { s, cx: c0x + dx, cy: c0y + dy, r: rr };
      }
    }
  }
  const coarse = best;
  for (let dy = -step; dy <= step; dy += 0.5) {
    for (let dx = -step; dx <= step; dx += 0.5) {
      for (let dr = -2; dr <= 2; dr += 0.5) {
        const s = score(G, w, h, coarse.cx + dx, coarse.cy + dy, coarse.r + dr);
        if (s > best.s) best = { s, cx: coarse.cx + dx, cy: coarse.cy + dy, r: coarse.r + dr };
      }
    }
  }

  // Only trust it if the winning rim is clearly an edge (not just noise around a photo).
  if (best.s < 40) return null;

  const k = W / w; // back to full-res pixels
  const side = 2 * best.r * k * 0.965; // tuck just inside the rim so no background ring shows
  return {
    cx: (best.cx * k) / W,
    cy: (best.cy * k) / H,
    s: Math.min(1, side / Math.min(W, H)),
    snapped: true,
    confidence: best.s,
  };
}
