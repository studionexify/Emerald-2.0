/** Local persistence: every list is a signal saved to this device. Phase 2 swaps the save/load for the API. */
import { effect, signal, type Signal } from "@preact/signals";

const PREFIX = "emerald:";
export function persisted<T>(key: string, init: T): Signal<T> {
  let v = init;
  try { const raw = localStorage.getItem(PREFIX + key); if (raw) v = JSON.parse(raw); } catch {}
  const s = signal<T>(v);
  let first = true;
  effect(() => { const val = s.value; if (first) { first = false; return; } queueSave(key, val); });
  return s;
}
/* Writes are coalesced: many edits in a burst become one save per key, flushed after 250 ms or when the tab hides. */
const dirty = new Map<string, unknown>();
let timer: ReturnType<typeof setTimeout> | 0 = 0;
function flush() {
  timer = 0;
  dirty.forEach((v, k) => { try { localStorage.setItem(PREFIX + k, JSON.stringify(v)); } catch {} });
  dirty.clear();
}
function queueSave(key: string, val: unknown) {
  dirty.set(key, val);
  if (!timer) timer = setTimeout(flush, 250);
}
addEventListener("pagehide", flush);
document.addEventListener("visibilitychange", () => { if (document.hidden) flush(); });
export function resetAll() {
  dirty.clear(); if (timer) clearTimeout(timer);
  try { Object.keys(localStorage).filter((k) => k.startsWith(PREFIX)).forEach((k) => localStorage.removeItem(k)); } catch {}
  location.reload();
}
export const uid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2));
export const today = () => new Date().toISOString().slice(0, 10);
export const nowStamp = () => new Date().toISOString().slice(0, 16).replace("T", " ");
