export function formatCount(n) {
  const v = Number(n) || 0;
  if (v >= 1e9) return `${trim(v / 1e9)}b`;
  if (v >= 1e6) return `${trim(v / 1e6)}m`;
  if (v >= 1e3) return `${trim(v / 1e3)}k`;
  return String(v);
}

function trim(x) {
  return x >= 100 ? Math.round(x).toString() : x.toFixed(1).replace(/\.0$/, '');
}

export function relativeTime(ts, now = Date.now()) {
  if (!ts) return '';
  const s = Math.max(0, Math.round((now - ts) / 1000));
  if (s < 45) return 'now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.round(h / 24);
  if (d < 7) return `${d}d`;
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function fillNames(text, { user, char }) {
  return String(text || '')
    .replace(/\{\{\s*user\s*\}\}/gi, user || 'you')
    .replace(/\{\{\s*char\s*\}\}/gi, char || 'Character');
}

/** Plain-text preview for sidebars and exports. */
export function stripMarkdown(text) {
  return String(text || '')
    .replace(/```[\s\S]*?(```|$)/g, ' [code] ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/_([^_]+)_/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

export function formatBytes(b) {
  if (b >= 1024 * 1024) return `${(b / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(b / 1024))} KB`;
}

export function firstName(name) {
  return String(name || '').split(/\s+/)[0] || name;
}
