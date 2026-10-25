// Fuel tank: every reply the AI writes uses one (parallel drafts, swipes and regenerations included).
// After 100 replies, chat pauses for a 25-second break, then the tank is full again.
// Stored per browser so a reload mid-refuel keeps counting down.
import { useSyncExternalStore } from 'react';
import { local } from './storage.js';

const KEY = 'charcoal:fuel';
export const DEFAULT_CAPACITY = 100; // replies
export const REFUEL_MS = 25_000;
export const CODE_COST = 3; // a reply that contains code counts as 3 replies (the server also counts its tokens 3x)
const VERSION = 3; // bump when the defaults change so old saved tanks reset to them

let state = normalize(local.get(KEY, null));
const listeners = new Set();
let timer = null;

function normalize(s) {
  if (!s || s.v !== VERSION) return { v: VERSION, used: 0, capacity: DEFAULT_CAPACITY, refuelStartedAt: null };
  return {
    v: VERSION,
    used: Math.max(0, Number(s?.used) || 0),
    capacity: Math.max(1, Number(s?.capacity) || DEFAULT_CAPACITY),
    refuelStartedAt: s?.refuelStartedAt || null,
  };
}

function commit(next) {
  state = next;
  local.set(KEY, state);
  listeners.forEach((fn) => fn());
  schedule();
}

function schedule() {
  clearTimeout(timer);
  if (!state.refuelStartedAt) return;
  const left = state.refuelStartedAt + REFUEL_MS - Date.now();
  timer = setTimeout(() => finishIfDue(), Math.max(0, left) + 30);
}

function finishIfDue() {
  if (state.refuelStartedAt && Date.now() - state.refuelStartedAt >= REFUEL_MS) {
    commit({ ...state, used: 0, refuelStartedAt: null });
  }
}

/** Rough output-token estimate when the provider doesn't report counts. */
export function estimateTokens(text) {
  return text ? Math.ceil(text.length / 4) : 0;
}

/** Drain the tank. Negative values correct an earlier estimate. */
export function consume(tokens) {
  if (!tokens || state.refuelStartedAt) return;
  const used = Math.max(0, state.used + tokens);
  commit({ ...state, used, refuelStartedAt: used >= state.capacity ? Date.now() : null });
}

export function isRefueling() {
  finishIfDue();
  return !!state.refuelStartedAt;
}

export function setCapacity(capacity) {
  const cap = Math.max(1, Math.round(Number(capacity) || DEFAULT_CAPACITY));
  commit({ ...state, capacity: cap, refuelStartedAt: state.used >= cap ? state.refuelStartedAt || Date.now() : null });
}

function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function snapshot() {
  return state;
}

export function useFuel() {
  const s = useSyncExternalStore(subscribe, snapshot, snapshot);
  const left = Math.max(0, s.capacity - s.used);
  return { ...s, left, fraction: s.refuelStartedAt ? 0 : left / s.capacity, refueling: !!s.refuelStartedAt };
}

schedule();
