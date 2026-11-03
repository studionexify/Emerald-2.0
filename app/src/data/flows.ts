/** Order types suggest a path; nothing is gated. Any order may move to any stage, forward or back. */
import type { Batch, BatchStage, Order, OrderType, Stage } from "../mock/types";

export const STAGE_ORDER: Stage[] = ["quotation", "po", "production", "qc", "packing", "invoice", "shipping", "archived"];
export const STAGE_LABEL: Record<Stage, string> = {
  quotation: "Quotation", po: "PO", production: "Production", qc: "QC & Logging",
  packing: "Packing", invoice: "Invoice", shipping: "Shipping", archived: "Archive",
};

/** Suggested paths — hints only. */
export const SUGGESTED: Record<OrderType, Stage[]> = {
  inhouse: ["production", "qc", "packing", "archived"],
  client: ["quotation", "production", "qc", "packing", "invoice", "shipping", "archived"],
  bulk: ["quotation", "po", "production", "qc", "packing", "invoice", "shipping", "archived"],
};
export const FLOW_NOTE: Record<OrderType, string> = {
  inhouse: "Usually Production → QC → Packing → Archive · every stage still available",
  client: "Pay on delivery · usually Quotation → … → Shipping → Archive · every stage available",
  bulk: "Usually PO first, then batches each with their own QC, packing, invoice and dispatch · every stage available",
};

export const BATCH_STAGES: BatchStage[] = ["production", "qc", "packing", "invoice", "shipping", "done"];
export const BATCH_LABEL: Record<BatchStage, string> = { production: "Production", qc: "QC", packing: "Packing", invoice: "Invoice", shipping: "Shipping", done: "Shipped" };

/** Next stage: next on the suggested path, else next overall. */
export const nextOf = (o: Order): Stage | undefined => {
  const s = SUGGESTED[o.type], i = s.indexOf(o.stage);
  if (i >= 0) return s[i + 1];
  return STAGE_ORDER[STAGE_ORDER.indexOf(o.stage) + 1];
};
export const prevOf = (o: Order): Stage | undefined => STAGE_ORDER[STAGE_ORDER.indexOf(o.stage) - 1];

export type Check = { label: string; done: boolean; field: keyof Order; action: string };
/** Informational: what has been recorded for this order so far. Never blocks. */
export function checks(o: Order, _b: Batch[]): Check[] {
  return [
    { label: "Quotation approved", done: !!o.approved, field: "approved", action: "Record" },
    { label: "PO received", done: !!o.po, field: "po", action: "Record" },
    { label: "Build sheet", done: !!o.buildSheet, field: "buildSheet", action: "Record" },
    { label: "Jobs off the floor", done: !!o.jobsDone, field: "jobsDone", action: "Record" },
    { label: "QC logged", done: !!o.qcLogged, field: "qcLogged", action: "Record" },
    { label: "Packing recorded", done: !!o.packed, field: "packed", action: "Record" },
    { label: "Invoice raised", done: !!o.invoiced, field: "invoiced", action: "Record" },
    { label: "Tracking added", done: !!o.tracking, field: "tracking", action: "Record" },
    { label: "Paid", done: !!o.paid, field: "paid", action: "Record" },
  ];
}
