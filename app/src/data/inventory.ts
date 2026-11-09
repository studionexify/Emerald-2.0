/** Store records: printers, spools, accessories/parts, packing, movements, jobs, QC, packing records, tasks, bin, clients. */
import type { Signal } from "@preact/signals";
import { effect, signal } from "@preact/signals";
import { persisted, today, uid } from "./store";
import { B2B_TYPES } from "../mock/types";
import type { Binned, Job, Movement, PackItem, PackRecord, Printer, QcEntry, Spool, Task } from "../mock/types";

/** Persisted list that fills new fields from the seed (by id) so old saved rows gain them. */
const SEED_V = "3";
let fresh = false;
let real = false;
try { fresh = localStorage.getItem("emerald:seedv") !== SEED_V; real = !!localStorage.getItem("emerald:e1"); } catch {}
/** Persisted list. On a new sample-data version, sample rows are refreshed; rows you added are kept. */
function list<T extends { id: string }>(key: string, seed: T[], fill: Partial<T> = {}): Signal<T[]> {
  const s = persisted<T[]>(key, real ? [] : seed);
  if (real) return s; // migrated studio data: sample rows never come back
  s.value = fresh ? [...seed.map((r) => ({ ...fill, ...r })), ...s.value.filter((r) => !seed.some((x) => x.id === r.id))]
    : s.value.map((r) => ({ ...fill, ...(seed.find((x) => x.id === r.id) ?? {}), ...r }));
  return s;
}
export const printersSig = list<Printer>("printers", [], { active: true });
export const spoolsSig = list<Spool>("spools", [], { active: true, tare: 250, diameter: 1.75, costKg: 1250, status: "open" });
export const packSig = list<PackItem>("packStock", [], { active: true });
export const itemsSig = list<PackItem>("accessories", [], { active: true });
export const movesSig = persisted<Movement[]>("movements2", []);
export const jobsSig = list<Job>("jobs", []);
export const qcSig = list<QcEntry>("qc", []);
export const packRecSig = list<PackRecord>("packRecords", []);
export const tasksSig = list<Task>("tasks", []);
export const binSig = persisted<Binned[]>("bin", []);
/** The Bin keeps a deletion for 7 days, then it is gone for good (blueprint 18). */
export const BIN_DAYS = 7;
{ const cut = new Date(Date.now() - BIN_DAYS * 864e5).toISOString().slice(0, 10); if (binSig.value.some((b) => b.deletedAt < cut)) binSig.value = binSig.value.filter((b) => b.deletedAt >= cut); }
export type Client = { id: string; name: string; kind: string; phone: string; email?: string; city: string; address?: string; gstin: string; medium: string; notes?: string; active?: boolean };
export const clientsSig = list<Client>("clients", []);
/** A client with a GSTIN is a business: their orders default to B2B, typed by the client's business kind. */
export function b2bFor(name: string): { size: "b2b"; b2b: string } | null {
  const c = clientsSig.value.find((x) => x.name.trim().toLowerCase() === name.trim().toLowerCase());
  if (!c?.gstin?.trim()) return null;
  return { size: "b2b", b2b: B2B_TYPES.find((t) => t.toLowerCase() === c.medium?.trim().toLowerCase()) ?? "Other" };
}

/** Bin registry: kind → list it came from, so Restore puts it back. */
const REG: Record<string, Signal<{ id: string }[]>> = {};
export function registerBin(kind: string, sig: Signal<any[]>) { REG[kind] = sig; }
export function toBin(kind: string, row: { id: string }, label: string, by: string) {
  const sig = REG[kind]; if (sig) sig.value = sig.value.filter((r) => r.id !== row.id);
  binSig.value = [{ id: uid(), kind, label, deletedAt: today(), by, data: row }, ...binSig.value];
}
export function restoreBin(b: Binned) {
  const sig = REG[b.kind]; if (sig && b.data) sig.value = [b.data as { id: string }, ...sig.value];
  binSig.value = binSig.value.filter((x) => x.id !== b.id);
}
export const purgeBin = (b: Binned) => (binSig.value = binSig.value.filter((x) => x.id !== b.id));
export const canRestore = (b: Binned) => !!REG[b.kind] && !!b.data;

registerBin("Printer", printersSig); registerBin("Spool", spoolsSig); registerBin("Packing item", packSig); registerBin("Accessory / part", itemsSig);
registerBin("Movement", movesSig); registerBin("Job", jobsSig); registerBin("QC entry", qcSig); registerBin("Packing record", packRecSig);
registerBin("Task", tasksSig); registerBin("Client", clientsSig);

/** Spool maths — net is always gross − tare. */
export const spoolPct = (s: Spool) => Math.max(0, Math.min(100, Math.round((s.grams / (s.size || 1000)) * 100)));
export const spoolValue = (s: Spool) => (s.grams / 1000) * (s.costKg ?? 1250);
export const REORDER_G = 1000;

/** Apply a stock movement to the matching record and keep it in the ledger. Unit cost is the price at that time. */
export function applyMove(m: Movement, record = true) {
  const d = m.dir === "in" ? m.qty : -m.qty;
  if (m.cat === "filament") spoolsSig.value = spoolsSig.value.map((s) => (isSpoolItem(m.item, s.spoolNo) ? { ...s, grams: Math.max(0, s.grams + d), gross: Math.max(0, s.grams + d) + (s.tare ?? 0), status: s.grams + d <= 0 ? "empty" : s.status } : s));
  else if (m.cat === "packing") packSig.value = packSig.value.map((p) => (p.name === m.item ? { ...p, qty: Math.max(0, p.qty + d), cost: m.dir === "in" && m.unitCost ? m.unitCost : p.cost } : p));
  else itemsSig.value = itemsSig.value.map((p) => (p.name === m.item ? { ...p, qty: Math.max(0, p.qty + d), cost: m.dir === "in" && m.unitCost ? m.unitCost : p.cost } : p));
  if (record) movesSig.value = [m, ...movesSig.value];
}
export const stockNames = (cat: string) =>
  cat === "filament" ? spoolsSig.value.filter((s) => s.active !== false).map((s) => `${s.material} ${s.colour} · ${s.spoolNo}`)
  : cat === "packing" ? packSig.value.filter((p) => p.active !== false).map((p) => p.name)
  : itemsSig.value.filter((p) => p.active !== false && (cat === "part" ? p.cat === "Part" : cat === "accessory" ? p.cat === "Accessory" : true)).map((p) => p.name);

try { localStorage.setItem("emerald:seedv", SEED_V); } catch {}

/** Which spool a job draws from: its own, else the spool loaded on its printer. */
/** True when a ledger/consumption item string names this exact spool ("PLA Black · SP-001", not SP-0011). */
export const isSpoolItem = (item: string, no: string) => item === no || item.endsWith(` · ${no}`) || item.includes(` · ${no} `);
export const nextSpoolNo = (k = 1) => { const max = spoolsSig.value.reduce((m, x) => Math.max(m, Number((x.spoolNo.match(/\d+/g) ?? ["0"]).pop())), 0); return `SP-${String(max + k).padStart(3, "0")}`; };
export const jobSpool = (j: Job) => spoolsSig.value.find((s) => s.spoolNo === j.spool) ?? spoolsSig.value.find((s) => s.status === "loaded" && s.printer === j.printer);
/** Grams already promised to queued or printing jobs. */
export const committed = (s: Spool) => jobsSig.value.filter((j) => (j.status === "queued" || j.status === "printing") && jobSpool(j)?.id === s.id).reduce((a, j) => a + j.grams, 0);
export const spoolLabel = (s: Spool) => `${s.material} ${s.colour} · ${s.spoolNo}`;

/** Printer stats from real print jobs: failure %, job count and hours. Utilisation/uptime need downtime logging, which isn't recorded, so they read as unknown (0 / 100). */
export function machineStats(printer: string) {
  const js = jobsSig.value.filter((j) => j.printer === printer && (j.status === "done" || j.status === "failed"));
  const failed = js.filter((j) => j.status === "failed").length;
  return { jobs: js.length, fail: js.length ? Math.round((failed / js.length) * 100) : 0, hours: Math.round(js.reduce((a, j) => a + j.hours, 0)), util: 0, uptime: 100, lost: 0, blocks: 0 };
}

/** Production segment: who the work is for. Client = small retail orders; Bulk = bulk + B2B (shops, stationery, gift, corporate); In-house = our own. */
export type Segment = "client" | "bulk" | "inhouse";
export const SEGMENT_LABEL: Record<Segment, string> = { client: "Client", bulk: "Bulk & B2B", inhouse: "In-house" };
export const SEGMENT_HREF: Record<Segment, string> = { client: "/work", bulk: "/work/b2b", inhouse: "/work/inhouse" };
export function segmentOf(o: { type: string; size?: string; customer: string }): Segment {
  if (o.type === "inhouse") return "inhouse";
  if (o.size) return o.size === "small" ? "client" : "bulk";
  if (o.type === "bulk") return "bulk";
  const c = clientsSig.value.find((x) => x.name.trim().toLowerCase() === o.customer.trim().toLowerCase());
  return c && (c.kind === "Business" || c.gstin) ? "bulk" : "client";
}

/** Cross-page jump: set the order to open, then navigate to its production page (read once by the page). */
export const openOrderSig = signal<string | null>(null);
/** Custom To-do lists (beyond the smart lists). */
export const taskListsSig = persisted<string[]>("task-lists", ["Studio", "Purchases"]);

/** Spool number on the label: per material + colour + brand. A new spool takes the lowest number not held by a spool that still has filament
 *  (7 spools, #4 runs empty → the next one bought becomes #4). Numbers are fixed once given. */
export const spoolGroup = (s: Spool) => `${s.material}|${s.colour}|${s.brand}`.toLowerCase();
export function assignSlots(list: Spool[]): Spool[] {
  if (!list.some((s) => s.slot == null)) return list;
  const held = new Map<string, Set<number>>();
  const live = (s: Spool) => s.grams > 0 && s.active !== false;
  for (const s of list) if (s.slot != null && live(s)) { const g = spoolGroup(s); if (!held.has(g)) held.set(g, new Set()); held.get(g)!.add(s.slot); }
  const order = [...list].sort((a, b) => Number(live(b)) - Number(live(a)) || (a.bought ?? "").localeCompare(b.bought ?? ""));
  const give = new Map<string, number>();
  for (const s of order) {
    if (s.slot != null) continue;
    const g = spoolGroup(s); if (!held.has(g)) held.set(g, new Set()); const h = held.get(g)!;
    let n = 1; while (h.has(n)) n++;
    give.set(s.id, n); if (live(s)) h.add(n);
  }
  return list.map((s) => (give.has(s.id) ? { ...s, slot: give.get(s.id) } : s));
}
effect(() => { const l = spoolsSig.value; const n = assignSlots(l); if (n !== l) queueMicrotask(() => { spoolsSig.value = assignSlots(spoolsSig.value); }); });

/** Human label for a stock item string: "PLA Black · SP-0042" → "PLA Black Polymaker #3". */
export function itemLabel(item: string): string {
  const m = /· (SP-\d+)\s*$/.exec(item); if (!m) return item;
  const sp = spoolsSig.value.find((x) => x.spoolNo === m[1]); if (!sp) return item;
  return `${sp.material} ${sp.colour} ${sp.brand}${sp.slot != null ? ` #${sp.slot}` : ""}`;
}

/* ---------------------------------------------------------------- Filament master (settings) */
export type FilMat = { name: string; hex?: string; nozzle?: string; bed?: string; costKg?: number };
export type SpoolBody = { name: string; tare: number };
export type FilColour = { name: string; hex: string };
export type FilMaster = { materials: FilMat[]; colours: FilColour[]; brands: string[]; finishes: string[]; bodies: SpoolBody[]; sizes: number[]; diameters: number[]; body: string; size: number; tare: number; diameter: number; costKg: number; lowG: number; reorderG: number };
const eqi = (a?: string, b?: string) => (a ?? "").trim().toLowerCase() === (b ?? "").trim().toLowerCase();
const FM_DEF: FilMaster = { materials: [], colours: [], brands: [], finishes: [],
  bodies: [{ name: "Plastic", tare: 250 }, { name: "Cardboard", tare: 150 }, { name: "Plastic (large)", tare: 600 }, { name: "Metal", tare: 900 }],
  sizes: [250, 500, 750, 1000, 2000, 3000, 5000], diameters: [1.75, 2.85], body: "Plastic", size: 1000, tare: 250, diameter: 1.75, costKg: 1250, lowG: 250, reorderG: 1000 };
export const filMasterSig = persisted<FilMaster>("filMaster", FM_DEF);
filMasterSig.value = { ...FM_DEF, ...filMasterSig.value };
export const bodyTare = (name?: string) => filMasterSig.value.bodies.find((b) => eqi(b.name, name))?.tare;
/** Names already used on spools join the master, so it never starts empty. */
effect(() => {
  const m = filMasterSig.peek(), sp = spoolsSig.value;
  const mats = [...m.materials], cols = [...m.colours], brands = [...m.brands], fin = [...m.finishes]; let ch = false;
  for (const s of sp) {
    if (s.material && !mats.some((x) => eqi(x.name, s.material))) { mats.push({ name: s.material, nozzle: s.nozzle, bed: s.bed }); ch = true; }
    if (s.colour && !cols.some((x) => eqi(x.name, s.colour))) { cols.push({ name: s.colour, hex: s.hex && s.hex !== "#000000" ? s.hex : "" }); ch = true; }
    if (s.brand && !brands.some((x) => eqi(x, s.brand))) { brands.push(s.brand); ch = true; }
    if (s.finish && !fin.some((x) => eqi(x, s.finish))) { fin.push(s.finish); ch = true; }
  }
  if (ch) filMasterSig.value = { ...m, materials: mats, colours: cols, brands, finishes: fin };
});
export const masterMat = (name: string) => filMasterSig.value.materials.find((x) => eqi(x.name, name));
export const masterColour = (name?: string) => filMasterSig.value.colours.find((x) => eqi(x.name, name));
/** Rename a master entry and every spool that uses it. */
export function renameMaster(field: "material" | "colour" | "brand" | "finish", from: string, to: string) {
  if (!to.trim() || from === to) return;
  spoolsSig.value = spoolsSig.value.map((s) => (eqi(s[field] as string, from) ? { ...s, [field]: to.trim() } : s));
}
export const masterUse = (field: "material" | "colour" | "brand" | "finish", name: string) => spoolsSig.value.filter((s) => s.active !== false && eqi(s[field] as string, name)).length;
