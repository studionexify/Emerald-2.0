/** Data access. Phase 1 reads in-memory mock; phase 2 swaps in the API. */
import { signal } from "@preact/signals";
import * as M from "../mock/data";
import type { Order, OrderType, Stage } from "../mock/types";

export * from "../mock/types";
export const db = M;

export const ordersSig = signal<Order[]>(M.orders);

export const STAGES: { key: Stage; label: string; n: number }[] = [
  { key: "quotation", label: "Quotation", n: 1 },
  { key: "production", label: "Production", n: 2 },
  { key: "qc", label: "QC & Logging", n: 3 },
  { key: "packing", label: "Packing", n: 4 },
  { key: "invoice", label: "Invoice", n: 5 },
  { key: "shipping", label: "Shipping", n: 6 },
  { key: "archived", label: "Archive", n: 7 },
];

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
  };
  ordersSig.value = [copy, ...ordersSig.value];
  return copy;
}

export const GATE: Record<Stage, string> = {
  quotation: "Needs customer approval and a build sheet",
  production: "Every job must be off the floor",
  qc: "Needs at least one QC entry",
  packing: "Needs packing materials recorded",
  invoice: "Needs a tax invoice raised",
  shipping: "Needs a tracking number",
  archived: "Read-only — cost rollup final",
};
export * as X from "../mock/extra";

/** In-house work has no customer to bill: it skips the Invoice stage. */
export const stagesFor = (o: Order) => (o.type === "inhouse" ? STAGES.filter((s) => s.key !== "invoice") : STAGES);
export const nextStage = (o: Order) => { const l = stagesFor(o); const i = l.findIndex((s) => s.key === o.stage); return l[i + 1]; };
