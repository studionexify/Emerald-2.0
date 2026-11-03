export type OrderType = "inhouse" | "client" | "bulk";
export type Stage = "quotation" | "po" | "production" | "qc" | "packing" | "invoice" | "shipping" | "archived";

export type LineItem = { name: string; material: string; colour: string; qty: number; price: number; cost: number };
export type Order = {
  id: string; no: string; type: OrderType; customer: string; medium: string;
  stage: Stage; created: string; due: string; items: LineItem[]; blocked?: string; invoiced?: boolean;
  approved?: boolean; buildSheet?: boolean; jobsDone?: boolean; qcLogged?: boolean; packed?: boolean; tracking?: string;
  po?: string; paid?: boolean; skipPacking?: boolean;
};
export type Job = { id: string; orderNo: string; item: string; printer: string; operator: string; status: "queued" | "printing" | "done" | "failed"; hours: number; grams: number };
export type QcEntry = { id: string; orderNo: string; item: string; result: "pass" | "rework" | "scrap"; grams: number; defect?: string; by: string; date: string };
export type Printer = { id: string; name: string; model: string; status: "printing" | "idle" | "down"; hours: number; job?: string };
export type Spool = { id: string; material: string; colour: string; brand: string; grams: number; size: number; spoolNo: string };
export type PackItem = { id: string; name: string; unit: string; qty: number; reorderAt: number; cost: number };
export type Batch = { id: string; orderNo: string; customer: string; name: string; units: number; done: number; stage: BatchStage; invoiceNo?: string; tracking?: string };
export type BatchStage = "production" | "qc" | "packing" | "invoice" | "shipping" | "done";
export type Task = { id: string; title: string; due: string; done: boolean; who: string; link?: { kind: string; ref: string }; repeat?: string };
export type Log = { id: string; at: string; who: string; action: string; target: string };
export type Binned = { id: string; kind: string; label: string; deletedAt: string; by: string };
export type Money = { id: string; date: string; title: string; account: string; amount: number; kind: string };
export type Member = { id: string; name: string; role: string; email: string };
