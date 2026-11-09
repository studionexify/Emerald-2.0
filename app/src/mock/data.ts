import type { Consumption, Batch, Binned, Job, Log, Member, Money, Order, PackItem, Printer, QcEntry, Spool, Task } from "./types";

export const orders: Order[] = [
  { id: "o1", approved: false, buildSheet: true, no: "EM-1042", type: "client", customer: "Riya Shah", medium: "Instagram", stage: "quotation", created: "2026-11-01", due: "2026-11-08",
    items: [{ name: "Custom name keychain", material: "PLA", colour: "Black", qty: 4, price: 249, cost: 60 }] },
  { id: "o2", approved: true, buildSheet: true, po: "PL/PO/2210", no: "EM-1041", type: "bulk", customer: "Paper Lane Stationery", medium: "WhatsApp", stage: "production", created: "2026-10-28", due: "2026-11-10",
    items: [{ name: "Desk organiser", material: "PETG", colour: "White", qty: 120, price: 349, cost: 110 }, { name: "Pen stand", material: "PLA", colour: "Black", qty: 80, price: 199, cost: 55 }] },
  { id: "o3", buildSheet: true, jobsDone: false, skipPacking: true, no: "EM-1040", type: "inhouse", customer: "Studio Nexify", medium: "Internal", stage: "production", created: "2026-10-30", due: "2026-11-05",
    items: [{ name: "Spool holder jig", material: "PETG", colour: "Grey", qty: 2, price: 0, cost: 90 }], blocked: "Waiting for PETG Grey spool" },
  { id: "o4", approved: true, buildSheet: true, jobsDone: true, qcLogged: true, no: "EM-1039", type: "client", customer: "Aarav Mehta", medium: "Website", stage: "qc", created: "2026-10-27", due: "2026-11-04",
    items: [{ name: "Lithophane lamp", material: "PLA", colour: "White", qty: 1, price: 1899, cost: 420 }] },
  { id: "o5", approved: true, buildSheet: true, po: "GB/PO/118", no: "EM-1038", type: "bulk", customer: "Gift Box Co.", medium: "Email", stage: "production", created: "2026-10-20", due: "2026-11-03",
    items: [{ name: "Corporate logo coaster", material: "PLA", colour: "Black", qty: 250, price: 129, cost: 38 }] },
  { id: "o6", approved: true, buildSheet: true, jobsDone: true, qcLogged: true, packed: true, no: "EM-1037", type: "client", customer: "Neha Patel", medium: "Instagram", stage: "shipping", created: "2026-10-22", due: "2026-11-02", invoiced: true,
    items: [{ name: "Planter set", material: "PLA", colour: "White", qty: 3, price: 699, cost: 150 }] },
  { id: "o7", approved: true, buildSheet: true, jobsDone: true, qcLogged: true, packed: true, tracking: "EV221903IN", paid: true, no: "EM-1036", type: "client", customer: "Kabir Joshi", medium: "Word of mouth", stage: "archived", created: "2026-10-10", due: "2026-10-18", invoiced: true,
    items: [{ name: "Cosplay helmet", material: "PLA", colour: "Grey", qty: 1, price: 6499, cost: 1900 }] },
  { id: "o8", buildSheet: true, jobsDone: true, qcLogged: true, packed: true, no: "EM-1035", type: "inhouse", customer: "Studio Nexify", medium: "Internal", stage: "archived", created: "2026-10-05", due: "2026-10-07",
    items: [{ name: "Tool wall hooks", material: "PETG", colour: "Black", qty: 12, price: 0, cost: 140 }] },
  { id: "o10", approved: true, buildSheet: true, jobsDone: true, qcLogged: true, packed: true, no: "EM-1034", type: "client", customer: "Ishaan Desai", medium: "Referral", stage: "invoice", created: "2026-10-18", due: "2026-11-04",
    items: [{ name: "Architectural model", material: "PLA", colour: "White", qty: 1, price: 8900, cost: 2600 }] },
  { id: "o9", approved: true, buildSheet: true, no: "EM-1043", type: "bulk", customer: "Vadodara Gift House", medium: "Phone", stage: "production", created: "2026-11-02", due: "2026-11-20",
    items: [{ name: "Diwali diya stand", material: "PLA", colour: "Gold", qty: 300, price: 159, cost: 45 }] },
];

export const jobs: Job[] = [
  { id: "j1", orderNo: "EM-1041", item: "Desk organiser · 30/120", printer: "P1S-01", operator: "Chintan", status: "printing", hours: 6.5, grams: 820, spool: "PLA-BK-07" },
  { id: "j2", orderNo: "EM-1041", item: "Pen stand · 0/80", printer: "A1-01", operator: "Meet", status: "queued", hours: 4, grams: 410, spool: "PETG-WH-02" },
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
  { id: "p1", name: "P1S-01", model: "Bambu P1S Combo", status: "printing", hours: 1240, job: "Desk organiser", nozzle: "0.4 mm hardened", volume: "256×256×256", bought: "2025-06-10", cost: 72000, serial: "01P00A3B", location: "Bay 1", lastService: "2026-10-15", serviceEvery: 300, notes: "", active: true },
  { id: "p2", name: "A1-01", model: "Bambu A1 Combo", status: "idle", hours: 860, nozzle: "0.4 mm stainless", volume: "256×256×256", bought: "2025-11-02", cost: 43000, serial: "03A00C77", location: "Bay 2", lastService: "2026-09-20", serviceEvery: 300, notes: "", active: true },
  { id: "p3", name: "A1-02", model: "Bambu A1 Combo", status: "down", hours: 410, nozzle: "0.4 mm stainless", volume: "256×256×256", bought: "2026-04-18", cost: 43000, serial: "03A00D12", location: "Bay 2", lastService: "2026-08-01", serviceEvery: 300, notes: "Clogged nozzle — waiting for spare", active: true },
];

export const spools: Spool[] = [
  { id: "s1", material: "PLA", colour: "Black", hex: "#111111", brand: "Bambu", finish: "Basic", diameter: 1.75, grams: 860, size: 1000, tare: 250, gross: 1110, costKg: 1250, spoolNo: "PLA-BK-07", vendor: "Bambu Store India", bought: "2026-10-12", lot: "B2410-17", location: "Dry box A", opened: "2026-10-20", dried: "2026-10-28", nozzle: "220 °C", bed: "60 °C", status: "loaded", printer: "P1S-01", notes: "", active: true, weighed: "2026-11-02" },
  { id: "s6", material: "PLA", colour: "Black", hex: "#111111", brand: "Bambu", finish: "Basic", diameter: 1.75, grams: 1000, size: 1000, tare: 250, gross: 1250, costKg: 1250, spoolNo: "PLA-BK-08", vendor: "Bambu Store India", bought: "2026-10-12", lot: "B2410-17", location: "Shelf 2", status: "sealed", nozzle: "220 °C", bed: "60 °C", active: true },
  { id: "s2", material: "PLA", colour: "White", hex: "#f4f4f4", brand: "eSun", finish: "PLA+", diameter: 1.75, grams: 640, size: 1000, tare: 180, gross: 820, costKg: 1100, spoolNo: "PLA-WH-04", vendor: "Robu.in", bought: "2026-09-30", lot: "E0924", location: "Dry box A", opened: "2026-10-05", dried: "2026-10-22", nozzle: "215 °C", bed: "60 °C", status: "open", active: true, weighed: "2026-10-31" },
  { id: "s3", material: "PETG", colour: "White", hex: "#eeeeee", brand: "Bambu", finish: "HF", diameter: 1.75, grams: 900, size: 1000, tare: 250, gross: 1150, costKg: 1350, spoolNo: "PETG-WH-02", vendor: "Bambu Store India", bought: "2026-10-12", lot: "P2410-03", location: "Dry box B", opened: "2026-10-25", dried: "2026-11-01", nozzle: "250 °C", bed: "70 °C", status: "loaded", printer: "A1-01", active: true, weighed: "2026-11-03" },
  { id: "s4", material: "PETG", colour: "Grey", hex: "#808080", brand: "Bambu", finish: "HF", diameter: 1.75, grams: 0, size: 1000, tare: 250, gross: 250, costKg: 1350, spoolNo: "PETG-GY-01", vendor: "Bambu Store India", bought: "2026-08-02", lot: "P2408-11", location: "Empty rack", opened: "2026-08-10", nozzle: "250 °C", bed: "70 °C", status: "empty", active: true },
  { id: "s5", material: "PLA", colour: "Gold", hex: "#c9a227", brand: "Polymaker", finish: "Silk", diameter: 1.75, grams: 300, size: 1000, tare: 140, gross: 440, costKg: 1600, spoolNo: "PLA-GD-01", vendor: "Polymaker India", bought: "2026-09-15", lot: "PM-SK-0915", location: "Shelf 1", opened: "2026-09-20", dried: "2026-10-10", nozzle: "225 °C", bed: "60 °C", status: "open", notes: "Silk — slow outer walls", active: true },
];

export const packStock: PackItem[] = [
  { id: "k1", name: "Box 15×15×10", unit: "pcs", qty: 42, reorderAt: 20, cost: 18, vendor: "Sharma Traders", size: "15×15×10 cm", location: "Packing rack", active: true },
  { id: "k2", name: "Bubble wrap", unit: "m", qty: 8, reorderAt: 15, cost: 6, vendor: "Sharma Traders", size: "50 cm roll", location: "Packing rack", active: true },
  { id: "k3", name: "Tape roll", unit: "pcs", qty: 6, reorderAt: 3, cost: 35, vendor: "Local", size: "48 mm × 65 m", location: "Packing table", active: true },
  { id: "k4", name: "Brand sticker", unit: "pcs", qty: 180, reorderAt: 100, cost: 3, vendor: "PrintHub", size: "50 mm round", location: "Packing table", active: true },
];

export const batches: Batch[] = [
  { id: "b1", orderNo: "EM-1041", customer: "Paper Lane Stationery", name: "Organisers A", units: 60, done: 60, stage: "invoice" },
  { id: "b2", orderNo: "EM-1041", customer: "Paper Lane Stationery", name: "Organisers B", units: 60, done: 30, stage: "production" },
  { id: "b3", orderNo: "EM-1041", customer: "Paper Lane Stationery", name: "Pen stands", units: 80, done: 80, stage: "qc" },
  { id: "b4", orderNo: "EM-1038", customer: "Gift Box Co.", name: "Coasters 1–150", units: 150, done: 150, stage: "done", invoiceNo: "B/26-27/0062", tracking: "D84719201" },
  { id: "b5", orderNo: "EM-1038", customer: "Gift Box Co.", name: "Coasters 151–250", units: 100, done: 100, stage: "packing" },
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

export const consumption: Consumption[] = [
  { id: "c1", at: "2026-11-03 10:40", who: "Chintan", orderNo: "EM-1041", batch: "Organisers B", printer: "P1S-01", kind: "filament", item: "PETG White · PETG-WH-02", qty: 820, unit: "g", cost: 1107 },
  { id: "c2", at: "2026-11-03 10:40", who: "Chintan", orderNo: "EM-1041", printer: "P1S-01", kind: "machine", item: "P1S-01", qty: 6.5, unit: "h", cost: 163 },
  { id: "c3", at: "2026-11-03 10:40", who: "Chintan", orderNo: "EM-1041", printer: "P1S-01", kind: "power", item: "Electricity", qty: 6.5, unit: "h", cost: 52 },
  { id: "c4", at: "2026-11-02 18:20", who: "Meet", orderNo: "EM-1038", kind: "scrap", item: "PLA Black · layer shift", qty: 90, unit: "g", cost: 113 },
  { id: "c5", at: "2026-11-02 17:10", who: "Meet", orderNo: "EM-1038", batch: "Coasters 1–150", kind: "packing", item: "Box 15×15×10", qty: 4, unit: "pcs", cost: 72 },
  { id: "c6", at: "2026-11-02 17:10", who: "Meet", orderNo: "EM-1038", batch: "Coasters 1–150", kind: "packing", item: "Bubble wrap", qty: 6, unit: "m", cost: 36 },
  { id: "c7", at: "2026-11-01 15:00", who: "You", orderNo: "EM-1037", kind: "freight", item: "Delhivery Surface", qty: 1, unit: "parcel", cost: 120 },
  { id: "c8", at: "2026-11-01 12:00", who: "Chintan", orderNo: "EM-1039", kind: "accessory", item: "Brass insert M3", qty: 4, unit: "pcs", cost: 8 },
  { id: "c9", at: "2026-10-31 09:00", who: "Meet", orderNo: "EM-1040", printer: "A1-01", kind: "labour", item: "Finishing", qty: 1.5, unit: "h", cost: 150 },
];
