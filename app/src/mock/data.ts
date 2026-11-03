import type { Batch, Binned, Job, Log, Member, Money, Order, PackItem, Printer, QcEntry, Spool, Task } from "./types";

export const orders: Order[] = [
  { id: "o1", no: "EM-1042", type: "client", customer: "Riya Shah", medium: "Instagram", stage: "quotation", created: "2026-11-01", due: "2026-11-08",
    items: [{ name: "Custom name keychain", material: "PLA", colour: "Black", qty: 4, price: 249, cost: 60 }] },
  { id: "o2", no: "EM-1041", type: "bulk", customer: "Paper Lane Stationery", medium: "WhatsApp", stage: "production", created: "2026-10-28", due: "2026-11-10",
    items: [{ name: "Desk organiser", material: "PETG", colour: "White", qty: 120, price: 349, cost: 110 }, { name: "Pen stand", material: "PLA", colour: "Black", qty: 80, price: 199, cost: 55 }] },
  { id: "o3", no: "EM-1040", type: "inhouse", customer: "Studio Nexify", medium: "Internal", stage: "production", created: "2026-10-30", due: "2026-11-05",
    items: [{ name: "Spool holder jig", material: "PETG", colour: "Grey", qty: 2, price: 0, cost: 90 }], blocked: "Waiting for PETG Grey spool" },
  { id: "o4", no: "EM-1039", type: "client", customer: "Aarav Mehta", medium: "Website", stage: "qc", created: "2026-10-27", due: "2026-11-04",
    items: [{ name: "Lithophane lamp", material: "PLA", colour: "White", qty: 1, price: 1899, cost: 420 }] },
  { id: "o5", no: "EM-1038", type: "bulk", customer: "Gift Box Co.", medium: "Email", stage: "packing", created: "2026-10-20", due: "2026-11-03",
    items: [{ name: "Corporate logo coaster", material: "PLA", colour: "Black", qty: 250, price: 129, cost: 38 }] },
  { id: "o6", no: "EM-1037", type: "client", customer: "Neha Patel", medium: "Instagram", stage: "shipping", created: "2026-10-22", due: "2026-11-02", invoiced: true,
    items: [{ name: "Planter set", material: "PLA", colour: "White", qty: 3, price: 699, cost: 150 }], blocked: "Tracking number missing" },
  { id: "o7", no: "EM-1036", type: "client", customer: "Kabir Joshi", medium: "Word of mouth", stage: "archived", created: "2026-10-10", due: "2026-10-18", invoiced: true,
    items: [{ name: "Cosplay helmet", material: "PLA", colour: "Grey", qty: 1, price: 6499, cost: 1900 }] },
  { id: "o8", no: "EM-1035", type: "inhouse", customer: "Studio Nexify", medium: "Internal", stage: "archived", created: "2026-10-05", due: "2026-10-07",
    items: [{ name: "Tool wall hooks", material: "PETG", colour: "Black", qty: 12, price: 0, cost: 140 }] },
  { id: "o9", no: "EM-1043", type: "bulk", customer: "Vadodara Gift House", medium: "Phone", stage: "quotation", created: "2026-11-02", due: "2026-11-20",
    items: [{ name: "Diwali diya stand", material: "PLA", colour: "Gold", qty: 300, price: 159, cost: 45 }] },
];

export const jobs: Job[] = [
  { id: "j1", orderNo: "EM-1041", item: "Desk organiser · 30/120", printer: "P1S-01", operator: "Chintan", status: "printing", hours: 6.5, grams: 820 },
  { id: "j2", orderNo: "EM-1041", item: "Pen stand · 0/80", printer: "A1-01", operator: "Meet", status: "queued", hours: 4, grams: 410 },
  { id: "j3", orderNo: "EM-1040", item: "Spool holder jig", printer: "—", operator: "—", status: "queued", hours: 2, grams: 160 },
  { id: "j4", orderNo: "EM-1039", item: "Lithophane lamp", printer: "P1S-01", operator: "Chintan", status: "done", hours: 9, grams: 310 },
  { id: "j5", orderNo: "EM-1038", item: "Coaster · run 5", printer: "A1-01", operator: "Meet", status: "failed", hours: 1.2, grams: 90 },
];

export const qc: QcEntry[] = [
  { id: "q1", orderNo: "EM-1039", item: "Lithophane lamp", result: "pass", grams: 0, by: "Chintan", date: "2026-11-02" },
  { id: "q2", orderNo: "EM-1038", item: "Coaster ×250", result: "rework", grams: 45, defect: "Stringing", by: "Meet", date: "2026-11-01" },
  { id: "q3", orderNo: "EM-1038", item: "Coaster ×6", result: "scrap", grams: 90, defect: "Layer shift", by: "Meet", date: "2026-10-31" },
];

export const printers: Printer[] = [
  { id: "p1", name: "P1S-01", model: "Bambu P1S Combo", status: "printing", hours: 1240, job: "Desk organiser" },
  { id: "p2", name: "A1-01", model: "Bambu A1 Combo", status: "idle", hours: 860 },
  { id: "p3", name: "A1-02", model: "Bambu A1 Combo", status: "down", hours: 410 },
];

export const spools: Spool[] = [
  { id: "s1", material: "PLA", colour: "Black", brand: "Bambu", grams: 2600, size: 1000, spoolNo: "PLA-BK-07" },
  { id: "s2", material: "PLA", colour: "White", brand: "eSun", grams: 1400, size: 1000, spoolNo: "PLA-WH-04" },
  { id: "s3", material: "PETG", colour: "White", brand: "Bambu", grams: 900, size: 1000, spoolNo: "PETG-WH-02" },
  { id: "s4", material: "PETG", colour: "Grey", brand: "Bambu", grams: 0, size: 1000, spoolNo: "PETG-GY-01" },
  { id: "s5", material: "PLA", colour: "Gold", brand: "Polymaker", grams: 300, size: 1000, spoolNo: "PLA-GD-01" },
];

export const packStock: PackItem[] = [
  { id: "k1", name: "Box 15×15×10", unit: "pcs", qty: 42, reorderAt: 20, cost: 18 },
  { id: "k2", name: "Bubble wrap", unit: "m", qty: 8, reorderAt: 15, cost: 6 },
  { id: "k3", name: "Tape roll", unit: "pcs", qty: 6, reorderAt: 3, cost: 35 },
];

export const batches: Batch[] = [
  { id: "b1", orderNo: "EM-1041", customer: "Paper Lane Stationery", name: "Organisers A", units: 60, done: 30, status: "printing" },
  { id: "b2", orderNo: "EM-1041", customer: "Paper Lane Stationery", name: "Organisers B", units: 60, done: 0, status: "planned" },
  { id: "b3", orderNo: "EM-1038", customer: "Gift Box Co.", name: "Coasters 1–250", units: 250, done: 250, status: "packed" },
];

export const tasks: Task[] = [
  { id: "t1", title: "Call Paper Lane about batch B date", due: "2026-11-03", done: false, who: "You", link: { kind: "Order", ref: "EM-1041" } },
  { id: "t2", title: "Order PETG Grey spool", due: "2026-11-03", done: false, who: "Chintan", link: { kind: "Spool", ref: "PETG-GY-01" } },
  { id: "t3", title: "Clean A1-02 nozzle", due: "2026-11-04", done: false, who: "Meet", link: { kind: "Printer", ref: "A1-02" } },
  { id: "t4", title: "Weekly backup of bills", due: "2026-11-07", done: false, who: "You", repeat: "Weekly" },
  { id: "t5", title: "Send quote to Riya", due: "2026-11-02", done: true, who: "You", link: { kind: "Order", ref: "EM-1042" } },
];

export const logs: Log[] = [
  { id: "l1", at: "2026-11-03 10:42", who: "Chintan", action: "Started job", target: "EM-1041 · Desk organiser" },
  { id: "l2", at: "2026-11-03 09:15", who: "You", action: "Created quotation", target: "EM-1042" },
  { id: "l3", at: "2026-11-02 18:20", who: "Meet", action: "Logged QC rework", target: "EM-1038" },
  { id: "l4", at: "2026-11-02 16:05", who: "You", action: "Marked invoice paid", target: "INV-2026-118" },
  { id: "l5", at: "2026-11-02 11:30", who: "You", action: "Deleted expense", target: "Tea & snacks ₹240" },
];

export const bin: Binned[] = [
  { id: "x1", kind: "Expense", label: "Tea & snacks ₹240", deletedAt: "2026-11-02", by: "You" },
  { id: "x2", kind: "Order", label: "EM-1030 · duplicate entry", deletedAt: "2026-10-29", by: "Chintan" },
];

export const money: Money[] = [
  { id: "m1", date: "2026-11-02", title: "Receipt · INV-2026-118 Neha Patel", account: "Current", amount: 2097, kind: "in" },
  { id: "m2", date: "2026-11-01", title: "Filament · Bambu PLA ×5", account: "Current", amount: -6250, kind: "out" },
  { id: "m3", date: "2026-11-01", title: "Courier · Delhivery", account: "Cash", amount: -380, kind: "out" },
  { id: "m4", date: "2026-10-31", title: "Advance · Paper Lane", account: "Current", amount: 25000, kind: "in" },
  { id: "m5", date: "2026-10-30", title: "Razorpay → Current", account: "Razorpay", amount: -8400, kind: "transfer" },
];

export const team: Member[] = [
  { id: "u1", name: "You", role: "Owner", email: "owner@studionexify.com" },
  { id: "u2", name: "Chintan", role: "Co-founder", email: "chintan@studionexify.com" },
  { id: "u3", name: "Meet", role: "Operator", email: "meet@studionexify.com" },
  { id: "u4", name: "CA desk", role: "CA (GST only)", email: "ca@example.com" },
];
