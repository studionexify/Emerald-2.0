/**
 * Nexder: the studio's library of designs (photos + any files such as STL, 3MF, STEP).
 *
 * Emerald keeps NOTHING of the files. Where things live:
 *  - records (name, number, Drive ids, sizes): Supabase database, through the normal record sync
 *  - the original photos and design files: Google Drive, uploaded straight from the browser to Google (no bytes pass through
 *    Supabase or Cloudflare) and downloaded through the small /nexder-dl Worker, which streams them to the browser
 *  - one small preview picture per photo: private Supabase Storage bucket (a disposable browser cache only avoids repeat egress)
 * Every limit that could cost money is checked here before an upload starts (LIMITS), and the server checks it again.
 */
import { Zip, ZipPassThrough } from "fflate";
import { signal } from "@preact/signals";
import { persisted, today, uid } from "./store";
import { binSig, jobSpool, registerBin, toBin } from "./inventory";
import { me, usersSig } from "./auth";
import { batchesSig, jobsSig, log, ordersSig, patchOrder, lineProgress, spoolsSig, type LineItem, type Order } from "./index";
import { buildDemand } from "./stockPlan";
import { shrinkImage } from "./image";
import { cloudEnabled } from "./sync";
import { cancelDesign, enqueue, isQueued, setRunner } from "./nexder-queue";
import { allPending, type Pending } from "./nexder-pending";

/* ---------------------------------------------------------------- limits (free plans: Google Drive 15 GB, Supabase Storage 1 GB) */
export const LIMITS = {
  /** Supabase Storage free plan is 1 GB; stop well before it. */
  previewBytes: 900 * 1024 * 1024,
  /** Each preview is a JPEG at most this big (the bucket refuses more). */
  previewMax: 300 * 1024,
  /** Space always left free in Google Drive (the function enforces it too). */
  driveReserve: 1024 ** 3,
};

/* ---------------------------------------------------------------- types */
export type NxPhoto = { id: string; name: string; size: number; mime: string; /** Drive file id (absent on designs saved by the first build) */ drive?: string; /** preview size in bytes */ psize?: number; /** saved, but the original has not reached Drive yet */ pend?: boolean };
export type NxFile = { id: string; name: string; size: number; mime: string; drive?: string; pend?: boolean };
/** One size of a design. `min` is print minutes per piece; `sliced` is true once the numbers come from the real slicer rather than the estimate. */
export type NxSize = { label: string; mm?: number; g: number; min?: number; sliced?: boolean };
export type NxCat = { id: string; name: string; /** two-digit block, 10–99 */ code: number; /** last number used (never goes down, so a deleted design's number is never reused) */ last: number; /** hidden from every picker and list; its designs keep their numbers and come back with it */ archived?: boolean; /** numbers of designs that were used in orders and then deleted: never handed out again */ retired?: string[] };
export type NxDesign = {
  id: string; name: string; /** the category whose number block this design's number came from (fixed once saved) */ catId: string;
  /** every category the design is listed in. Absent = just `catId`; empty = in none. */ cats?: string[]; /** five-digit number: category block + 3-digit sequence */ no: string; /** Drive folder holding this design's files */ folder?: string;
  photos: NxPhoto[]; files: NxFile[]; /** where the design came from (a web page) */ source?: string; /** who designed it */ designer?: string; desc?: string; price?: number; sizes?: NxSize[]; created: string; by: string; /** set when it went to the Bin unused: its number was free at once, so Restore may have to renumber it */ freed?: boolean;
};
export type NxShare = { id: string; designIds: string[]; to: string[]; by: string; at: string; note?: string; seen?: string[] };
/** A design in the Bin: its Drive folder sits in Drive's trash until the Bin entry is gone for good. */
export type NxTrash = { id: string; folder: string; photoIds: string[] };

/** Every designer name ever entered, offered in a drop-down the next time. */
export type NxDesigner = { id: string; name: string };
export const nexderDesignersSig = persisted<NxDesigner[]>("nexderDesigners", []);
/** A designer name as already stored (same spelling, ignoring case), so one person is never listed twice. */
export const canonDesigner = (t: string) => { const v = t.trim().replace(/\s+/g, " "); return nexderDesignersSig.value.find((x) => x.name.toLowerCase() === v.toLowerCase())?.name ?? v; };
/** A link to the original page: empty is fine; anything else must be a web address (https:// is added when missing). Returns null when it is not one. */
export function cleanLink(t: string): string | null {
  const v = t.trim(); if (!v) return "";
  try { const u = new URL(/^[a-z][a-z0-9+.-]*:/i.test(v) ? v : "https://" + v); return (u.protocol === "https:" || u.protocol === "http:") && u.hostname.includes(".") ? u.href : null; } catch { return null; }
}
export const nexderCatsSig = persisted<NxCat[]>("nexderCats", []);
export const nexderDesignsSig = persisted<NxDesign[]>("nexderDesigns", []);
/** Bulk price changes that can still be undone, newest first. Kept on this device only. */
export type PriceUndo = { at: string; label: string; items: { id: string; from?: number; to?: number }[] };
const UNDO_KEY = "emerald:nexder:priceUndo";
export const priceUndoSig = signal<PriceUndo[]>((() => { try { const x = JSON.parse(localStorage.getItem(UNDO_KEY) ?? "[]"); return Array.isArray(x) ? x : []; } catch { return []; } })());
export const setPriceUndo = (v: PriceUndo[]) => { priceUndoSig.value = v; try { localStorage.setItem(UNDO_KEY, JSON.stringify(v)); } catch { /* not remembered */ } };
export const nexderSharesSig = persisted<NxShare[]>("nexderShares", []);
export const nexderTrashSig = persisted<NxTrash[]>("nexderTrash", []);
/** A design coming back from the Bin takes a new number when someone else was given its number meanwhile (the live design always keeps its own). */
registerBin("Design", nexderDesignsSig, (row: NxDesign, live: NxDesign[]) => {
  const { freed, ...rest } = row;
  if (!freed || !live.some((x) => x.no === row.no)) return rest;
  const c = catOf(row), n = c ? freeSeq(c) : null;
  if (!c || !n) return rest;
  nexderCatsSig.value = nexderCatsSig.value.map((x) => (x.id === c.id ? { ...x, last: Math.max(x.last, n) } : x));
  return { ...rest, no: noOf(c, n) };
});
/* The first build kept a cover thumbnail inside each record; records must stay small (they live on every device), so drop it. */
if (nexderDesignsSig.value.some((d) => "cover" in d)) nexderDesignsSig.value = nexderDesignsSig.value.map((d) => { const { cover: _c, ...rest } = d as NxDesign & { cover?: string }; return rest; });

/** The category whose number block a design's number belongs to. Falls back to the block itself when the stored id is stale. */
export const catOf = (d: NxDesign) => nexderCatsSig.value.find((c) => c.id === d.catId) ?? nexderCatsSig.value.find((c) => c.code === Math.floor(Number(d.no) / 1000));
/** Ids of the categories a design is listed in (only ones that still exist). */
export const catsOf = (d: NxDesign, withArchived = false): string[] => { const all = nexderCatsSig.value; return (d.cats ?? [d.catId]).filter((id) => all.some((c) => c.id === id && (withArchived || !c.archived))); };

export const catName = (id: string) => nexderCatsSig.value.find((c) => c.id === id)?.name ?? "—";

/* ---------------------------------------------------------------- backend (Google Drive + Supabase; a fake one for tests only) */
export type Space = { limit: number | null; usage: number };
export interface Backend {
  quota(): Promise<Space>;
  folder(cat: string, label: string): Promise<string>;
  /** Uploads one file straight to Drive; resolves with its Drive id. */
  upload(file: File, folder: string, onSent: (bytes: number) => void, signal?: AbortSignal): Promise<string>;
  /** One download URL per file (the Worker streams it from Drive). */
  links(files: { drive: string; name: string }[]): Promise<string[]>;
  trash(id: string, on: boolean): Promise<void>;
  /** Really deletes (the server refuses anything a record still points at). */
  purge(ids: string[]): Promise<void>;
  sweep(): Promise<number>;
  previewPut(id: string, blob: Blob): Promise<void>;
  previewGet(id: string): Promise<Blob | null>;
  previewDel(ids: string[]): Promise<void>;
}
const FAKE = !!import.meta.env.VITE_NEXDER_FAKE;
/** Nexder works only with cloud sync (that is where the files go). */
export const nexderReady = cloudEnabled || FAKE;
let be: Promise<Backend> | null = null;
export const backend = () => be ??= FAKE ? import("./nexder-fake").then((m) => m.fake) : import("./nexder-drive").then((m) => m.real);

/* ---------------------------------------------------------------- numbers */
export const MAX_PER_CAT = 999;
/** Next block for a new category: the largest block ever used + 1 (10–99). */
export const nextCode = () => Math.max(9, ...nexderCatsSig.value.map((c) => c.code)) + 1;
export const noOf = (c: NxCat, seq: number) => String(c.code * 1000 + seq);
/** Lowest sequence in a category's block that no design holds. A design in the Bin that was deleted unused has let go of its number; one that was used keeps it (retired). */
export function freeSeq(c: NxCat): number | null {
  const used = new Set([...nexderDesignsSig.value.map((d) => d.no), ...(c.retired ?? []), ...binSig.value.filter((x) => x.kind === "Design" && !(x.data as { freed?: boolean } | undefined)?.freed).map((x) => (x.data as { no?: string } | undefined)?.no)]);
  for (let i = 1; i <= MAX_PER_CAT; i++) if (!used.has(noOf(c, i))) return i;
  return null;
}
export const nextNo = (catId: string) => { const c = nexderCatsSig.value.find((x) => x.id === catId), n = c ? freeSeq(c) : null; return c && n ? noOf(c, n) : null; };
/** Adds a category; returns an error text instead when it can't. */
export function addCategory(name: string): { cat?: NxCat; error?: string } {
  const n = name.trim().replace(/\s+/g, " ");
  if (!n) return { error: "Give the category a name" };
  const hit = nexderCatsSig.value.find((c) => c.name.toLowerCase() === n.toLowerCase()); if (hit) return { cat: hit };
  const code = nextCode(); if (code > 99) return { error: "All 90 category numbers are used" };
  const cat: NxCat = { id: uid(), name: n, code, last: 0 };
  nexderCatsSig.value = [...nexderCatsSig.value, cat]; return { cat };
}

/* ---------------------------------------------------------------- previews (private Supabase bucket; the browser cache is disposable) */
const urls = new Map<string, string>();
const CACHE = "emerald-nexder-previews";
/** Object URL of one photo's preview, or "" when it is not there. A missing preview is rebuilt from the Drive original and stored again. */
export async function previewUrl(id: string): Promise<string> {
  const have = urls.get(id); if (have) return have;
  const cache = "caches" in self ? await caches.open(CACHE).catch(() => null) : null, key = new Request(location.origin + "/__nexder/" + id);
  let blob = await (await cache?.match(key))?.blob();
  if (!blob) {
    blob = (await (await backend()).previewGet(id).catch(() => null)) ?? undefined;
    if (!blob) blob = await rebuildPreview(id);
    if (!blob) return "";
    await cache?.put(key, new Response(blob, { headers: { "Content-Type": "image/jpeg" } })).catch(() => {});
  }
  const u = URL.createObjectURL(blob); urls.set(id, u); return u;
}
async function rebuildPreview(id: string): Promise<Blob | undefined> {
  const ph = nexderDesignsSig.value.flatMap((d) => d.photos).find((p) => p.id === id); if (!ph?.drive) return undefined;
  try {
    const b = await backend(), [u] = await b.links([{ drive: ph.drive, name: ph.name }]), r = await fetch(u); if (!r.ok) return undefined;
    const pv = await makePreview(new File([await r.blob()], ph.name, { type: ph.mime }));
    await b.previewPut(id, pv).catch(() => {}); return pv;
  } catch { return undefined; }
}
export const previewBytes = () => nexderDesignsSig.value.reduce((a, d) => a + d.photos.reduce((s, p) => s + (p.psize ?? 0), 0), 0);

/* ---------------------------------------------------------------- saving */
/** An item in the form: already stored (no `file`) or newly picked (`file`). */
export type DraftItem = { id: string; name: string; size: number; mime: string; file?: File; drive?: string; psize?: number; pend?: boolean };
export type Draft = { key: string; editId?: string; name: string; desc: string; source: string; designer: string; price: string; sizes: { label: string; mm: string; g: string; min: string; sliced: boolean }[]; photos: DraftItem[]; files: DraftItem[] };
export const blankDraft = (): Draft => ({ key: uid(), name: "", desc: "", source: "", designer: "", price: "", sizes: [], photos: [], files: [] });
export const draftOf = (d: NxDesign): Draft => ({ key: d.id, editId: d.id, name: d.name, desc: d.desc ?? "", source: d.source ?? "", designer: d.designer ?? "", price: d.price ? String(d.price) : "", sizes: (d.sizes ?? []).map((s) => ({ label: s.label, mm: s.mm ? String(s.mm) : "", g: String(s.g), min: s.min ? String(s.min) : "", sliced: !!s.sliced })), photos: d.photos.map((p) => ({ ...p })), files: d.files.map((f) => ({ ...f })) });
export const draftReady = (d: Draft) => !!d.name.trim() && cleanLink(d.source) !== null;
export const newBytes = (d: Draft) => [...d.photos, ...d.files].reduce((a, x) => a + (x.file ? x.size : 0), 0);
export type Progress = { label: string; sent: number; total: number };
export const fmtBytes = (n: number) => (n >= 1024 ** 3 ? `${(n / 1024 ** 3).toFixed(2)} GB` : n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
const toBlob = (dataUrl: string) => fetch(dataUrl).then((r) => r.blob());
export async function makePreview(f: File): Promise<Blob> {
  let b = await toBlob(await shrinkImage(f, 640, 0.7));
  if (b.size > LIMITS.previewMax) b = await toBlob(await shrinkImage(f, 420, 0.55));
  return b;
}

/**
 * Saves the design at once: the record, the Drive folder and the small previews. The originals are queued and go to Drive in the background
 * (see nexder-queue). If the previews or the record fail, what was made is deleted again.
 */
export async function saveDraft(d: Draft, catId: string, listed: string[] | undefined, onProgress: (p: Progress) => void, signal?: AbortSignal): Promise<NxDesign | string> {
  const prev = d.editId ? nexderDesignsSig.value.find((x) => x.id === d.editId) : undefined;
  /* An edit never renumbers: the number stays with the block it came from, even if that category was removed or archived. `listed` says where the design shows. */
  if (prev) catId = prev.catId;
  const cat = nexderCatsSig.value.find((c) => c.id === catId); if (!prev && !cat) return "Choose a category";
  if (!nexderReady) return "Nexder needs cloud sync, because it keeps files in Google Drive";
  let no = prev?.no, last = cat?.last ?? 0;
  if (!prev) { const n = freeSeq(cat!); if (!n) return `${cat!.name} is full (999 designs)`; last = Math.max(cat!.last, n); no = noOf(cat!, n); }
  const b = await backend();
  const addP = d.photos.filter((p) => p.file), addF = d.files.filter((f) => f.file), bytes = newBytes(d);
  /* free space, before a single byte is sent */
  try {
    const sp = await b.quota();
    if (sp.limit !== null && sp.usage + bytes + LIMITS.driveReserve > sp.limit) return `Not enough space in Google Drive: ${fmtBytes(Math.max(0, sp.limit - sp.usage - LIMITS.driveReserve))} free, this design needs ${fmtBytes(bytes)}.`;
  } catch (e) { return (e as Error).message; }
  if (previewBytes() + addP.length * LIMITS.previewMax > LIMITS.previewBytes) return "The preview storage is nearly full. Delete designs you no longer need first.";

  const made = { previews: [] as string[] };
  let folder = prev?.folder, newFolder = false;
  try {
    if (!folder) { folder = await b.folder(cat?.name ?? "Uncategorized", `${no} ${d.name.trim()}`.slice(0, 120)); newFolder = true; }
    const psize: Record<string, number> = {};
    /* only the small previews are made before the window closes; the originals go up in the background afterwards */
    for (const [k, p] of addP.entries()) { onProgress({ label: "Previews", sent: k, total: addP.length }); if (signal?.aborted) throw new Error("cancelled"); const pv = await makePreview(p.file!); await b.previewPut(p.id, pv); made.previews.push(p.id); psize[p.id] = pv.size; }
    const sizes = d.sizes.map((s) => ({ label: s.label.trim(), mm: Number(s.mm) || undefined, g: Number(s.g) || 0, min: Number(s.min) > 0 ? Math.round(Number(s.min)) : undefined, sliced: s.sliced || undefined })).filter((s) => s.label && s.g > 0);
    const row: NxDesign = {
      id: prev?.id ?? uid(), name: d.name.trim(), ...(cleanLink(d.source) ? { source: cleanLink(d.source)! } : {}), ...(d.designer.trim() ? { designer: canonDesigner(d.designer) } : {}), catId, ...(listed && !(listed.length === 1 && listed[0] === catId) ? { cats: listed } : {}), no: no!, folder, desc: d.desc.trim() || undefined, price: Number(d.price) > 0 ? Number(d.price) : undefined, sizes: sizes.length ? sizes : undefined,
      photos: d.photos.map((p) => ({ id: p.id, name: p.name, size: p.size, mime: p.mime, drive: p.drive ?? prev?.photos.find((x) => x.id === p.id)?.drive, psize: psize[p.id] ?? p.psize, ...(p.file || (p.pend && !p.drive && !prev?.photos.find((x) => x.id === p.id)?.drive) ? { pend: true } : {}) })),
      files: d.files.map((f) => ({ id: f.id, name: f.name, size: f.size, mime: f.mime, drive: f.drive ?? prev?.files.find((x) => x.id === f.id)?.drive, ...(f.file || (f.pend && !f.drive && !prev?.files.find((x) => x.id === f.id)?.drive) ? { pend: true } : {}) })),
      created: prev?.created ?? today(), by: prev?.by ?? me.value?.name ?? "You",
    };
    if (!prev && cat) nexderCatsSig.value = nexderCatsSig.value.map((c) => (c.id === cat.id ? { ...c, last } : c));
    nexderDesignsSig.value = prev ? nexderDesignsSig.value.map((x) => (x.id === row.id ? row : x)) : [row, ...nexderDesignsSig.value];
    if (row.designer && !nexderDesignersSig.value.some((x) => x.name.toLowerCase() === row.designer!.toLowerCase())) nexderDesignersSig.value = [...nexderDesignersSig.value, { id: uid(), name: row.designer }];
    log(prev ? "Edited design" : "Added design", `${row.name} · ${row.no}`, "order");
    /* what the user took out of an existing design is deleted from Drive and from the previews */
    if (prev) {
      const keepP = new Set(d.photos.map((p) => p.id)), keepF = new Set(d.files.map((f) => f.id));
      const gone = [...prev.photos.filter((p) => !keepP.has(p.id)), ...prev.files.filter((f) => !keepF.has(f.id))];
      await b.purge(gone.map((x) => x.drive).filter(Boolean) as string[]).catch(() => {});
      await b.previewDel(prev.photos.filter((p) => !keepP.has(p.id)).map((p) => p.id)).catch(() => {});
      cancelDesign(prev.id, gone.map((x) => x.id));
    }
    enqueue([...addP.map((x) => ({ x, kind: "photo" as const })), ...addF.map((x) => ({ x, kind: "file" as const }))].map(({ x, kind }) => ({ designId: row.id, designName: row.name, itemId: x.id, kind, name: x.name, size: x.size, file: x.file! })));
    return row;
  } catch (e) {
    await b.purge(newFolder && folder ? [folder] : []).catch(() => {});
    await b.previewDel(made.previews).catch(() => {});
    return signal?.aborted ? "Cancelled. Nothing was kept." : (e as Error).message || "Upload failed";
  }
}

/* the queue's transfer step: send the file, then write its Drive id into the design */
setRunner(async (j, signal, progress) => {
  const d = nexderDesignsSig.value.find((x) => x.id === j.designId); if (!d?.folder) throw new Error("The design no longer exists");
  const b = await backend(), id = await b.upload(j.file, d.folder, progress, signal);
  const list = j.kind === "photo" ? "photos" : "files", cur = nexderDesignsSig.value.find((x) => x.id === j.designId);
  if (!cur || !cur[list].some((x) => x.id === j.itemId)) { await b.purge([id]).catch(() => {}); throw new Error("Removed from the design"); }
  nexderDesignsSig.value = nexderDesignsSig.value.map((x) => (x.id !== j.designId ? x : { ...x, [list]: x[list].map((i) => (i.id === j.itemId ? { ...i, drive: id, pend: undefined } : i)) }));
});
/** Items of a design whose original is not in Drive yet and is not on its way either (the tab was closed, or the upload was stopped). */
export const incomplete = (d: NxDesign) => [...d.photos.map((x) => ({ ...x, kind: "photo" as const })), ...d.files.map((x) => ({ ...x, kind: "file" as const }))].filter((x) => x.pend && !x.drive && !isQueued(d.id, x.id));
/** Uploads an original again for an item that is still marked as not uploaded. */
export function reupload(d: NxDesign, kind: "photo" | "file", itemId: string, file: File) {
  const list = kind === "photo" ? "photos" : "files";
  nexderDesignsSig.value = nexderDesignsSig.value.map((x) => (x.id !== d.id ? x : { ...x, [list]: x[list].map((i) => (i.id === itemId ? { ...i, size: file.size, mime: file.type || i.mime } : i)) }));
  enqueue([{ designId: d.id, designName: d.name, itemId, kind, name: file.name, size: file.size, file }]);
}

/* ---------------------------------------------------------------- delete, restore, clean-up */
/** Order numbers that carry this design. A design used in any order, in any state, is "used". */
export const usedIn = (d: NxDesign) => ordersSig.value.filter((o) => o.items.some((i) => i.designId === d.id)).map((o) => o.no);
/** What deleting these would do to their numbers. */
export const deletePlan = (ds: NxDesign[]) => ({ used: ds.filter((d) => usedIn(d).length), unused: ds.filter((d) => !usedIn(d).length) });
/**
 * Moves the design to the Bin and its Drive folder to Drive's trash.
 * Unused: its number is free for the next design at once. Used in an order: the number is retired (left blank for good) so old paperwork never points at a different product.
 */
export async function deleteDesign(d: NxDesign): Promise<string | null> {
  cancelDesign(d.id);
  const used = usedIn(d).length > 0;
  try { if (d.folder) { await (await backend()).trash(d.folder, true); nexderTrashSig.value = [...nexderTrashSig.value, { id: d.id, folder: d.folder, photoIds: d.photos.map((p) => p.id) }]; } }
  catch (e) { return `Could not move the files to Drive's trash: ${(e as Error).message}`; }
  const home = catOf(d);
  if (used && home) nexderCatsSig.value = nexderCatsSig.value.map((c) => (c.id === home.id && !(c.retired ?? []).includes(d.no) ? { ...c, retired: [...(c.retired ?? []), d.no] } : c));
  toBin("Design", used ? d : { ...d, freed: true }, `${d.name} · ${d.no}${used ? " (number retired)" : ""}`, me.value?.name ?? "You");
  log("Deleted design", `${d.name} · ${d.no}${used ? " · number retired" : " · number freed"}`);
  return null;
}
/**
 * Keeps Drive in step with the Bin. Runs whenever Nexder opens:
 * restored from the Bin → folder comes back out of Drive's trash; Bin entry deleted or expired → folder and previews deleted for good.
 */
export async function syncTrash() {
  if (!nexderReady || !nexderTrashSig.value.length) return;
  const b = await backend(), left: NxTrash[] = [];
  for (const t of nexderTrashSig.value) {
    try {
      if (nexderDesignsSig.value.some((d) => d.id === t.id)) await b.trash(t.folder, false);
      else if (binSig.value.some((x) => x.kind === "Design" && (x.data as { id?: string } | undefined)?.id === t.id)) left.push(t);
      else { await b.purge([t.folder]); await b.previewDel(t.photoIds); }
    } catch { left.push(t); } // try again next time
  }
  nexderTrashSig.value = left;
}
/** Nothing in Emerald deletes Drive files on its own any more (the old daily clean-up is gone; the server refuses it too). */
export async function sweepOrphans() { /* intentionally empty */ }

/* ---------------------------------------------------------------- uploads interrupted by a closed tab or a refresh */
/** Originals still on THIS device that never reached Drive. The designs stay in the list; the person decides when to continue. */
export const resumableSig = signal<Pending[]>([]);
export async function loadResumable() {
  const keep: Pending[] = [];
  for (const p of await allPending()) {
    const d = nexderDesignsSig.value.find((x) => x.id === p.designId), item = d && (p.kind === "photo" ? d.photos : d.files).find((x) => x.id === p.itemId);
    if (item && !item.drive && !isQueued(p.designId, p.itemId)) keep.push(p);
    /* an entry whose design is not in the list is left alone: the records may simply not have arrived yet, and the file must never be thrown away on a guess */
  }
  resumableSig.value = keep;
}
/** The person pressed Continue: send the saved originals to Drive again, from this device. */
export function resumeUploads() {
  const list = resumableSig.value; resumableSig.value = [];
  enqueue(list.map((p) => ({ designId: p.designId, designName: p.designName, itemId: p.itemId, kind: p.kind, name: p.name, size: p.size, file: p.file instanceof File ? p.file : new File([p.file], p.name, { type: p.mime }) })));
}

/* ---------------------------------------------------------------- space meter and self-test */
export const driveSpace = async () => (await backend()).quota();
export type Check = { step: string; ok: boolean; note?: string };
/** Opens a session, uploads 1 KB, confirms, downloads it back through the Worker, compares, deletes. Leaves nothing behind. */
export async function checkDrive(): Promise<Check[]> {
  const out: Check[] = [], ok = (step: string, note?: string) => out.push({ step, ok: true, note }), no = (step: string, e: unknown) => { out.push({ step, ok: false, note: (e as Error)?.message ?? String(e) }); return out; };
  const b = await backend(); let folder = "", file = "";
  const body = new File([new Uint8Array(1024).map((_, i) => i % 251)], "nexder-check.bin", { type: "application/octet-stream" });
  try { const q = await b.quota(); ok("Google Drive reachable", q.limit ? `${fmtBytes(q.usage)} of ${fmtBytes(q.limit)} used` : `${fmtBytes(q.usage)} used`); } catch (e) { return no("Google Drive reachable", e); }
  try { folder = await b.folder("_check", "check " + Date.now()); ok("Folder created"); } catch (e) { return no("Folder created", e); }
  try { file = await b.upload(body, folder, () => {}); ok("Browser uploaded straight to Google"); } catch (e) { await b.purge([folder]).catch(() => {}); return no("Browser uploaded straight to Google", e); }
  try {
    const [url] = await b.links([{ drive: file, name: "nexder-check.bin" }]);
    const r = await fetch(url); if (!r.ok) throw new Error(`The download Worker answered ${r.status}: ${await r.text().catch(() => "")}`);
    const got = new Uint8Array(await r.arrayBuffer()), want = new Uint8Array(await body.arrayBuffer());
    if (got.length !== want.length || got.some((v, i) => v !== want[i])) throw new Error("Downloaded bytes differ from what was uploaded");
    ok("Downloaded back through the Worker, identical");
  } catch (e) { out.push({ step: "Downloaded back through the Worker", ok: false, note: (e as Error).message }); }
  try { await b.purge([file, folder]); ok("Deleted again"); } catch (e) { no("Deleted again", e); }
  return out;
}

/* ---------------------------------------------------------------- download */
/** Biggest file saved through memory; bigger ones go to the browser's own download manager (after the link has been proven to work). */
const BLOB_MAX = 150 * 1024 * 1024;
const fail = async (r: Response) => ((await r.text().catch(() => "")).trim().slice(0, 200) || `The download failed (${r.status}).`);
/**
 * Downloads one original from Drive. Never fails silently: the link is tried first with a 1-byte request, so an expired or
 * misconfigured link shows its real reason instead of a download that "does nothing". Returns an error text, or null when saved/started.
 */
export async function downloadFile(f: { drive?: string; name: string }): Promise<string | null> {
  if (!f.drive) return "This file is not in Google Drive yet. Use “Upload again” on it, or edit the design and add it again.";
  try {
    const [u] = await (await backend()).links([{ drive: f.drive, name: f.name }]);
    const probe = await fetch(u, { headers: { Range: "bytes=0-0" } }).catch(() => null);
    if (!probe) return "No connection. Check the network and press Get again.";
    if (!probe.ok && probe.status !== 206) return await fail(probe);
    const total = Number(/\/(\d+)$/.exec(probe.headers.get("Content-Range") ?? "")?.[1] ?? 0);
    if (total > 0 && total <= BLOB_MAX) {
      const r = await fetch(u).catch(() => null); if (!r) return "The connection dropped during the download. Press Get again."; if (!r.ok) return await fail(r);
      saveBlob(await r.blob(), f.name); return null;
    }
    const a = document.createElement("a"); a.href = u; a.rel = "noopener"; a.download = f.name; document.body.appendChild(a); a.click(); a.remove(); return null;
  } catch (e) { return (e as Error).message || "The download failed."; }
}
/** Saves one photo: the original from Drive when it is there, else the preview kept in the cloud (so a photo can always be downloaded). */
export async function downloadPhoto(p: { id: string; name: string; drive?: string }): Promise<string | null> {
  if (p.drive) return downloadFile(p);
  const b = await (await backend()).previewGet(p.id).catch(() => null);
  if (!b) return "This photo is not available yet. If it was added on another device, wait for its upload to finish.";
  saveBlob(b, p.name.replace(/\.[A-Za-z0-9]{1,5}$/, "") + "-preview.jpg"); return null;
}
export function saveBlob(b: Blob, name: string) { const a = document.createElement("a"), u = URL.createObjectURL(b); a.href = u; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 4000); }

/* ---------------------------------------------------------------- client pack (photos only, streamed into a zip) */
const clean = (s: string) => s.replace(/[\\/:*?"<>|\u0000-\u001f]/g, "").replace(/\s+/g, " ").trim().replace(/^\.+|\.+$/g, "").slice(0, 80) || "Untitled";
const ext = (p: { name: string; mime: string }) => { const m = /\.([A-Za-z0-9]{1,5})$/.exec(p.name); return m ? m[1].toLowerCase() : p.mime.split("/")[1]?.replace("jpeg", "jpg") || "bin"; };
export type PackOpts = { images: "all" | "first3" | "cover" };
export function packPlan(ds: NxDesign[], o: PackOpts) {
  /* folder names: category, then product; two products with the same name get their number appended */
  const seen = new Map<string, number>(); for (const d of ds) seen.set(clean(d.name).toLowerCase(), (seen.get(clean(d.name).toLowerCase()) ?? 0) + 1);
  return ds.map((d) => {
    const base = clean(d.name), name = (seen.get(base.toLowerCase()) ?? 0) > 1 ? `${base} ${d.no}` : base;
    const photos = o.images === "all" ? d.photos : o.images === "first3" ? d.photos.slice(0, 3) : d.photos.slice(0, 1);
    return { d, cat: clean(catName(catsOf(d, true)[0] ?? catOf(d)?.id ?? "")), name, photos };
  });
}
export const packBytes = (ds: NxDesign[], o: PackOpts) => packPlan(ds, o).reduce((a, p) => a + p.photos.reduce((s, x) => s + x.size, 0), 0);

/** Where a download is written. A real file when the browser allows it (nothing held in memory), else memory. */
export type Sink = { write(c: Uint8Array): Promise<void>; close(): Promise<void>; abort(): Promise<void> };
type Writable = { write(c: Uint8Array): Promise<void>; close(): Promise<void>; abort(): Promise<void> };
export const canStream = !FAKE && typeof (window as unknown as { showSaveFilePicker?: unknown }).showSaveFilePicker === "function";
/** Must be called straight from the click (the browser asks where to save before any waiting). Returns null if the user cancelled. */
export async function openSink(name: string, type = "application/zip"): Promise<Sink | null> {
  if (canStream) {
    try {
      const h = await (window as unknown as { showSaveFilePicker: (o: unknown) => Promise<{ createWritable(): Promise<Writable> }> }).showSaveFilePicker({ suggestedName: name });
      const w = await h.createWritable(); return { write: (c) => w.write(c), close: () => w.close(), abort: () => w.abort() };
    } catch { return null; }
  }
  const parts: BlobPart[] = [];
  return { write: async (c) => { parts.push(c.slice()); }, close: async () => saveBlob(new Blob(parts, { type }), name), abort: async () => { parts.length = 0; } };
}
/** Biggest zip built in memory when the browser cannot save a stream to disk (photos are small, so this is rarely reached). */
export const MEMORY_ZIP = 300 * 1024 * 1024;

/** Zips the photos of the chosen designs (category folder → product folder → product-N.jpg), fetching each original from Drive one at a time. */
export async function buildPack(ds: NxDesign[], o: PackOpts, sink: Sink, onProgress: (done: number, total: number) => void): Promise<{ missing: number }> {
  const b = await backend(), all = packPlan(ds, o).flatMap((p) => p.photos.map((ph, i) => ({ p, ph, i })));
  let missing = 0, end: () => void = () => {}, fail: (e: unknown) => void = () => {};
  const finished = new Promise<void>((ok, bad) => { end = ok; fail = bad; });
  let chain = Promise.resolve();
  const zip = new Zip((err, chunk, final) => { if (err) return fail(err); chain = chain.then(() => sink.write(chunk)).then(() => (final ? sink.close().then(end) : undefined)).catch(fail); });
  try {
    const have = all.filter((x) => x.ph.drive), links: string[] = [];
    for (let i = 0; i < have.length; i += 50) links.push(...(await b.links(have.slice(i, i + 50).map((x) => ({ drive: x.ph.drive!, name: x.ph.name })))));
    let li = 0, n = 0;
    for (const { p, ph, i } of all) {
      onProgress(n++, all.length);
      if (!ph.drive) { missing++; continue; }
      const r = await fetch(links[li++]).catch(() => null);
      if (!r || !r.ok) { missing++; continue; }
      const f = new ZipPassThrough(`${p.cat}/${p.name}/${p.name}-${i + 1}.${ext(ph)}`); zip.add(f);
      f.push(new Uint8Array(await r.arrayBuffer()), true); // one photo at a time, never the whole set
    }
    onProgress(all.length, all.length); zip.end(); await finished;
  } catch (e) { await sink.abort().catch(() => {}); throw e; }
  return { missing };
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
    return { name: d.name, material: "PLA", colour: "", qty: 1, price: d.price ?? 0, cost: 0, designId: d.id, sku: d.no, ...(s ? { roughG: s.g, heightMm: s.mm } : {}) };
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
