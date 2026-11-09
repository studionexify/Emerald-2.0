/** Artifact-only demo data: fills an empty studio once so the preview has something to show. */
import { ordersSig } from "./index";
import { clientsSig, jobsSig, printersSig, type Client } from "./inventory";
import type { Job, Order, Printer } from "../mock/types";

const d = (n: number) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
const L = (name: string, qty: number, price: number, material = "PLA", colour = "Black") => ({ name, material, colour, qty, price, cost: Math.round(price * 0.3) });

const clients: Client[] = [
  ["Ananya Rao", "Individual", "Bengaluru", "", "Instagram"], ["Paper Trail Stationers", "Business", "Pune", "27AABCP1234F1Z5", "Stationery"],
  ["The Gift Box Co.", "Business", "Mumbai", "27AAGCT5678K1Z2", "Gift shop"], ["Rohan Mehta", "Individual", "Ahmedabad", "", "WhatsApp"],
  ["Studio Kiln Architects", "Business", "Hyderabad", "36AAKFS9012L1Z8", "Architect"], ["Meera Iyer", "Individual", "Chennai", "", "Website"],
  ["BrightMinds School", "Business", "Delhi", "07AABTB3456M1Z1", "Education"], ["Kabir Singh", "Individual", "Jaipur", "", "Referral"],
].map(([name, kind, city, gstin, medium], i) => ({ id: `demo-c${i}`, name, kind, city, gstin, medium, phone: `98${String(45012300 + i * 1117).slice(0, 8)}`, active: true }));

const O = (i: number, customer: string, size: Order["size"], b2b: string | undefined, stage: Order["stage"], due: number, items: Order["items"], extra: Partial<Order> = {}): Order =>
  ({ id: `demo-o${i}`, no: `EM-${2101 + i}`, type: size === "bulk" ? "bulk" : "client", size, b2b, customer, medium: "Instagram", stage, created: d(-6 - i), due: d(due), items, ...extra });

const orders: Order[] = [
  O(0, "Paper Trail Stationers", "b2b", "Stationery", "production", 4, [L("Pen stand", 120, 140, "PLA", "White"), L("Desk organiser", 60, 320, "PETG", "Grey")]),
  O(1, "Ananya Rao", "small", undefined, "production", 2, [L("Name keychain", 4, 120, "PLA", "Pink")]),
  O(2, "The Gift Box Co.", "b2b", "Gift shop", "qc", 1, [L("Lithophane lamp", 25, 850, "PLA", "White"), L("Planter pot", 40, 260, "PLA", "Terracotta"), L("Coaster set", 30, 300)]),
  O(3, "Rohan Mehta", "bulk", undefined, "po", 9, [L("Phone stand", 200, 95, "PLA", "Blue")]),
  O(4, "Studio Kiln Architects", "b2b", "Architect", "production", -1, [L("Site model 1:200", 1, 18500, "PLA", "White")], { blocked: "Waiting on revised CAD" }),
  O(5, "Meera Iyer", "small", undefined, "packing", 0, [L("Custom figurine", 1, 1450, "Resin", "Grey"), L("Display base", 1, 250)]),
  O(6, "BrightMinds School", "b2b", "Education", "quotation", 14, [L("Molecule kit", 50, 420, "PLA", "Mixed"), L("Gear set", 50, 180, "PETG", "Orange")]),
  O(7, "Kabir Singh", "small", undefined, "shipping", 3, [L("Cable clips", 20, 25)], { tracking: "DTDC 7712004" }),
];
const printers: Printer[] = [
  { id: "demo-p0", name: "Bambu X1C · 01", model: "X1 Carbon", status: "printing", hours: 1240, active: true },
  { id: "demo-p1", name: "Bambu P1S · 02", model: "P1S", status: "printing", hours: 860, active: true },
  { id: "demo-p2", name: "Prusa MK4 · 03", model: "MK4", status: "idle", hours: 2105, active: true },
  { id: "demo-p3", name: "Elegoo Saturn · 04", model: "Saturn 4", status: "down", hours: 640, active: true },
];
const jobs: Job[] = [
  { id: "demo-j0", orderNo: "EM-2101", item: "Pen stand", printer: "Bambu X1C · 01", operator: "Arjun", status: "printing", hours: 6.5, grams: 820 },
  { id: "demo-j1", orderNo: "EM-2102", item: "Name keychain", printer: "Bambu P1S · 02", operator: "Priya", status: "printing", hours: 1.2, grams: 40 },
  { id: "demo-j2", orderNo: "EM-2101", item: "Desk organiser", printer: "Prusa MK4 · 03", operator: "Arjun", status: "queued", hours: 9, grams: 1400 },
  { id: "demo-j3", orderNo: "EM-2105", item: "Site model 1:200", printer: "Bambu X1C · 01", operator: "Priya", status: "queued", hours: 22, grams: 1900 },
];

let done = false;
try { done = !!localStorage.getItem("emerald:demo"); localStorage.setItem("emerald:demo", "1"); } catch {}
if (!done && !ordersSig.value.length) {
  ordersSig.value = orders;
  if (!clientsSig.value.length) clientsSig.value = clients;
  if (!printersSig.value.length) printersSig.value = printers;
  if (!jobsSig.value.length) jobsSig.value = jobs;
}

/* Second pass (v2): in-house work, linked tasks, a log history and a few Bin items. Runs once per browser. */
import { binSig, tasksSig } from "./inventory";
import { logsSig } from "./index";
import type { Binned, Log, Task } from "../mock/types";
let done2 = false;
try { done2 = !!localStorage.getItem("emerald:demo2"); localStorage.setItem("emerald:demo2", "1"); } catch {}
if (!done2 && ordersSig.value.some((o) => o.id.startsWith("demo-"))) {
  const inh: Order[] = [
    { id: "demo-o8", no: "EM-2109", type: "inhouse", customer: "Studio Nexify", medium: "Internal", stage: "production", created: d(-3), due: d(5), items: [L("Display shelf samples", 6, 0, "PLA", "Mixed"), L("Calibration cubes", 12, 0)] },
    { id: "demo-o9", no: "EM-2110", type: "inhouse", customer: "Studio Nexify", medium: "Internal", stage: "qc", created: d(-5), due: d(2), items: [L("Printer spare clips", 30, 0, "PETG", "Black")] },
  ];
  if (!ordersSig.value.some((o) => o.id === "demo-o8")) ordersSig.value = [...ordersSig.value, ...inh];
  const T = (i: number, title: string, due: number, p: Partial<Task> = {}): Task => ({ id: `demo-t${i}`, title, due: due === 99 ? "" : d(due), done: false, who: "You", created: d(-2), ...p });
  const tasks: Task[] = [
    T(0, "Call Studio Kiln about revised CAD", 0, { myDay: d(0), important: true, link: { kind: "Order", ref: "EM-2105" }, steps: [{ id: "s1", title: "Email current drawing", done: true }, { id: "s2", title: "Confirm 1:200 scale", done: false }] }),
    T(1, "Send quotation to BrightMinds School", 1, { myDay: d(0), link: { kind: "Quotation", ref: "EM-2107" }, notes: "Include bulk discount for 100+ pieces." }),
    T(2, "QC lithophane lamps — light test", 0, { important: true, link: { kind: "Order", ref: "EM-2103" }, who: "Priya" }),
    T(3, "Book DTDC pickup for Kabir", 2, { link: { kind: "Order", ref: "EM-2108" } }),
    T(4, "Fix Elegoo Saturn vat leak", -1, { link: { kind: "Printer", ref: "Elegoo Saturn · 04" }, who: "Arjun", list: "Studio" }),
    T(5, "Reorder white PLA (5 kg)", 3, { list: "Purchases", repeat: "Monthly" }),
    T(6, "Follow up with Paper Trail on second PO", 99, { link: { kind: "Client", ref: "Paper Trail Stationers" } }),
    T(7, "Clean build plates", -2, { done: true, doneAt: d(-1), repeat: "Weekly", list: "Studio" }),
  ];
  if (!tasksSig.value.length) tasksSig.value = tasks;
  const now = (n: number, hm: string) => `${d(n)} ${hm}`;
  const logs: Log[] = ([
    [0, "10:42", "You", "Moved to QC", "EM-2103", "order"], [0, "10:05", "Priya", "Logged filament", "EM-2101 · 820 g White PLA", "consumption"],
    [0, "09:30", "You", "Added task", "Call Studio Kiln about revised CAD", "order"], [-1, "18:12", "Arjun", "Stock in", "White PLA × 4 kg", "stock"],
    [-1, "16:40", "You", "Recorded payment", "EM-2108 · ₹500", "money"], [-1, "15:02", "Priya", "Completed task", "Clean build plates", "order"],
    [-1, "11:20", "You", "Deleted order", "EM-2099", "order"], [-2, "17:45", "Arjun", "Logged packing", "EM-2106 · box M", "consumption"],
    [-2, "12:10", "You", "Created order", "EM-2107", "order"], [-2, "09:15", "You", "Bought", "Bubble wrap roll", "money"],
    [-3, "14:00", "Arjun", "Stock out", "Grey PETG × 1.4 kg", "stock"], [-3, "10:30", "You", "Restored from Bin", "Lithophane template", "order"],
  ] as const).map(([n, hm, who, action, target, kind], i) => ({ id: `demo-l${i}`, at: now(n, hm), who, action, target, kind }));
  if (!logsSig.value.length) logsSig.value = logs;
  const bin: Binned[] = [
    { id: "demo-b0", kind: "Order", label: "Ravi Kumar · EM-2099", deletedAt: d(-1), by: "You", data: O(20, "Ravi Kumar", "small", undefined, "quotation", 6, [L("Bobblehead", 1, 1200)], { no: "EM-2099" }) },
    { id: "demo-b1", kind: "Task", label: "Post reel of lithophanes", deletedAt: d(-2), by: "You", data: T(20, "Post reel of lithophanes", 1) },
    { id: "demo-b2", kind: "Task", label: "Renew printer warranty", deletedAt: d(-5), by: "Arjun", data: T(21, "Renew printer warranty", 4) },
    { id: "demo-b3", kind: "Job", label: "Phone stand · Prusa MK4 · 03", deletedAt: d(-3), by: "Priya", data: { id: "demo-j9", orderNo: "EM-2104", item: "Phone stand", printer: "Prusa MK4 · 03", operator: "Priya", status: "queued", hours: 14, grams: 2600 } },
    { id: "demo-b4", kind: "Client", label: "Ravi Kumar", deletedAt: d(-6), by: "You", data: { id: "demo-c20", name: "Ravi Kumar", kind: "Individual", city: "Kochi", medium: "Instagram", active: true } },
  ];
  if (!binSig.value.length) binSig.value = bin;
}

/* Third pass (v3): wallets and a month of money entries for the Mauny entry screen. */
import { accountsSig, moneySig, type MoneyEntry } from "./ledger";
let done3 = false;
try { done3 = !!localStorage.getItem("emerald:demo3"); localStorage.setItem("emerald:demo3", "1"); } catch {}
if (!done3 && ordersSig.value.some((o) => o.id.startsWith("demo-")) && !moneySig.value.length) {
  if (!accountsSig.value.length) accountsSig.value = [{ id: "demo-a0", name: "HDFC Current", opening: 185000 }, { id: "demo-a1", name: "Cash", opening: 12000 }, { id: "demo-a2", name: "UPI · GPay", opening: 8000 }];
  const A = accountsSig.value.map((a) => a.id);
  const M = (i: number, n: number, a: number, kind: MoneyEntry["kind"], amount: number, cat: string, note: string, ref?: string): MoneyEntry => ({ id: `demo-m${i}`, date: d(n), account: A[a] ?? A[0], kind, amount, cat, note, ref, source: "mauny_entry" });
  moneySig.value = [
    M(0, 0, 0, "receipt", 9250, "Customer payment", "The Gift Box Co.", "EM-2103"), M(1, 0, 1, "expense", -340, "Food & travel", "Courier office auto"),
    M(2, 0, 2, "expense", -2480, "Filament & resin", "White PLA 2 kg"), M(3, -1, 0, "expense", -1650, "Packaging", "Boxes & bubble wrap"),
    M(4, -1, 2, "receipt", 500, "Customer payment", "Kabir Singh", "EM-2108"), M(5, -2, 0, "expense", -18000, "Rent", "Studio rent · Nov"),
    M(6, -2, 0, "advance", 9250, "Advance", "Studio Kiln Architects", "EM-2105"), M(7, -3, 0, "expense", -3420, "Electricity", "BESCOM bill"),
    M(8, -3, 2, "expense", -899, "Software", "Slicer cloud plan"), M(9, -4, 0, "expense", -24000, "Salaries", "Arjun · Oct"),
    M(10, -5, 1, "expense", -720, "Shipping", "DTDC · 3 parcels"), M(11, -5, 0, "receipt", 14400, "Customer payment", "Paper Trail Stationers", "EM-2101"),
    M(12, -6, 0, "expense", -2500, "Marketing", "Instagram boost"), M(13, -7, 0, "expense", -4350, "Parts & tools", "Hotend + nozzles"),
  ];
}

/* Fourth pass (v4): invoices, quotes, bills, expenses, goals, statement lines, assets, loans, GST status — so every Mauny tab has content. */
import { assetsSig, billsSig, expensesSig, goalsSig, gstSig, invoicesSig, loansSig, nextNo, openingSig, quotesSig, statementSig, type Bill, type Expense, type Goal, type Invoice, type Quote, type StatementLine } from "./ledger";
let done4 = false;
try { done4 = !!localStorage.getItem("emerald:demo4"); localStorage.setItem("emerald:demo4", "1"); } catch {}
if (!done4 && ordersSig.value.some((o) => o.id.startsWith("demo-")) && !invoicesSig.value.length) {
  const acc = accountsSig.value.map((a) => a.id);
  const pre = nextNo("invoice", d(0)).replace(/\d+$/, "");
  const I = (i: number, n: number, customer: string, gstin: string | undefined, orderNo: string, lines: Invoice["lines"], paid?: number): Invoice =>
    ({ id: `demo-i${i}`, kind: "invoice", no: `${pre}${String(i + 1).padStart(3, "0")}`, date: d(n), customer, gstin, orderNo, lines, gstRate: 18, interstate: !!gstin && gstin.slice(0, 2) !== "29", status: "issued", ...(paid !== undefined ? { paidOn: d(paid), paidAccount: acc[0] } : {}) });
  invoicesSig.value = [
    I(0, -20, "Paper Trail Stationers", "27AABCP1234F1Z5", "EM-2090", [{ desc: "Pen stand", hsn: "3926", qty: 80, rate: 140 }], -12),
    I(1, -14, "Meera Iyer", undefined, "EM-2093", [{ desc: "Custom figurine", hsn: "3926", qty: 1, rate: 1450 }], -14),
    I(2, -9, "The Gift Box Co.", "27AAGCT5678K1Z2", "EM-2103", [{ desc: "Lithophane lamp", hsn: "9405", qty: 10, rate: 850 }]),
    I(3, -6, "Studio Kiln Architects", "36AAKFS9012L1Z8", "EM-2105", [{ desc: "Site model 1:200 — 50% milestone", hsn: "4906", qty: 1, rate: 9250 }]),
    I(4, -3, "Kabir Singh", undefined, "EM-2108", [{ desc: "Cable clips", hsn: "3926", qty: 20, rate: 25 }], -1),
    I(5, -1, "Rohan Mehta", undefined, "EM-2104", [{ desc: "Phone stand — advance batch", hsn: "3926", qty: 50, rate: 95 }]),
  ];
  const Q = (i: number, n: number, customer: string, lines: Quote["lines"], outcome: Quote["outcome"], orderNo?: string): Quote => ({ id: `demo-q${i}`, no: `Q-${pre.replace(/-$/, "")}-${d(n).slice(5, 7)}-${String(i + 1).padStart(3, "0")}`, date: d(n), customer, orderNo, lines, gstRate: 18, valid: d(n + 15), outcome });
  quotesSig.value = [
    Q(0, -2, "BrightMinds School", [{ desc: "Molecule kit", hsn: "9023", qty: 50, rate: 420 }, { desc: "Gear set", hsn: "9023", qty: 50, rate: 180 }], "open", "EM-2107"),
    Q(1, -8, "Rohan Mehta", [{ desc: "Phone stand", hsn: "3926", qty: 200, rate: 95 }], "approved", "EM-2104"),
    Q(2, -11, "Nest Interiors", [{ desc: "Pendant lamp shades", hsn: "9405", qty: 12, rate: 1600 }], "lost"),
    Q(3, -4, "Ravi Kumar", [{ desc: "Bobblehead", hsn: "3926", qty: 1, rate: 1200 }], "open"),
  ];
  const B = (i: number, n: number, vendor: string, gstin: string, no: string, sub: number, cat: string, status: Bill["status"], lines?: Bill["lines"]): Bill =>
    ({ id: `demo-bl${i}`, vendor, gstin, no, date: d(n), subtotal: sub, tax: Math.round(sub * 0.18), total: Math.round(sub * 1.18), cat, status, note: status === "needs_review" ? "Check the GST split before logging" : "", lines, fy: "FY 2026-27" });
  billsSig.value = [
    B(0, -1, "Polymaker India", "29AAFCP2211K1Z9", "PMI/2611/88", 4200, "Filament", "needs_review", [{ desc: "PLA White 1 kg", amount: 2478, qty: 2, unit: "kg" }, { desc: "PETG Grey 1 kg", amount: 2478, qty: 2, unit: "kg" }]),
    B(1, -3, "BoxKart Packaging", "27AAGCB9012P1Z3", "BK-5541", 1400, "Packing", "logged"),
    B(2, -5, "Robu.in", "27AAICR4455Q1Z1", "RB-77120", 3686, "Parts", "logged"),
    B(3, -2, "Adobe India", "", "ADB-112233", 762, "Software", "needs_review"),
    B(4, -7, "BESCOM", "", "EB-NOV-26", 2898, "Electricity", "logged"),
  ];
  const E = (i: number, n: number, head: string, vendor: string, amount: number, tax: number, paid: boolean, extra: Partial<Expense> = {}): Expense => ({ id: `demo-e${i}`, date: d(n), head, vendor, amount, tax, paid, account: paid ? acc[0] : undefined, ...extra });
  expensesSig.value = [
    E(0, -2, "Rent", "Studio landlord", 18000, 0, true), E(1, -3, "Electricity", "BESCOM", 3420, 0, true),
    E(2, -4, "Salaries", "Arjun", 24000, 0, true), E(3, -5, "Packing", "BoxKart Packaging", 1652, 252, true, { billId: "demo-bl1" }),
    E(4, -5, "Parts", "Robu.in", 4350, 664, true, { billId: "demo-bl2" }), E(5, -6, "Marketing", "Meta ads", 2500, 0, true),
    E(6, 0, "Filament", "Polymaker India", 4956, 756, false, { msme: "Small", dueDate: d(30) }), E(7, -1, "Freight", "DTDC", 720, 0, true),
  ];
  const G = (i: number, title: string, metric: Goal["metric"], target: number, note: string): Goal => ({ id: `demo-g${i}`, title, metric, start: d(-8), end: d(22), period: "month", target, note, archived: false });
  goalsSig.value = [G(0, "₹2 lakh revenue this month", "revenue", 200000, "Push B2B gift shops"), G(1, "Collect every overdue invoice", "collection", 30000, "Gift Box + Studio Kiln"), G(2, "Keep spend under ₹70k", "expense_cap", 70000, ""), G(3, "40 orders", "orders", 40, "Instagram + repeat clients"), G(4, "Hold 45% margin", "margin_pct", 45, "")];
  const S = (i: number, n: number, text: string, amount: number, state: StatementLine["state"], match?: string): StatementLine => ({ id: `demo-st${i}`, account: acc[0], date: d(n), text, amount, state, match, hash: `demo-${i}` });
  statementSig.value = [
    S(0, 0, "NEFT CR THE GIFT BOX CO", 9250, "review"), S(1, -1, "UPI DR POLYMAKER INDIA", -4956, "review"), S(2, -2, "IMPS CR STUDIO KILN ARCH", 9250, "confirmed", "Receipt"),
    S(3, -2, "ACH DR META PLATFORMS", -2500, "confirmed", "Marketing"), S(4, -3, "NEFT DR LANDLORD RENT NOV", -18000, "confirmed", "Rent"), S(5, -4, "UPI CR RVK8812@okaxis", 1200, "review"), S(6, -5, "POS DR AMAZON PAY", -649, "rejected"),
  ];
  assetsSig.value = [{ id: "demo-as0", name: "Bambu X1 Carbon", machine: "Bambu X1C · 01", block: "Plant & machinery", blockRate: 15, cost: 145000, date: "2026-04-18" }, { id: "demo-as1", name: "Prusa MK4", machine: "Prusa MK4 · 03", block: "Plant & machinery", blockRate: 15, cost: 92000, date: "2025-09-02" }, { id: "demo-as2", name: "Workstation PC", machine: "—", block: "Computers", blockRate: 40, cost: 68000, date: "2025-06-10" }];
  loansSig.value = [{ id: "demo-ln0", lender: "HDFC Business Loan", principal: 300000, rate: 11.5, date: "2025-11-01", repaid: 85000 }];
  openingSig.value = { capital: 250000, stock: 38000, closingStock: 42000 };
  const ym2 = (n: number) => { const x = new Date(); x.setMonth(x.getMonth() + n); return x.toISOString().slice(0, 7); };
  gstSig.value = { [ym2(-2)]: { r1: true, r3b: true, locked: true }, [ym2(-1)]: { r1: true, r3b: false, locked: false } };
}
