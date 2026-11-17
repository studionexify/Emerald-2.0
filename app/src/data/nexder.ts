/**
 * Nexder: the studio's library of designs (photos + any files such as STL, 3MF, STEP).
 *
 * Records (designs, categories, shares) hold only metadata and ONE tiny inline cover. Original photos, the small preview
 * copies and design files are blobs behind `blobStore`.
 * Signed in to the cloud: every blob is also sent to Google Drive through the drive-media Edge Function (the same pipeline
 * as order photos, see data/media.ts and supabase/DRIVE-SETUP.md). The Drive file id is kept in the synced `mediaSig`, so
 * other devices can fetch it. Originals are always downloaded from Drive; this device keeps a cache for the small previews.
 * Without cloud sync (single-device mode) everything stays in IndexedDB on this device.
 */
import { zipSync } from "fflate";
import { effect, signal } from "@preact/signals";
import { localGet, localSet, persisted, today, uid } from "./store";
import { mediaSig } from "./media";
import { binSig, jobSpool, registerBin, toBin } from "./inventory";
import { me, usersSig } from "./auth";
import { batchesSig, jobsSig, log, ordersSig, patchOrder, lineProgress, spoolsSig, type LineItem, type Order } from "./index";
import { buildDemand } from "./stockPlan";
import { shrinkImage } from "./image";

/* ---------------------------------------------------------------- types */
export type NxPhoto = { id: string; name: string; size: number; mime: string };
export type NxFile = { id: string; name: string; size: number; mime: string };
export type NxSize = { label: string; mm?: number; g: number };
export type NxCat = { id: string; name: string; /** two-digit block, 10–99 */ code: number; /** last number used (never goes down, so a deleted design's number is never reused) */ last: number };
export type NxDesign = {
  id: string; name: string; catId: string; /** five-digit number: category block + 3-digit sequence */ no: string;
  photos: NxPhoto[]; /** small inline copy of the first photo (a few KB) so every device can show the card */ cover?: string;
  files: NxFile[]; desc?: string; price?: number; sizes?: NxSize[]; created: string; by: string;
};
export type NxShare = { id: string; designIds: string[]; to: string[]; by: string; at: string; note?: string; seen?: string[] };

export const nexderCatsSig = persisted<NxCat[]>("nexderCats", []);
export const nexderDesignsSig = persisted<NxDesign[]>("nexderDesigns", []);
export const nexderSharesSig = persisted<NxShare[]>("nexderShares", []);
registerBin("Design", nexderDesignsSig);

export const catOf = (d: NxDesign) => nexderCatsSig.value.find((c) => c.id === d.catId);
export const catName = (id: string) => nexderCatsSig.value.find((c) => c.id === id)?.name ?? "—";

/* ---------------------------------------------------------------- blob store (IndexedDB now, Drive later) */
const DB = "emerald-nexder";
let dbp: Promise<IDBDatabase> | null = null;
const db = () => dbp ??= new Promise<IDBDatabase>((ok, bad) => {
  const r = indexedDB.open(DB, 1);
  r.onupgradeneeded = () => r.result.createObjectStore("blobs");
  r.onsuccess = () => ok(r.result); r.onerror = () => bad(r.error);
});
const tx = async <T,>(mode: IDBTransactionMode, f: (s: IDBObjectStore) => IDBRequest<T>) => { const d = await db(); return new Promise<T>((ok, bad) => { const r = f(d.transaction("blobs", mode).objectStore("blobs")); r.onsuccess = () => ok(r.result); r.onerror = () => bad(r.error); }); };
const cloud = !!import.meta.env.VITE_SUPABASE_URL && import.meta.env.MODE !== "artifact";
/** The drive-media function refuses bigger files (supabase/functions/drive-media). */
export const DRIVE_MAX = 8 * 1024 * 1024;
type Wait = { name: string; mime: string; big?: boolean };
const queue = signal<Record<string, Wait>>(localGet("nexder:queue", {}));
const saveQueue = () => localSet("nexder:queue", queue.value);
const driveOf = (id: string) => mediaSig.value.find((m) => m.id === id)?.drive;
/** Where a stored blob lives right now. */
export type Where = "drive" | "uploading" | "toobig" | "device";
export const whereIs = (id: string): Where => (driveOf(id) ? "drive" : !cloud ? "device" : queue.value[id]?.big ? "toobig" : "uploading");
export const whereText = (w: Where) => ({ drive: "on Google Drive", uploading: "uploading to Google Drive…", toobig: "over 8 MB, kept on this device only", device: "this device only" })[w];
const b64 = async (b: Blob) => { const u = new Uint8Array(await b.arrayBuffer()); let s = ""; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000)); return btoa(s); };
let sending = false;
/** Sends waiting blobs to Drive. Safe to call any time: offline or signed out it does nothing and nothing is lost. */
export async function syncUp() {
  if (!cloud || sending || !Object.keys(queue.value).length) return;
  const sync = await import("./sync"); if (!sync.cloudUser.value) return;
  sending = true;
  try {
    for (const [id, w] of Object.entries(queue.value)) {
      if (w.big) continue;
      const blob = await tx<Blob | undefined>("readonly", (st) => st.get(id)).catch(() => undefined);
      if (!blob) { const { [id]: _x, ...rest } = queue.value; queue.value = rest; saveQueue(); continue; }
      if (blob.size > DRIVE_MAX) { queue.value = { ...queue.value, [id]: { ...w, big: true } }; saveQueue(); continue; }
      const drive = await sync.mediaUpload({ id, name: w.name, mime: w.mime, data: await b64(blob) });
      if (!drive) break; // offline or failing: try again later
      if (!mediaSig.value.some((m) => m.id === id)) mediaSig.value = [...mediaSig.value, { id, drive, mime: w.mime }];
      const { [id]: _done, ...rest } = queue.value; queue.value = rest; saveQueue();
    }
  } finally { sending = false; }
}
if (cloud) {
  addEventListener("online", () => syncUp());
  import("./sync").then((sync) => effect(() => { if (sync.cloudUser.value) syncUp(); }));
}
const fromDrive = async (id: string) => { const d = driveOf(id); if (!d || !cloud) return null; return (await (await import("./sync")).mediaDownload(d)) ?? null; };
export const blobStore = {
  /** Keeps the blob on this device at once, then sends it to Drive in the background. */
  put: async (id: string, b: Blob, name = id, mime = b.type || "application/octet-stream") => {
    await tx("readwrite", (st) => st.put(b, id));
    if (cloud) { queue.value = { ...queue.value, [id]: { name, mime } }; saveQueue(); syncUp(); }
  },
  /** For showing: this device first, then Drive (and keep a copy here). */
  get: async (id: string) => {
    const l = await tx<Blob | undefined>("readonly", (st) => st.get(id)).catch(() => undefined); if (l) return l;
    const r = await fromDrive(id); if (r) tx("readwrite", (st) => st.put(r, id)).catch(() => undefined);
    return r;
  },
  /** For downloading: always from Google Drive once it is there; this device's copy only while the upload is still waiting. */
  original: async (id: string) => (await fromDrive(id)) ?? (await tx<Blob | undefined>("readonly", (st) => st.get(id)).catch(() => undefined)) ?? null,
  del: (id: string) => { if (queue.value[id]) { const { [id]: _x, ...rest } = queue.value; queue.value = rest; saveQueue(); } return tx("readwrite", (st) => st.delete(id)).then(() => undefined).catch(() => undefined); },
};
const small = (id: string) => id + "-s";
const toBlob = (dataUrl: string) => fetch(dataUrl).then((r) => r.blob());

/* ---------------------------------------------------------------- numbers */
export const MAX_PER_CAT = 999;
/** Next block for a new category: the largest block ever used + 1 (10–99). */
export const nextCode = () => Math.max(9, ...nexderCatsSig.value.map((c) => c.code)) + 1;
export const noOf = (c: NxCat, seq: number) => String(c.code * 1000 + seq);
export const nextNo = (catId: string) => { const c = nexderCatsSig.value.find((x) => x.id === catId); return c && c.last < MAX_PER_CAT ? noOf(c, c.last + 1) : null; };
/** Adds a category; returns an error text instead when it can't. */
export function addCategory(name: string): { cat?: NxCat; error?: string } {
  const n = name.trim().replace(/\s+/g, " ");
  if (!n) return { error: "Give the category a name" };
  const hit = nexderCatsSig.value.find((c) => c.name.toLowerCase() === n.toLowerCase()); if (hit) return { cat: hit };
  const code = nextCode(); if (code > 99) return { error: "All 90 category numbers are used" };
  const cat: NxCat = { id: uid(), name: n, code, last: 0 };
  nexderCatsSig.value = [...nexderCatsSig.value, cat]; return { cat };
}

/* ---------------------------------------------------------------- saving */
/** An item in the form: already stored (no `file`) or newly picked (`file`). */
export type DraftItem = { id: string; name: string; size: number; mime: string; file?: File };
export type Draft = { key: string; editId?: string; name: string; desc: string; price: string; sizes: { label: string; mm: string; g: string }[]; photos: DraftItem[]; files: DraftItem[] };
export const blankDraft = (): Draft => ({ key: uid(), name: "", desc: "", price: "", sizes: [], photos: [], files: [] });
export const draftOf = (d: NxDesign): Draft => ({ key: d.id, editId: d.id, name: d.name, desc: d.desc ?? "", price: d.price ? String(d.price) : "", sizes: (d.sizes ?? []).map((s) => ({ label: s.label, mm: s.mm ? String(s.mm) : "", g: String(s.g) })), photos: d.photos.map((p) => ({ ...p })), files: d.files.map((f) => ({ ...f })) });
export const draftReady = (d: Draft) => !!d.name.trim();

export async function saveDraft(d: Draft, catId: string): Promise<NxDesign | string> {
  const cat = nexderCatsSig.value.find((c) => c.id === catId); if (!cat) return "Choose a category";
  const prev = d.editId ? nexderDesignsSig.value.find((x) => x.id === d.editId) : undefined;
  let no = prev?.no, last = cat.last;
  if (!prev || prev.catId !== catId) { if (cat.last >= MAX_PER_CAT) return `${cat.name} is full (999 designs)`; last = cat.last + 1; no = noOf(cat, last); }
  /* blobs first: if storing fails nothing is half-saved */
  try {
    for (const p of d.photos) if (p.file) {
      await blobStore.put(p.id, p.file, p.name, p.mime);
      await blobStore.put(small(p.id), await toBlob(await shrinkImage(p.file, 640, 0.7)), `preview-${p.name}.jpg`, "image/jpeg");
    }
    for (const f of d.files) if (f.file) await blobStore.put(f.id, f.file, f.name, f.mime);
  } catch { return "This device could not store the files (storage full or blocked)"; }
  const keep = (a: DraftItem[]) => new Set(a.map((x) => x.id));
  if (prev) {
    const kp = keep(d.photos), kf = keep(d.files);
    for (const p of prev.photos) if (!kp.has(p.id)) { blobStore.del(p.id); blobStore.del(small(p.id)); }
    for (const f of prev.files) if (!kf.has(f.id)) blobStore.del(f.id);
  }
  const first = d.photos[0];
  const cover = first ? (first.file ? await shrinkImage(first.file, 360, 0.6) : prev?.photos[0]?.id === first.id ? prev.cover : await blobStore.get(small(first.id)).then((b) => (b ? blobToDataUrl(b) : undefined))) : undefined;
  const sizes = d.sizes.map((s) => ({ label: s.label.trim(), mm: Number(s.mm) || undefined, g: Number(s.g) || 0 })).filter((s) => s.label && s.g > 0);
  const row: NxDesign = {
    id: prev?.id ?? uid(), name: d.name.trim(), catId, no: no!, cover, desc: d.desc.trim() || undefined, price: Number(d.price) > 0 ? Number(d.price) : undefined, sizes: sizes.length ? sizes : undefined,
    photos: d.photos.map(({ id, name, size, mime }) => ({ id, name, size, mime })), files: d.files.map(({ id, name, size, mime }) => ({ id, name, size, mime })),
    created: prev?.created ?? today(), by: prev?.by ?? me.value?.name ?? "You",
  };
  if (!prev || prev.catId !== catId) nexderCatsSig.value = nexderCatsSig.value.map((c) => (c.id === cat.id ? { ...c, last } : c));
  nexderDesignsSig.value = prev ? nexderDesignsSig.value.map((x) => (x.id === row.id ? row : x)) : [row, ...nexderDesignsSig.value];
  log(prev ? "Edited design" : "Added design", `${row.name} · ${row.no}`, "order");
  return row;
}
const blobToDataUrl = (b: Blob) => new Promise<string>((ok) => { const r = new FileReader(); r.onload = () => ok(String(r.result)); r.readAsDataURL(b); });

export function deleteDesign(d: NxDesign) {
  toBin("Design", d, `${d.name} · ${d.no}`, me.value?.name ?? "You");
  log("Deleted design", `${d.name} · ${d.no}`);
}
/** Blobs are only removed when the Bin entry is purged for good; Restore needs them. Nothing to do here on delete. */
export const binHasBlobs = () => binSig.value.some((b) => b.kind === "Design");

/* ---------------------------------------------------------------- download */
export function saveBlob(b: Blob, name: string) {
  const a = document.createElement("a"), u = URL.createObjectURL(b); a.href = u; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 4000);
}
/** Fetches the original from Google Drive (this device's copy only while the upload is still waiting), never a preview. */
export async function downloadFile(f: { id: string; name: string }): Promise<boolean> { const b = await blobStore.original(f.id); if (!b) return false; saveBlob(b, f.name); return true; }

/* ---------------------------------------------------------------- client pack */
const clean = (s: string) => s.replace(/[\\/:*?"<>|\u0000-\u001f]/g, "").replace(/\s+/g, " ").trim().replace(/^\.+|\.+$/g, "").slice(0, 80) || "Untitled";
const ext = (p: { name: string; mime: string }) => { const m = /\.([A-Za-z0-9]{1,5})$/.exec(p.name); return m ? m[1].toLowerCase() : p.mime.split("/")[1]?.replace("jpeg", "jpg") || "bin"; };
export type PackOpts = { images: "all" | "first3" | "cover"; files: boolean };
export function packPlan(ds: NxDesign[], o: PackOpts) {
  /* folder names: category, then product; two products with the same name get their number appended */
  const seen = new Map<string, number>(); for (const d of ds) seen.set(clean(d.name).toLowerCase(), (seen.get(clean(d.name).toLowerCase()) ?? 0) + 1);
  return ds.map((d) => {
    const base = clean(d.name), name = (seen.get(base.toLowerCase()) ?? 0) > 1 ? `${base} ${d.no}` : base;
    const photos = o.images === "all" ? d.photos : o.images === "first3" ? d.photos.slice(0, 3) : d.photos.slice(0, 1);
    return { d, cat: clean(catName(d.catId)), name, photos, files: o.files ? d.files : [] };
  });
}
export const packBytes = (ds: NxDesign[], o: PackOpts) => packPlan(ds, o).reduce((a, p) => a + p.photos.reduce((s, x) => s + x.size, 0) + p.files.reduce((s, x) => s + x.size, 0), 0);
export async function buildPack(ds: NxDesign[], o: PackOpts): Promise<{ blob?: Blob; missing: number }> {
  const out: Record<string, Uint8Array> = {}; let missing = 0;
  for (const p of packPlan(ds, o)) {
    let n = 0;
    for (const ph of p.photos) { const b = await blobStore.original(ph.id); if (!b) { missing++; continue; } n++; out[`${p.cat}/${p.name}/${p.name}-${n}.${ext(ph)}`] = new Uint8Array(await b.arrayBuffer()); }
    for (const f of p.files) { const b = await blobStore.original(f.id); if (!b) { missing++; continue; } out[`${p.cat}/${p.name}/files/${clean(f.name)}`] = new Uint8Array(await b.arrayBuffer()); }
  }
  if (!Object.keys(out).length) return { missing };
  /* images and most design files are already compressed; store them as they are */
  return { blob: new Blob([zipSync(out, { level: 0 }) as BlobPart], { type: "application/zip" }), missing };
}

/* ---------------------------------------------------------------- share */
export function shareDesigns(ids: string[], to: string[], note: string) {
  if (!ids.length || !to.length) return;
  nexderSharesSig.value = [{ id: uid(), designIds: ids, to, by: me.value?.id ?? "", at: today(), note: note.trim() || undefined, seen: [] }, ...nexderSharesSig.value];
  log("Shared designs", `${ids.length} with ${to.map((u) => usersSig.value.find((x) => x.id === u)?.name ?? "").filter(Boolean).join(", ")}`);
}
export const sharedWithMe = () => nexderSharesSig.value.filter((s) => me.value && s.to.includes(me.value.id));
export const unseenShares = () => sharedWithMe().filter((s) => !s.seen?.includes(me.value!.id));
export function markSeen() {
  const u = me.value?.id; if (!u) return;
  if (unseenShares().length) nexderSharesSig.value = nexderSharesSig.value.map((s) => (s.to.includes(u) && !s.seen?.includes(u) ? { ...s, seen: [...(s.seen ?? []), u] } : s));
}

/* ---------------------------------------------------------------- orders */
export const assignable = () => ordersSig.value.filter((o) => o.stage === "quotation" || o.stage === "production");
export function assignToOrder(o: Order, ds: NxDesign[], size: Record<string, NxSize | undefined> = {}) {
  const items: LineItem[] = ds.map((d) => {
    const s = size[d.id] ?? (d.sizes?.length === 1 ? d.sizes[0] : undefined);
    return { name: d.name, material: "PLA", colour: "", qty: 1, price: d.price ?? 0, cost: 0, thumb: d.cover, designId: d.id, sku: d.no, ...(s ? { roughG: s.g, heightMm: s.mm, } : {}) };
  });
  patchOrder(o, { items: [...o.items, ...items] });
  log("Assigned designs", `${ds.map((d) => d.no).join(", ")} → ${o.no}`);
}

/** Material still to print for one design across live orders. Same demand rules as the Filament panel, so the numbers agree. */
export type Usage = { orderNo: string; customer: string; pending: number; heightMm?: number; gEach: number; colours: string[]; total: number; estimated: boolean };
export function materialUsage(designId: string): Usage[] {
  const orders = ordersSig.value, batches = batchesSig.value;
  const prog = (o: Order, i: LineItem, b: typeof batches) => { const p = lineProgress(o, i, b); return { printed: p.printed, printing: p.printing }; };
  void spoolsSig.value; void jobsSig.value;
  return buildDemand(orders, batches, jobsSig.value, prog, jobSpool).flatMap((d) => {
    const o = orders.find((x) => x.id === d.orderId), i = o?.items[d.k]; if (!o || !i || i.designId !== designId) return [];
    /* A line with no colour yet has no pieces in the demand; fall back to the grams typed for its size (marked as an estimate). */
    const fromPcs = d.pcs.reduce((a, x) => a + x.g, 0), gEach = fromPcs || i.roughG || 0;
    return [{ orderNo: d.orderNo, customer: d.customer, pending: d.pending, heightMm: i.heightMm, gEach, colours: d.pcs.map((x) => x.colour).filter(Boolean), total: gEach * d.pending, estimated: d.estimated || !fromPcs }];
  });
}
