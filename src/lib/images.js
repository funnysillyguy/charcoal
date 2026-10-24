import { useEffect, useState } from 'react';
import { imageStore } from './storage.js';

export const ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
export const MAX_IMAGES_PER_MESSAGE = 4;
const MAX_INPUT_BYTES = 20 * 1024 * 1024; // refuse anything bigger before decoding
const MAX_SIDE = 2048; // DeepSeek rescales to ~1300px anyway; this keeps payloads and storage small
const REENCODE_ABOVE_BYTES = 3 * 1024 * 1024;

const cache = new Map(); // id -> data URL

export function uid(prefix = 'id') {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

function readAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error('Could not read file'));
    reader.readAsDataURL(file);
  });
}

export function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not decode image'));
    img.src = src;
  });
}

export function dataUrlBytes(dataUrl) {
  const i = dataUrl.indexOf(',');
  const b64 = i >= 0 ? dataUrl.slice(i + 1) : dataUrl;
  return Math.floor((b64.length * 3) / 4);
}

export function mimeOf(dataUrl) {
  const m = /^data:([^;,]+)/.exec(dataUrl || '');
  return m ? m[1] : 'application/octet-stream';
}

/**
 * Validate and normalize a user-supplied image into a base64 data URL.
 * Large images are downscaled to MAX_SIDE on the longest edge and re-encoded
 * (JPEG stays JPEG; PNG/WebP become WebP so transparency survives).
 */
export async function prepareImage(file) {
  if (!ACCEPTED_TYPES.includes(file.type)) {
    throw new Error(`${file.name || 'That file'} isn't a PNG, JPEG or WebP image.`);
  }
  if (file.size > MAX_INPUT_BYTES) {
    throw new Error(`${file.name || 'That image'} is over 20 MB. Try a smaller one.`);
  }
  let dataUrl = await readAsDataUrl(file);
  const img = await loadImage(dataUrl);
  let width = img.naturalWidth;
  let height = img.naturalHeight;
  const longest = Math.max(width, height);

  if (longest > MAX_SIDE || file.size > REENCODE_ABOVE_BYTES) {
    const scale = Math.min(1, MAX_SIDE / longest);
    width = Math.round(width * scale);
    height = Math.round(height * scale);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, width, height);
    const target = file.type === 'image/jpeg' ? 'image/jpeg' : 'image/webp';
    const out = canvas.toDataURL(target, 0.88);
    // Some browsers can't encode WebP and silently return PNG; mimeOf() reads the real type.
    if (out && out.startsWith('data:image/')) dataUrl = out;
  }

  return {
    id: uid('img'),
    dataUrl,
    mime: mimeOf(dataUrl),
    name: file.name || 'pasted-image',
    width,
    height,
    bytes: dataUrlBytes(dataUrl),
  };
}

export async function saveImage(id, dataUrl) {
  cache.set(id, dataUrl);
  await imageStore.set(id, dataUrl);
}

export async function getImage(id) {
  if (cache.has(id)) return cache.get(id);
  const value = await imageStore.get(id);
  if (value) cache.set(id, value);
  return value || null;
}

export async function deleteImages(ids) {
  for (const id of ids) {
    cache.delete(id);
    await imageStore.del(id);
  }
}

/** React hook: resolve a stored image id to a data URL. */
export function useImageUrl(id) {
  const [url, setUrl] = useState(() => cache.get(id) || null);
  useEffect(() => {
    let alive = true;
    if (!id) return undefined;
    if (cache.has(id)) {
      setUrl(cache.get(id));
      return undefined;
    }
    getImage(id).then((v) => alive && setUrl(v));
    return () => {
      alive = false;
    };
  }, [id]);
  return url;
}

/** Pull image files out of a paste or drop event. */
export function imageFilesFrom(dataTransfer) {
  if (!dataTransfer) return [];
  const files = [];
  if (dataTransfer.items && dataTransfer.items.length) {
    for (const item of dataTransfer.items) {
      if (item.kind === 'file' && item.type.startsWith('image/')) {
        const f = item.getAsFile();
        if (f) files.push(f);
      }
    }
  } else if (dataTransfer.files) {
    for (const f of dataTransfer.files) if (f.type.startsWith('image/')) files.push(f);
  }
  return files;
}

/** Downscale an avatar upload to a small square-ish JPEG so it fits comfortably in storage. */
export async function prepareAvatar(file) {
  if (!ACCEPTED_TYPES.includes(file.type)) throw new Error('Avatars must be PNG, JPEG or WebP.');
  const src = await readAsDataUrl(file);
  const img = await loadImage(src);
  const size = 320;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const s = Math.min(img.naturalWidth, img.naturalHeight);
  const sx = (img.naturalWidth - s) / 2;
  const sy = (img.naturalHeight - s) / 2;
  ctx.drawImage(img, sx, sy, s, s, 0, 0, size, size);
  return canvas.toDataURL('image/jpeg', 0.86);
}

/**
 * Square crop for avatars. crop = { cx, cy, s }: center as fractions of width/height,
 * side as a fraction of the image's shorter edge. Clamped so the square stays inside.
 */
export function cropRect(W, H, { cx, cy, s }) {
  const side = Math.max(8, Math.min(1, s) * Math.min(W, H));
  const sx = Math.max(0, Math.min(W - side, cx * W - side / 2));
  const sy = Math.max(0, Math.min(H - side, cy * H - side / 2));
  return { sx, sy, side };
}

export async function cropSquare(src, crop, size = 320, { circle = false } = {}) {
  const img = await loadImage(src);
  const { sx, sy, side } = cropRect(img.naturalWidth, img.naturalHeight, crop);
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d', { willReadFrequently: circle });
  ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size);
  if (circle) fillOutsideCircle(ctx, size);
  return canvas.toDataURL('image/jpeg', 0.88);
}

/**
 * A round avatar cut from a screenshot has whatever was behind it in the square's corners.
 * Replace the corners by stretching the circle's own edge colors outward, then soften them.
 */
function fillOutsideCircle(ctx, n) {
  const rim = (n / 2) * 0.985;
  const c = (n - 1) / 2;
  const img = ctx.getImageData(0, 0, n, n);
  const d = img.data;
  const src = new Uint8ClampedArray(d);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const dx = x - c;
      const dy = y - c;
      const dist = Math.hypot(dx, dy);
      if (dist <= rim) continue;
      const sx = Math.min(n - 1, Math.max(0, Math.round(c + (rim * dx) / dist)));
      const sy = Math.min(n - 1, Math.max(0, Math.round(c + (rim * dy) / dist)));
      const i = (y * n + x) * 4;
      const j = (sy * n + sx) * 4;
      d[i] = src[j];
      d[i + 1] = src[j + 1];
      d[i + 2] = src[j + 2];
    }
  }
  ctx.putImageData(img, 0, 0);
  try {
    const t = document.createElement('canvas');
    t.width = n;
    t.height = n;
    const tc = t.getContext('2d');
    tc.filter = 'blur(6px)';
    tc.drawImage(ctx.canvas, 0, 0);
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, n, n);
    ctx.arc(n / 2, n / 2, rim, 0, Math.PI * 2, true);
    ctx.clip('evenodd');
    ctx.drawImage(t, 0, 0);
    ctx.restore();
  } catch {
    /* no canvas filter support: corners stay unblurred, still fine */
  }
}

/** Turn a normalized bounding box {x, y, w, h} into a square crop around it. */
export function boxToCrop(W, H, box) {
  if (!box) return { cx: 0.5, cy: 0.5, s: 1 };
  const side = Math.max(box.w * W, box.h * H) * 1.04;
  return {
    cx: Math.min(1, Math.max(0, box.x + box.w / 2)),
    cy: Math.min(1, Math.max(0, box.y + box.h / 2)),
    s: Math.min(1, Math.max(0.08, side / Math.min(W, H))),
  };
}
