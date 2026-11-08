/** Data access. Phase 1 reads in-memory mock; phase 2 swaps in the API. */
import { persisted as P } from "./store";
import type { Batch, BatchStage, ConKind, Consumption, Log, LogKind, Order, OrderType, Stage } from "../mock/types";
import { STAGE_LABEL, STAGE_ORDER } from "./flows";

export * from "../mock/types";

export const ordersSig = P<Order[]>("orders", []);
export const batchesSig = P<Batch[]>("batches", []);
export const logsSig = P<Log[]>("logs", []);
export const consSig = P<Consumption[]>("consumption", []);
import { spoolsSig, packSig } from "./inventory";
export * from "./inventory";

export const STAGES = STAGE_ORDER.map((key, i) => ({ key, label: STAGE_LABEL[key], n: i + 1 }));

export const TYPE_LABEL: Record<OrderType, string> = { inhouse: "In-house", client: "Client", bulk: "Bulk" };

export const orderTotal = (o: Order) => o.items.reduce((s, i) => s + i.qty * i.price, 0);
export const orderCost = (o: Order) => o.items.reduce((s, i) => s + i.qty * i.cost, 0);
export const orderUnits = (o: Order) => o.items.reduce((s, i) => s + i.qty, 0);

export const inr = (n: number) => (n < 0 ? "−" : "") + "₹" + Math.abs(Math.round(n)).toLocaleString("en-IN");
export const shortDate = (d: string) => new Date(d + "T00:00:00").toLocaleDateString("en-IN", { day: "2-digit", month: "short" });

export function duplicateOrder(o: Order): Order {
  const max = nextOrderBase();
  const today = new Date().toISOString().slice(0, 10);
  const copy: Order = {
    ...o, id: crypto.randomUUID(), no: `EM-${max + 1}`, stage: o.type === "inhouse" ? "production" : "quotation",
    created: today, due: today, items: o.items.map((i) => ({ ...i })), blocked: undefined, invoiced: false,
    approved: false, jobsDone: false, qcLogged: false, packed: false, tracking: undefined, po: undefined, paid: false,
  };
  ordersSig.value = [copy, ...ordersSig.value];
  log("Duplicated order", `${o.no} → ${copy.no}`);
  return copy;
}

export * from "./flows";
export * from "./rates";
export * from "./store";
export * from "./ledger";
export * from "./auth";
export * from "./image";
export * from "./media";
import { me } from "./auth";
import { setLogger, historySig, raiseInvoice } from "./ledger";
import { rate } from "./rates";

const now = () => new Date().toISOString().slice(0, 16).replace("T", " ");
export function log(action: string, target: string, kind: LogKind = "order") {
  logsSig.value = [{ id: crypto.randomUUID(), at: now(), who: me.value?.name ?? "You", action, target, kind }, ...logsSig.value];
}
setLogger(log);
import { applyMove, registerBin } from "./inventory";
import { setStockSink } from "./ledger";
/** Filament on a bill arrives as sealed 1 kg spools (material and colour read from the line); other stock tops up its item. */
setStockSink((m) => {
  if (m.cat !== "filament") return applyMove(m);
  const mat = /PETG|ABS|TPU|ASA|PLA/i.exec(m.item)?.[0].toUpperCase() ?? "PLA";
  const colour = m.item.split("/").pop()?.trim() || "—";
  const n = Math.max(1, Math.round(m.qty / 1000));
  const base = spoolsSig.value.length;
  spoolsSig.value = [...Array.from({ length: n }, (_, k) => ({ id: crypto.randomUUID(), material: mat, colour, brand: m.vendor, grams: 1000, size: 1000, spoolNo: `SP-${String(base + k + 1).padStart(3, "0")}`,
    tare: 250, gross: 1250, costKg: Math.round(m.unitCost * 1000), vendor: m.vendor, bought: m.date, status: "sealed" as const, active: true, notes: m.notes })), ...spoolsSig.value];
  applyMove({ ...m, item: `${mat} ${colour}` }, true);
});
/** Highest EM-number in use (bulk orders carry other ids), at least 1000. */
const nextOrderBase = () => Math.max(1000, ...ordersSig.value.map((x) => Number(/^EM-(\d+)$/.exec(x.no)?.[1] ?? 0)));
const putOrder = (o: Order) => (ordersSig.value = ordersSig.value.map((x) => (x.id === o.id ? o : x)));
const putBatch = (b: Batch) => (batchesSig.value = batchesSig.value.map((x) => (x.id === b.id ? b : x)));

export function patchOrder(o: Order, p: Partial<Order>): Order { const n = { ...o, ...p }; putOrder(n); return n; }

/** Satisfy one gate check (mock: a real build opens that stage's form). */
export function satisfy(o: Order, field: keyof Order): Order {
  const val = field === "po" ? `PO/${Math.floor(Math.random() * 9000 + 1000)}` : field === "tracking" ? `TRK${Math.floor(Math.random() * 1e8)}` : true;
  const n = { ...o, [field]: val } as Order;
  putOrder(n); log(`Recorded ${String(field)}`, o.no); return n;
}

/** Move to any stage — no gates. */
export function moveTo(o: Order, to: Stage, reason = ""): Order {
  const n = { ...o, stage: to };
  putOrder(n); log(`${STAGE_LABEL[o.stage]} → ${STAGE_LABEL[to]}${reason ? ` (${reason})` : ""}`, o.no);
  historySig.value = [{ id: crypto.randomUUID(), orderNo: o.no, from: o.stage, to, by: me.value?.name ?? "You", at: now(), reason }, ...historySig.value];
  return n;
}

export function batchSet(b: Batch, p: Partial<Batch>, what: string) { putBatch({ ...b, ...p }); log(what, `${b.orderNo} · ${b.name}`); }
export const batchTo = (b: Batch, to: BatchStage) => batchSet(b, { stage: to }, `Batch → ${to}`);

const perG = (item: string) => rate(/PETG/.test(item) ? "petg" : /TPU/.test(item) ? "tpu" : /ABS/.test(item) ? "abs" : "pla") / 1000;
const RATE: Record<ConKind, (item: string) => number> = { filament: perG, scrap: perG, packing: () => 0, accessory: () => 0, part: () => 0, machine: () => rate("machine"), power: () => rate("power"), labour: () => rate("labour"), freight: () => 1 };
export const UNIT: Record<ConKind, string> = { filament: "g", packing: "pcs", accessory: "pcs", part: "pcs", machine: "h", power: "h", labour: "h", freight: "₹", scrap: "g" };

/** Record any consumption; decrements stock where it applies and writes a log row. */
export function consume(d: { kind: ConKind; item: string; qty: number; orderNo?: string; batch?: string; printer?: string }) {
  let cost = d.qty * RATE[d.kind](d.item);
  if (d.kind === "filament") spoolsSig.value = spoolsSig.value.map((s) => (d.item.includes(s.spoolNo) ? { ...s, grams: Math.max(0, s.grams - d.qty) } : s));
  if (d.kind === "packing") {
    const it = packSig.value.find((p) => p.name === d.item); if (it) cost = it.cost * d.qty;
    packSig.value = packSig.value.map((p) => (p.name === d.item ? { ...p, qty: Math.max(0, p.qty - d.qty) } : p));
  }
  const e: Consumption = { id: crypto.randomUUID(), at: now(), who: me.value?.name ?? "You", unit: UNIT[d.kind], cost: Math.round(cost), ...d };
  consSig.value = [e, ...consSig.value];
  log(`Consumed ${d.qty} ${e.unit} ${d.item}`, d.orderNo ?? "Store", "consumption");
  return e;
}
export const orderConsumption = (no: string) => consSig.value.filter((c) => c.orderNo === no);

export function addBatch(o: Order) {
  const n = batchesSig.value.filter((b) => b.orderNo === o.no).length + 1;
  batchesSig.value = [...batchesSig.value, { id: crypto.randomUUID(), orderNo: o.no, customer: o.customer, name: `Batch ${n}`, units: 50, done: 0, stage: "production" }];
}

export function createOrder(d: { type: OrderType; customer: string; item: string; qty: number; price: number; medium: string; due: string; delivery?: Order["delivery"]; supports?: boolean; material?: string; colour?: string }): Order {
  const max = nextOrderBase();
  const today = new Date().toISOString().slice(0, 10);
  const o: Order = { id: crypto.randomUUID(), no: `EM-${max + 1}`, type: d.type, customer: d.type === "inhouse" ? "Studio Nexify" : d.customer || "New client",
    medium: d.type === "inhouse" ? "Internal" : d.medium, stage: d.type === "inhouse" ? "production" : "quotation", created: today, due: d.due || today,
    delivery: d.delivery, supports: d.supports,
    items: [{ name: d.item || "Item", material: d.material || "PLA", colour: d.colour || "Black", qty: d.qty || 1, price: d.type === "inhouse" ? 0 : d.price, cost: Math.round((d.price || 100) * 0.3) }] };
  ordersSig.value = [o, ...ordersSig.value]; log("Created order", `${o.no} · ${o.customer}`); return o;
}

export function batchAction(b: Batch, what: "print" | "invoice" | "tracking") {
  if (what === "print") batchSet(b, { done: b.units }, "Batch printed");
  if (what === "invoice") batchSet(b, { invoiceNo: raiseInvoice({ customer: b.customer, orderNo: b.orderNo, batch: b.name, lines: [{ desc: b.name, hsn: "491199", qty: b.done || b.units, rate: ordersSig.value.find((o) => o.no === b.orderNo)?.items.find((i) => i.name === b.name)?.price ?? ordersSig.value.find((o) => o.no === b.orderNo)?.items[0]?.price ?? 0 }] }).no }, "Raised dispatch invoice");
  if (what === "tracking") batchSet(b, { tracking: `TRK${Math.floor(Math.random() * 1e8)}` }, "Added tracking");
}

import { purgeSample } from "./store";
purgeSample();
registerBin("Order", ordersSig);
