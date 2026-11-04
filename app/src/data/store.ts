/** Local-first persistence: every list is a signal saved to this device, and (when signed in to the cloud) synced per record. */
import { effect, signal, type Signal } from "@preact/signals";

const PREFIX = "emerald:";
/** Keys that belong to this device only and never leave it. */
const LOCAL_ONLY = new Set(["session", "loginAttempts", "seedv", "sync:outbox", "sync:last"]);

export type Change = { kind: string; id: string; data: unknown; deleted: boolean };
type Sink = (changes: Change[]) => void;
let sink: Sink | null = null;
let applying = false;
const registry = new Map<string, Signal<any>>();
const shadow = new Map<string, unknown>();

export function persisted<T>(key: string, init: T): Signal<T> {
  let v = init;
  try { const raw = localStorage.getItem(PREFIX + key); if (raw) v = JSON.parse(raw); } catch {}
  const s = signal<T>(v);
  registry.set(key, s); shadow.set(key, v);
  let first = true;
  effect(() => {
    const val = s.value;
    if (first) { first = false; return; }
    queueSave(key, val);
    const prev = shadow.get(key); shadow.set(key, val);
    if (!applying && !LOCAL_ONLY.has(key)) { const ch = diff(key, prev, val); if (ch.length) { tabs?.postMessage(ch); sink?.(ch); } }
  });
  return s;
}

const isList = (v: unknown): v is { id: string }[] => Array.isArray(v) && v.every((x) => x && typeof x === "object" && typeof (x as any).id === "string");
/** Lists of {id} sync row by row; anything else syncs as one row named after its key. */
function diff(kind: string, prev: unknown, next: unknown): Change[] {
  if (isList(next) && (prev === undefined || isList(prev))) {
    const before = new Map((prev as { id: string }[] | undefined ?? []).map((r) => [r.id, r]));
    const out: Change[] = [];
    for (const r of next) { const p = before.get(r.id); before.delete(r.id); if (p !== r && JSON.stringify(p) !== JSON.stringify(r)) out.push({ kind, id: r.id, data: r, deleted: false }); }
    before.forEach((r, id) => out.push({ kind, id, data: r, deleted: true }));
    return out;
  }
  return [{ kind, id: "_", data: next, deleted: false }];
}

/** Apply changes that came from another device or tab, without echoing them back out. */
export function applyRemote(changes: Change[]) {
  const byKind = new Map<string, Change[]>();
  for (const c of changes) if (registry.has(c.kind)) (byKind.get(c.kind) ?? byKind.set(c.kind, []).get(c.kind)!).push(c);
  applying = true;
  try {
    byKind.forEach((cs, kind) => {
      const s = registry.get(kind)!;
      if (cs.length === 1 && cs[0].id === "_") { s.value = cs[0].data; return; }
      const cur: any[] = Array.isArray(s.value) ? [...s.value] : [];
      for (const c of cs) {
        const i = cur.findIndex((r) => r?.id === c.id);
        if (c.deleted) { if (i >= 0) cur.splice(i, 1); }
        else if (i >= 0) cur[i] = c.data; else cur.unshift(c.data);
      }
      s.value = cur;
    });
  } finally { applying = false; }
}
export const setSyncSink = (f: Sink | null) => (sink = f);
/** Snapshot of everything syncable, used for the first upload of a device. */
export const allRecords = (): Change[] => [...registry].filter(([k]) => !LOCAL_ONLY.has(k)).flatMap(([k, s]) => diff(k, undefined, s.value));

/* Tabs on the same device stay in step for free. */
const tabs = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel("emerald") : null;
if (tabs) tabs.onmessage = (e) => applyRemote(e.data as Change[]);

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
export const localGet = <T>(k: string, d: T): T => { try { const r = localStorage.getItem(PREFIX + k); return r ? JSON.parse(r) : d; } catch { return d; } };
export const localSet = (k: string, v: unknown) => { try { localStorage.setItem(PREFIX + k, JSON.stringify(v)); } catch {} };
export function resetAll() {
  dirty.clear(); if (timer) clearTimeout(timer);
  try { Object.keys(localStorage).filter((k) => k.startsWith(PREFIX)).forEach((k) => localStorage.removeItem(k)); } catch {}
  location.reload();
}
export const uid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2));
export const today = () => new Date().toISOString().slice(0, 10);
export const nowStamp = () => new Date().toISOString().slice(0, 16).replace("T", " ");
