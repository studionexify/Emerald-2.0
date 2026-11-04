/** Store records: printers, spools, accessories/parts, packing, movements, jobs, QC, packing records, tasks, bin, clients. */
import type { Signal } from "@preact/signals";
import { persisted, today, uid } from "./store";
import * as M from "../mock/data";
import * as XX from "../mock/extra";
import type { Binned, Job, Movement, PackItem, PackRecord, Printer, QcEntry, Spool, Task } from "../mock/types";

/** Persisted list that fills new fields from the seed (by id) so old saved rows gain them. */
const SEED_V = "3";
let fresh = false;
try { fresh = localStorage.getItem("emerald:seedv") !== SEED_V; } catch {}
/** Persisted list. On a new sample-data version, sample rows are refreshed; rows you added are kept. */
function list<T extends { id: string }>(key: string, seed: T[], fill: Partial<T> = {}): Signal<T[]> {
  const s = persisted<T[]>(key, seed);
  s.value = fresh ? [...seed.map((r) => ({ ...fill, ...r })), ...s.value.filter((r) => !seed.some((x) => x.id === r.id))]
    : s.value.map((r) => ({ ...fill, ...(seed.find((x) => x.id === r.id) ?? {}), ...r }));
  return s;
}
export const printersSig = list<Printer>("printers", M.printers, { active: true });
export const spoolsSig = list<Spool>("spools", M.spools, { active: true, tare: 250, diameter: 1.75, costKg: 1250, status: "open" });
export const packSig = list<PackItem>("packStock", M.packStock, { active: true });
export const itemsSig = list<PackItem>("accessories", XX.accessories as PackItem[], { active: true });
export const movesSig = persisted<Movement[]>("movements2", XX.movements as Movement[]);
export const jobsSig = list<Job>("jobs", M.jobs);
export const qcSig = list<QcEntry>("qc", M.qc);
export const packRecSig = list<PackRecord>("packRecords", XX.packRecords as PackRecord[]);
export const tasksSig = list<Task>("tasks", M.tasks);
export const binSig = persisted<Binned[]>("bin", M.bin);
export type Client = { id: string; name: string; kind: string; phone: string; email?: string; city: string; address?: string; gstin: string; medium: string; notes?: string; active?: boolean };
export const clientsSig = list<Client>("clients", XX.clients.map(({ orders: _o, value: _v, ...c }) => ({ ...c, active: true })));

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
  if (m.cat === "filament") spoolsSig.value = spoolsSig.value.map((s) => (m.item.includes(s.spoolNo) ? { ...s, grams: Math.max(0, s.grams + d), gross: Math.max(0, s.grams + d) + (s.tare ?? 0), status: s.grams + d <= 0 ? "empty" : s.status } : s));
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
export const jobSpool = (j: Job) => spoolsSig.value.find((s) => s.spoolNo === j.spool) ?? spoolsSig.value.find((s) => s.status === "loaded" && s.printer === j.printer);
/** Grams already promised to queued or printing jobs. */
export const committed = (s: Spool) => jobsSig.value.filter((j) => (j.status === "queued" || j.status === "printing") && jobSpool(j)?.id === s.id).reduce((a, j) => a + j.grams, 0);
export const spoolLabel = (s: Spool) => `${s.material} ${s.colour} · ${s.spoolNo}`;
