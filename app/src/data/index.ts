/** Data access. Phase 1 reads in-memory mock; phase 2 swaps in the API. */
import { signal } from "@preact/signals";
import * as M from "../mock/data";
import type { Batch, Log, Order, OrderType, Stage } from "../mock/types";
import { BATCH_STAGES, canAdvance, canAdvanceBatch, nextOf, STAGE_LABEL } from "./flows";

export * from "../mock/types";
export const db = M;

export const ordersSig = signal<Order[]>(M.orders);
export const batchesSig = signal<Batch[]>(M.batches);
export const logsSig = signal<Log[]>(M.logs);

export const STAGES: { key: Stage; label: string; n: number }[] = (["quotation", "po", "production", "qc", "packing", "invoice", "shipping", "archived"] as Stage[])
  .map((key, i) => ({ key, label: STAGE_LABEL[key], n: i + 1 }));

export const TYPE_LABEL: Record<OrderType, string> = { inhouse: "In-house", client: "Client", bulk: "Bulk" };

export const orderTotal = (o: Order) => o.items.reduce((s, i) => s + i.qty * i.price, 0);
export const orderCost = (o: Order) => o.items.reduce((s, i) => s + i.qty * i.cost, 0);
export const orderUnits = (o: Order) => o.items.reduce((s, i) => s + i.qty, 0);

export const inr = (n: number) => (n < 0 ? "−" : "") + "₹" + Math.abs(Math.round(n)).toLocaleString("en-IN");
export const shortDate = (d: string) => new Date(d + "T00:00:00").toLocaleDateString("en-IN", { day: "2-digit", month: "short" });

export function duplicateOrder(o: Order): Order {
  const max = Math.max(...ordersSig.value.map((x) => Number(x.no.split("-")[1])));
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

export * as X from "../mock/extra";
export * from "./flows";

const now = () => new Date().toISOString().slice(0, 16).replace("T", " ");
export function log(action: string, target: string) {
  logsSig.value = [{ id: crypto.randomUUID(), at: now(), who: "You", action, target }, ...logsSig.value];
}
const putOrder = (o: Order) => (ordersSig.value = ordersSig.value.map((x) => (x.id === o.id ? o : x)));
const putBatch = (b: Batch) => (batchesSig.value = batchesSig.value.map((x) => (x.id === b.id ? b : x)));

export function patchOrder(o: Order, p: Partial<Order>): Order { const n = { ...o, ...p }; putOrder(n); return n; }

/** Satisfy one gate check (mock: a real build opens that stage's form). */
export function satisfy(o: Order, field: keyof Order): Order {
  const val = field === "po" ? `PO/${Math.floor(Math.random() * 9000 + 1000)}` : field === "tracking" ? `TRK${Math.floor(Math.random() * 1e8)}` : true;
  const n = { ...o, [field]: val } as Order;
  putOrder(n); log(`Recorded ${String(field)}`, o.no); return n;
}

export function advance(o: Order): Order | null {
  if (!canAdvance(o, batchesSig.value).ok) return null;
  const to = nextOf(o); if (!to) return null;
  const n = { ...o, stage: to };
  putOrder(n); log(`Moved to ${STAGE_LABEL[to]}`, o.no);
  if (o.type === "bulk" && to === "production" && !batchesSig.value.some((b) => b.orderNo === o.no)) {
    const units = orderUnits(o);
    batchesSig.value = [...batchesSig.value, { id: crypto.randomUUID(), orderNo: o.no, customer: o.customer, name: "Batch 1", units, done: 0, stage: "production" }];
  }
  return n;
}

export function batchAction(b: Batch, what: "print" | "invoice" | "tracking" | "advance") {
  if (what === "print") putBatch({ ...b, done: b.units });
  if (what === "invoice") { putBatch({ ...b, invoiceNo: `B/26-27/${String(Math.floor(Math.random() * 900 + 63)).padStart(4, "0")}` }); log("Raised dispatch invoice", `${b.orderNo} · ${b.name}`); }
  if (what === "tracking") putBatch({ ...b, tracking: `TRK${Math.floor(Math.random() * 1e8)}` });
  if (what === "advance" && canAdvanceBatch(b).ok) { const to = BATCH_STAGES[BATCH_STAGES.indexOf(b.stage) + 1]; putBatch({ ...b, stage: to }); log(`Batch → ${to}`, `${b.orderNo} · ${b.name}`); }
}

export function addBatch(o: Order) {
  const n = batchesSig.value.filter((b) => b.orderNo === o.no).length + 1;
  batchesSig.value = [...batchesSig.value, { id: crypto.randomUUID(), orderNo: o.no, customer: o.customer, name: `Batch ${n}`, units: 50, done: 0, stage: "production" }];
}

export function createOrder(d: { type: OrderType; customer: string; item: string; qty: number; price: number; medium: string; due: string }): Order {
  const max = Math.max(...ordersSig.value.map((x) => Number(x.no.split("-")[1])));
  const today = new Date().toISOString().slice(0, 10);
  const o: Order = { id: crypto.randomUUID(), no: `EM-${max + 1}`, type: d.type, customer: d.type === "inhouse" ? "Studio Nexify" : d.customer || "New client",
    medium: d.type === "inhouse" ? "Internal" : d.medium, stage: d.type === "inhouse" ? "production" : "quotation", created: today, due: d.due || today,
    items: [{ name: d.item || "Item", material: "PLA", colour: "Black", qty: d.qty || 1, price: d.type === "inhouse" ? 0 : d.price, cost: Math.round((d.price || 100) * 0.3) }] };
  ordersSig.value = [o, ...ordersSig.value]; log("Created order", `${o.no} · ${o.customer}`); return o;
}
