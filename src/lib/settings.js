import { local } from './storage.js';

/* global __CHARCOAL_SANDBOXED__ */
export const SANDBOXED = typeof __CHARCOAL_SANDBOXED__ !== 'undefined' && __CHARCOAL_SANDBOXED__;

const SETTINGS_KEY = 'charcoal:settings';

const env = import.meta.env || {};
export const ENV_KEY = (env.VITE_DEEPSEEK_API_KEY || '').trim();
const ENV_MODEL = (env.VITE_DEEPSEEK_MODEL || '').trim();
const ENV_BASE = (env.VITE_DEEPSEEK_BASE_URL || '').trim();

// api.deepseek.com answers CORS preflights for browser origins, so the app calls it directly.
// Set the base URL to "/deepseek/v1" to route through the optional Vite proxy instead.
export const DEFAULT_BASE_URL = ENV_BASE || 'https://api.deepseek.com/v1';

// DeepSeek serves V4.1-Flash (the vision-capable model) under the ID "deepseek-flash".
export const DEFAULT_MODEL = ENV_MODEL || 'deepseek-flash';

// Hard cap on swipes per message (initial batch + one-at-a-time regenerations).
export const MAX_SWIPES = 40;

// IDs known to accept image input on api.deepseek.com (legacy aliases route to V4.1-Flash).
export const VISION_MODELS = ['deepseek-flash', 'deepseek-v4-flash', 'deepseek-v4-flash-vision-exp'];

export const DEFAULT_SETTINGS = {
  apiKey: '',
  model: DEFAULT_MODEL,
  baseUrl: '', // empty = DEFAULT_BASE_URL
  thinking: false, // DeepSeek defaults thinking ON; temperature is ignored when it's on
  repliesPerMessage: 3, // parallel drafts per new message, browsable as swipes
  maxTokensScale: 1,
  lastCheck: null, // { ok, at, message }
};

export function loadSettings() {
  const saved = local.get(SETTINGS_KEY, {}) || {};
  return { ...DEFAULT_SETTINGS, ...saved };
}

export function saveSettings(settings) {
  return local.set(SETTINGS_KEY, settings);
}

export function effectiveKey(settings) {
  if (SANDBOXED) return '';
  return (settings.apiKey || '').trim() || ENV_KEY;
}

export function effectiveBaseUrl(settings) {
  return ((settings.baseUrl || '').trim() || DEFAULT_BASE_URL).replace(/\/+$/, '');
}

export function providerStatus(settings, hostAI = 'none') {
  if (SANDBOXED) {
    if (hostAI === 'ready')
      return { mode: 'live', provider: 'claude', label: 'Claude', short: 'Claude', detail: 'Built into this page' };
    if (hostAI === 'pending')
      return { mode: 'unverified', provider: 'claude', label: 'Connecting', short: 'Connecting…', detail: 'Starting Claude' };
    return { mode: 'demo', provider: 'demo', label: 'Demo replies', short: 'Demo replies', detail: 'Claude unavailable here' };
  }
  const key = effectiveKey(settings);
  if (!key) return { mode: 'demo', provider: 'demo', label: 'Demo replies', short: 'Demo replies', detail: 'No API key' };
  const source = settings.apiKey ? 'saved key' : '.env key';
  const base = { provider: 'deepseek', label: 'DeepSeek', short: settings.model, source };
  if (settings.lastCheck && !settings.lastCheck.ok) {
    return { ...base, mode: 'error', detail: settings.lastCheck.message || 'Last check failed' };
  }
  return { ...base, mode: settings.lastCheck?.ok ? 'live' : 'unverified', detail: settings.model };
}

export function supportsVision(model) {
  return VISION_MODELS.includes((model || '').trim());
}
