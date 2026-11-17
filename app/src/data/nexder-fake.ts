/** An in-memory stand-in for Drive and the preview bucket, used only by automated tests (build with VITE_NEXDER_FAKE=1). */
import type { Backend } from "./nexder";

const files = new Map<string, { blob: Blob; name: string; parent: string; trashed?: boolean }>();
const folders = new Map<string, { name: string; trashed?: boolean }>();
const previews = new Map<string, Blob>();
const LIMIT = 4 * 1024 ** 3;
const usage = () => [...files.values()].reduce((a, f) => a + f.blob.size, 0);
let n = 0;
/* survives reloads (tests only): everything is mirrored into IndexedDB and read back on start */
const IDB = new Promise<IDBDatabase>((ok) => { const r = indexedDB.open("nexder-fake", 1); r.onupgradeneeded = () => r.result.createObjectStore("s"); r.onsuccess = () => ok(r.result); });
const save = async () => { const d = await IDB; d.transaction("s", "readwrite").objectStore("s").put({ files: [...files], folders: [...folders], previews: [...previews], n }, "all"); };
const ready = (async () => { const d = await IDB; const v: any = await new Promise((ok) => { const r = d.transaction("s").objectStore("s").get("all"); r.onsuccess = () => ok(r.result); }); if (v) { v.files.forEach(([k, x]: any) => files.set(k, x)); v.folders.forEach(([k, x]: any) => folders.set(k, x)); v.previews.forEach(([k, x]: any) => previews.set(k, x)); n = v.n; } })();
const gone = () => (window as unknown as { __nexderFail?: string }).__nexderFail;
(window as unknown as { __nexderFake: unknown }).__nexderFake = { files, folders, previews };

const impl: Backend = {
  quota: async () => ({ limit: LIMIT, usage: usage() + ((window as unknown as { __nexderUsed?: number }).__nexderUsed ?? 0) }),
  folder: async (cat, label) => { const id = `fold${++n}${cat}${label}`.replace(/[^A-Za-z0-9]/g, "_"); folders.set(id, { name: `${cat}/${label}` }); return id; },
  async upload(file, folder, onSent, signal) {
    for (let sent = 0; sent < file.size; sent += 262144) { if (signal?.aborted) throw new Error("Upload cancelled"); onSent(Math.min(file.size, sent)); await new Promise((r) => setTimeout(r, 20)); }
    if (gone() === file.name) throw new Error("Network failed");
    const id = `file${++n}_${file.name}`.replace(/[^A-Za-z0-9]/g, "_"); files.set(id, { blob: file, name: file.name, parent: folder }); onSent(file.size); return id;
  },
  links: async (fs) => fs.map((f) => { const x = files.get(f.drive); if (!x || x.trashed) throw new Error("File not found in Drive"); return URL.createObjectURL(x.blob); }),
  trash: async (id, on) => { const f = folders.get(id); if (f) f.trashed = on; for (const x of files.values()) if (x.parent === id) x.trashed = on; },
  purge: async (ids) => { for (const id of ids) { files.delete(id); if (folders.delete(id)) for (const [k, x] of files) if (x.parent === id) files.delete(k); } },
  sweep: async () => 0,
  previewPut: async (id, b) => { previews.set(id, b); },
  previewGet: async (id) => previews.get(id) ?? null,
  previewDel: async (ids) => { ids.forEach((i) => previews.delete(i)); },
};
export const fake: Backend = Object.fromEntries(Object.entries(impl).map(([k, f]) => [k, async (...a: unknown[]) => { await ready; const r = await (f as (...x: unknown[]) => unknown)(...a); await save(); return r; }])) as unknown as Backend;
