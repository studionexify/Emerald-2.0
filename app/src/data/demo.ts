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
