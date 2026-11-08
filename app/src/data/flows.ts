/** Order types suggest a path. Forward moves pass each stage gate (see gateReason); backward moves need a reason. */
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
  inhouse: "Usually Production → QC → Packing → Archive · gated stage by stage",
  client: "Pay on delivery · usually Quotation → … → Shipping → Archive · gated stage by stage",
  bulk: "Usually PO first, then batches each with their own QC, packing, invoice and dispatch · gated stage by stage",
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

/** Why an order may not leave its current stage going forward (Emerald 1 canAdvance), or null when it may.
 *  Invoicing is ungated on purpose: the invoice is required, but only to archive. */
export function gateReason(o: Order, batches: Batch[] = []): string | null {
  const mine = batches.filter((b) => b.orderNo === o.no);
  switch (o.stage) {
    case "quotation": return o.approved ? null : o.type === "inhouse" ? "Approve the job card first — approval is where the production details get filled in." : "Approve the quotation first — approval is where the production details get filled in.";
    case "po": return o.po ? null : "Record the customer's PO before production starts.";
    case "production": return o.jobsDone || (mine.length > 0 && mine.every((b) => b.done >= b.units)) ? null : "Jobs are still on the floor — mark every print off before QC.";
    case "qc": return o.qcLogged ? null : "Log at least one QC entry before packing.";
    case "packing": return o.packed || o.skipPacking ? null : "Log the packing materials used before moving to invoicing.";
    case "invoice": return null;
    case "shipping": {
      const handed = o.delivery && o.delivery.method !== "courier";
      if (!o.tracking && !handed) return "Log the courier handover — tracking number and cost — before archiving.";
      if (mine.length && mine.some((b) => b.stage !== "done")) return "Part of this order hasn't gone yet. Dispatch the rest before archiving.";
      if (o.type !== "inhouse" && !o.invoiced) return "Raise the invoice before archiving — the rollup is finalised here.";
      return null;
    }
    case "archived": return "Order is archived.";
  }
}
