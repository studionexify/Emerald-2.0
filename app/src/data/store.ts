/** Local persistence: every list is a signal saved to this device. Phase 2 swaps the save/load for the API. */
import { effect, signal, type Signal } from "@preact/signals";

const PREFIX = "emerald:";
export function persisted<T>(key: string, init: T): Signal<T> {
  let v = init;
  try { const raw = localStorage.getItem(PREFIX + key); if (raw) v = JSON.parse(raw); } catch {}
  const s = signal<T>(v);
  effect(() => { const val = s.value; try { localStorage.setItem(PREFIX + key, JSON.stringify(val)); } catch {} });
  return s;
}
export function resetAll() {
  try { Object.keys(localStorage).filter((k) => k.startsWith(PREFIX)).forEach((k) => localStorage.removeItem(k)); } catch {}
  location.reload();
}
export const uid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2));
export const today = () => new Date().toISOString().slice(0, 10);
export const nowStamp = () => new Date().toISOString().slice(0, 16).replace("T", " ");
