/** Data access. Phase 1 reads in-memory mock; phase 2 swaps in the API. */
import { effect } from "@preact/signals";
import { persisted as P } from "./store";
import type { Batch, BatchStage, ConKind, Consumption, Log, LogKind, Order, OrderType, Stage } from "../mock/types";
import { STAGE_LABEL, STAGE_ORDER } from "./flows";

export * from "../mock/types";

export const ordersSig = P<Order[]>("orders", []);
/** The PO stage was retired — anything still parked there moves on to Production. */
effect(() => { const o = ordersSig.value; if (o.some((x) => x.stage === "po")) ordersSig.value = o.map((x) => (x.stage === "po" ? { ...x, stage: "production" as const } : x)); });
export const batchesSig = P<Batch[]>("batches", []);
export const logsSig = P<Log[]>("logs", []);
export const consSig = P<Consumption[]>("consumption", []);
spoolUseSrc.value = consSig;
import { spoolUseSrc, spoolsSig, packSig, jobsSig, isSpoolItem, nextSpoolNo } from "./inventory";
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
import { setLogger, historySig } from "./ledger";
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
  spoolsSig.value = [...Array.from({ length: n }, (_, k) => ({ id: crypto.randomUUID(), material: mat, colour, brand: m.vendor, grams: 1000, size: 1000, spoolNo: nextSpoolNo(k + 1),
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
export function consume(d: { kind: ConKind; item: string; qty: number; orderNo?: string; batch?: string; printer?: string; /** print-run usage: counted against this spool, sync-safe */ spoolId?: string }) {
  let cost = d.qty * RATE[d.kind](d.item);
  if (d.kind === "filament" && !d.spoolId) spoolsSig.value = spoolsSig.value.map((s) => (isSpoolItem(d.item, s.spoolNo) ? { ...s, grams: Math.max(0, s.grams - d.qty) } : s));
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

export function createOrder(d: { type: OrderType; customer: string; item: string; qty: number; price: number; medium: string; due: string; delivery?: Order["delivery"]; supports?: boolean; material?: string; colour?: string; purpose?: string; size?: Order["size"]; b2b?: string; pay?: Order["pay"] }): Order {
  const max = nextOrderBase();
  const today = new Date().toISOString().slice(0, 10);
  const o: Order = { id: crypto.randomUUID(), no: `EM-${max + 1}`, type: d.type, customer: d.type === "inhouse" ? "Studio Nexify" : d.customer || "New client",
    medium: d.type === "inhouse" ? "Internal" : d.medium, stage: d.type === "inhouse" ? "production" : "quotation", created: today, due: d.due || today,
    delivery: d.delivery, supports: d.supports, size: d.type === "inhouse" ? undefined : d.size ?? (d.type === "bulk" ? "bulk" : "small"), b2b: d.size === "b2b" ? d.b2b : undefined, pay: d.pay ?? "alpha",
    items: [{ name: d.item || "Item", material: d.material || "PLA", colour: d.colour || "Black", qty: d.qty || 1, purpose: d.type === "inhouse" ? d.purpose || "Jig / tool" : undefined, price: d.type === "inhouse" ? 0 : d.price, cost: Math.round((d.price || 100) * 0.3) }] };
  ordersSig.value = [o, ...ordersSig.value]; log("Created order", `${o.no} · ${o.customer}`); return o;
}

export function batchAction(b: Batch, what: "print" | "invoice" | "tracking") {
  if (what === "print") batchSet(b, { done: b.units }, "Batch printed");
  // A dispatch invoice starts as a draft: the owner checks it and issues it, which takes the number.
  if (what === "invoice") { const o = ordersSig.value.find((x) => x.no === b.orderNo); const price = o?.items.find((i) => i.name === b.name)?.price ?? o?.items[0]?.price ?? 0;
    import("./invoicing").then(({ newDraft, lookupParty, blankParty }) => newDraft({ billTo: lookupParty({ name: b.customer }) ?? { ...blankParty(), name: b.customer }, orderNo: b.orderNo, batch: b.name, lines: [{ desc: b.name, hsn: "491199", qty: b.done || b.units, rate: price }] })); log("Drafted dispatch invoice", `${b.orderNo} · ${b.name}`); }
  if (what === "tracking") batchSet(b, { tracking: `TRK${Math.floor(Math.random() * 1e8)}` }, "Added tracking");
}

import { purgeSample } from "./store";
purgeSample();
registerBin("Order", ordersSig);
export * from "./mode";
import { shown as _shown, shownMoney as _sm, shownExp as _se } from "./mode";
import { moneySig as _money, expensesSig as _exp, billsSig as _bills, quotesSig as _quotes } from "./ledger";
/** View-filtered reads (Alpha / Beta). Writes always go to the full signals. */
export const vOrders = () => ordersSig.value.filter((o) => _shown(o.pay));
export const vMoney = () => _money.value.filter(_sm);
export const vExpenses = () => _exp.value.filter(_se);
export const vBills = () => _bills.value.filter((b) => _shown(b.pay));
export const vQuotes = () => _quotes.value.filter((q) => _shown(q.pay ?? ordersSig.value.find((o) => o.no === q.orderNo)?.pay));

/** Bulk tracking per line: good units printed, units wasted to bad prints, units still to print.
 *  Uses the counts stored on the line; falls back to this order's batches named after the line. */
export function lineProgress(o: Order, i: Order["items"][number], batches = batchesSig.value) {
  const all = batches.filter((b) => b.orderNo === o.no && b.name === i.name), mine = all.filter((b) => !b.running);
  const printed = i.printed ?? mine.reduce((s, b) => s + (b.done || 0), 0);
  const failed = i.failed ?? mine.reduce((s, b) => s + (b.failed ?? (b.stage !== "production" ? Math.max(0, b.units - b.done) : 0)), 0);
  const printing = all.filter((b) => b.running).reduce((s, b) => s + b.units, 0);
  return { printed, failed, printing, pending: Math.max(0, i.qty - printed) };
}
/** Print runs: start a run of N units on a printer with a spool, then log good / failed when it comes off. */
export function startRun(o: Order, item: string, units: number, printer: string, spools: { id: string; label: string }[]) {
  batchesSig.value = [...batchesSig.value, { id: crypto.randomUUID(), orderNo: o.no, customer: o.customer, name: item, units, done: 0, printer, spool: spools.map((x) => x.label).join(" + ") || undefined, spoolIds: spools.map((x) => x.id), running: true, at: new Date().toISOString(), by: me.value?.name, stage: "production" }];
  log("Started print", `${o.no} · ${units}× ${item} on ${printer}`);
}
/** A run's spools as {id, label}: by id for new runs; older runs fall back to spool numbers in the label. */
export function runSpools(b: Batch): { id: string; label: string }[] {
  const labels = b.spool ? b.spool.split(" + ") : [];
  if (b.spoolIds?.length) return b.spoolIds.map((id, k) => ({ id, label: labels[k] ?? id }));
  return labels.map((l) => { const no = l.split(" · ")[0].trim(); return { id: spoolsSig.value.find((s) => s.spoolNo === no)?.id ?? no, label: l }; });
}
export const spoolLabel = (s: { spoolNo: string; material: string; colour: string }) => `${s.spoolNo} · ${s.material} ${s.colour}`.trim();
/** Grams per piece for a product, learnt from its most recent finished run that logged grams. */
export function gramsPerPiece(item: string, batches = batchesSig.value) {
  const r = [...batches].reverse().find((b) => b.name === item && !b.running && b.grams && b.done + (b.failed ?? 0) > 0);
  if (!r) return 0;
  const g = Object.values(r.grams!).reduce((a, x) => a + x, 0);
  return g / (r.done + (r.failed ?? 0));
}
const addToLine = (o: Order, name: string, good: number, bad: number): Order =>
  o.items.some((i) => i.name === name && (i.printed !== undefined || i.failed !== undefined))
    ? patchOrder(o, { items: o.items.map((i) => (i.name === name && (i.printed !== undefined || i.failed !== undefined) ? { ...i, printed: Math.max(0, (i.printed ?? 0) + good), failed: Math.max(0, (i.failed ?? 0) + bad) } : i)) })
    : o;
export function finishRun(o: Order, id: string, good: number, bad: number, grams: Record<string, number> = {}, reason?: string): Order {
  const b = batchesSig.value.find((x) => x.id === id); if (!b) return o;
  // Filament used (good and failed pieces alike) comes off each spool and lands in the order's consumption.
  const cons: string[] = [];
  for (const [id, g] of Object.entries(grams)) { const sp = spoolsSig.value.find((x) => x.id === id); if (g > 0) cons.push(consume({ kind: "filament", item: sp ? spoolLabel(sp) : id, qty: g, orderNo: o.no, batch: b.name, printer: b.printer, spoolId: sp?.id }).id); }
  batchesSig.value = batchesSig.value.map((x) => (x.id === id ? { ...x, running: false, done: good, failed: bad, grams, cons, reason: bad > 0 ? reason || undefined : undefined, by: me.value?.name ?? x.by } : x));
  log("Print done", `${o.no} · ${b.name}: ${good} good, ${bad} failed on ${b.printer}${bad && reason ? ` (${reason})` : ""}`);
  return addToLine(o, b.name, good, bad);
}
/** Undo a finished run: counts come back off the line, grams go back on the spools, and the run is on the plate again to re-log. */
export function undoRun(o: Order, id: string): Order {
  const b = batchesSig.value.find((x) => x.id === id); if (!b || b.running) return o;
  // New runs: removing their usage rows puts the grams back. Older runs deducted directly, so add those back by hand.
  const rows = consSig.value.filter((c) => b.cons?.includes(c.id));
  for (const c of rows) if (!c.spoolId) spoolsSig.value = spoolsSig.value.map((s) => (isSpoolItem(c.item, s.spoolNo) || s.spoolNo === c.item ? { ...s, grams: s.grams + c.qty } : s));
  if (b.cons?.length) consSig.value = consSig.value.filter((c) => !b.cons!.includes(c.id));
  batchesSig.value = batchesSig.value.map((x) => (x.id === id ? { ...x, running: true, done: 0, failed: undefined, grams: undefined, cons: undefined, reason: undefined } : x));
  log("Undid print", `${o.no} · ${b.name}: ${b.done} good, ${b.failed ?? 0} failed`);
  return addToLine(o, b.name, -b.done, -(b.failed ?? 0));
}
/** Pace forecast for an order from its print runs: pieces per day since the first run, and the finish date at that pace. */
export function orderPace(o: Order, batches = batchesSig.value) {
  const runs = batches.filter((b) => b.orderNo === o.no && b.at && !b.running);
  if (!runs.length) return null;
  const first = Math.min(...runs.map((b) => Date.parse(b.at!)));
  const days = Math.max(1, (Date.now() - first) / 864e5);
  const made = runs.reduce((a, b) => a + b.done, 0), rate = made / days;
  const left = orderProgress(o, batches).pending;
  if (!left) return { rate, finish: null, late: 0 };
  if (rate <= 0) return { rate: 0, finish: null, late: Infinity };
  const finish = new Date(Date.now() + (left / rate) * 864e5).toISOString().slice(0, 10);
  const late = Math.round((Date.parse(finish) - Date.parse(o.due)) / 864e5);
  return { rate, finish, late };
}
/** Machines a line was printed on, from print batches and production jobs. */
export function lineMachines(o: Order, i: Order["items"][number], batches = batchesSig.value, jobs = jobsSig.value) {
  const m = new Map<string, number>();
  for (const b of batches) if (b.orderNo === o.no && b.name === i.name && b.printer) m.set(b.printer, (m.get(b.printer) ?? 0) + (b.done || 0));
  for (const j of jobs) if (j.orderNo === o.no && j.item === i.name && j.printer && !m.has(j.printer)) m.set(j.printer, 0);
  return [...m].map(([name, units]) => ({ name, units }));
}
export function orderProgress(o: Order, batches = batchesSig.value) {
  return o.items.reduce((t, i) => { const p = lineProgress(o, i, batches); return { qty: t.qty + i.qty, printed: t.printed + p.printed, failed: t.failed + p.failed, pending: t.pending + p.pending }; }, { qty: 0, printed: 0, failed: 0, pending: 0 });
}
