/**
 * Files still waiting for Google Drive, kept on THIS device (IndexedDB) so a closed tab, a refresh or a hard refresh loses nothing.
 * The design record already lists them as "not uploaded"; after a reload Emerald asks to continue and sends them from here.
 * Only the original file is kept, one entry per item, removed once it is in Drive.
 */
export type Pending = { key: string; designId: string; designName: string; itemId: string; kind: "photo" | "file"; name: string; size: number; file: Blob; mime: string };
const DB = "emerald-nexder-pending", ST = "files";
const open = () => new Promise<IDBDatabase | null>((ok) => {
  if (typeof indexedDB === "undefined") return ok(null);
  try { const r = indexedDB.open(DB, 1); r.onupgradeneeded = () => r.result.createObjectStore(ST, { keyPath: "key" }); r.onsuccess = () => ok(r.result); r.onerror = () => ok(null); } catch { ok(null); }
});
const run = async <T>(mode: IDBTransactionMode, f: (s: IDBObjectStore) => IDBRequest<T>): Promise<T | null> => {
  const db = await open(); if (!db) return null;
  return new Promise<T | null>((ok) => { try { const r = f(db.transaction(ST, mode).objectStore(ST)); r.onsuccess = () => { ok(r.result); db.close(); }; r.onerror = () => { ok(null); db.close(); }; } catch { ok(null); db.close(); } });
};
export const pkey = (designId: string, itemId: string) => designId + ":" + itemId;
export const keepFile = (j: { designId: string; designName: string; itemId: string; kind: "photo" | "file"; name: string; size: number; file: File }) =>
  run("readwrite", (s) => s.put({ key: pkey(j.designId, j.itemId), designId: j.designId, designName: j.designName, itemId: j.itemId, kind: j.kind, name: j.name, size: j.size, file: j.file, mime: j.file.type } satisfies Pending));
export const dropFile = (designId: string, itemId: string) => run("readwrite", (s) => s.delete(pkey(designId, itemId)));
export const allPending = async (): Promise<Pending[]> => ((await run("readonly", (s) => s.getAll())) as Pending[] | null) ?? [];
