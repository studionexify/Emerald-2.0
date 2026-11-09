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
