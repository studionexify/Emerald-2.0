/** One source of truth for the three order flows (In-house · Client · Bulk). */
import type { Batch, BatchStage, Order, OrderType, Stage } from "../mock/types";

export const STAGE_LABEL: Record<Stage, string> = {
  quotation: "Quotation", po: "PO approval", production: "Production", qc: "QC & Logging",
  packing: "Packing", invoice: "Invoice", shipping: "Shipping", archived: "Archive",
};

export const FLOWS: Record<OrderType, Stage[]> = {
  inhouse: ["production", "qc", "packing", "archived"],
  client: ["quotation", "production", "qc", "packing", "invoice", "shipping", "archived"],
  // Bulk: after PO approval the order lives in "production" while its batches run their own stages.
  bulk: ["quotation", "po", "production", "archived"],
};

export const FLOW_NOTE: Record<OrderType, string> = {
  inhouse: "Starts at Production · Packing optional · no invoice or shipping · cost goes to “Internal jobs”",
  client: "Pay on delivery — no payment gate · unpaid invoices tracked in Debtors and Attention",
  bulk: "PO first · each batch runs Production → QC → Packing → Invoice → Shipping · archives when every batch ships",
};

export const BATCH_STAGES: BatchStage[] = ["production", "qc", "packing", "invoice", "shipping", "done"];
export const BATCH_LABEL: Record<BatchStage, string> = { production: "Production", qc: "QC", packing: "Packing", invoice: "Invoice", shipping: "Shipping", done: "Shipped" };

export const flowOf = (o: Order) => FLOWS[o.type].filter((s) => !(s === "packing" && o.type === "inhouse" && o.skipPacking));
export const nextOf = (o: Order) => { const f = flowOf(o); return f[f.indexOf(o.stage) + 1] as Stage | undefined; };

export type Check = { label: string; done: boolean; field: keyof Order; action: string };

/** What the current stage needs before the order may leave it. */
export function checks(o: Order, batches: Batch[]): Check[] {
  switch (o.stage) {
    case "quotation": return [
      { label: "Customer approved the quotation", done: !!o.approved, field: "approved", action: "Mark approved" },
      { label: "Build sheet filled", done: !!o.buildSheet, field: "buildSheet", action: "Fill build sheet" }];
    case "po": return [{ label: "Purchase order received", done: !!o.po, field: "po", action: "Enter PO number" }];
    case "production":
      if (o.type === "bulk") { const bs = batches.filter((b) => b.orderNo === o.no); return [{ label: `All batches shipped (${bs.filter((b) => b.stage === "done").length}/${bs.length})`, done: bs.length > 0 && bs.every((b) => b.stage === "done"), field: "jobsDone", action: "" }]; }
      return [{ label: "Build sheet filled", done: !!o.buildSheet, field: "buildSheet", action: "Fill build sheet" }, { label: "Every job off the floor", done: !!o.jobsDone, field: "jobsDone", action: "Mark jobs done" }];
    case "qc": return [{ label: "At least one QC entry", done: !!o.qcLogged, field: "qcLogged", action: "Log QC" }];
    case "packing": return [{ label: "Packing materials recorded", done: !!o.packed, field: "packed", action: "Record packing" }];
    case "invoice": return [{ label: "Tax invoice raised", done: !!o.invoiced, field: "invoiced", action: "Raise invoice" }];
    case "shipping": return [{ label: "Tracking number added", done: !!o.tracking, field: "tracking", action: "Add tracking" }];
    default: return [];
  }
}

export function canAdvance(o: Order, batches: Batch[]): { ok: boolean; reason: string } {
  if (o.stage === "archived") return { ok: false, reason: "Archived — read-only, cost rollup final" };
  if (o.blocked) return { ok: false, reason: o.blocked };
  const miss = checks(o, batches).find((c) => !c.done);
  return miss ? { ok: false, reason: miss.label.startsWith("All batches") ? "Every batch must be shipped first" : `Needs: ${miss.label.toLowerCase()}` } : { ok: true, reason: "" };
}

export function canAdvanceBatch(b: Batch): { ok: boolean; reason: string } {
  if (b.stage === "done") return { ok: false, reason: "Shipped" };
  if (b.stage === "production" && b.done < b.units) return { ok: false, reason: `Printed ${b.done}/${b.units}` };
  if (b.stage === "invoice" && !b.invoiceNo) return { ok: false, reason: "Raise this dispatch's invoice" };
  if (b.stage === "shipping" && !b.tracking) return { ok: false, reason: "Add tracking" };
  return { ok: true, reason: "" };
}
