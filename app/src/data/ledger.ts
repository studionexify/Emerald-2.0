/** Money, documents and books: records + the pure rules computed over them (Blueprint v2 §Finance, Books, GST, Mauny, Goals, Attention). */
import { computed } from "@preact/signals";
import { persisted, uid, today, nowStamp } from "./store";
import { rate } from "./rates";
import * as M from "../mock/data";
import * as X from "../mock/extra";
import type { Order, Stage } from "../mock/types";

/* ---------------------------------------------------------------- types */
export type InvLine = { desc: string; hsn: string; qty: number; rate: number };
export type Invoice = {
  id: string; kind: "invoice" | "credit"; no: string; date: string; customer: string; gstin?: string; address?: string;
  orderNo?: string; batch?: string; lines: InvLine[]; gstRate: number; interstate: boolean;
  status: "issued" | "cancelled"; paidOn?: string; paidAccount?: string; against?: string; note?: string;
};
export type Quote = { id: string; no: string; date: string; customer: string; orderNo?: string; lines: InvLine[]; gstRate: number; valid: string; outcome: "open" | "approved" | "lost" | "unrecorded" };
export type Expense = { id: string; date: string; head: string; vendor: string; amount: number; tax: number; billId?: string; paid: boolean; account?: string; msme?: "Micro" | "Small" | ""; dueDate?: string };
export type Bill = { id: string; vendor: string; gstin?: string; no: string; date: string; subtotal: number; tax: number; total: number; cat: string; status: "needs_review" | "logged" | "failed" | "rejected"; note: string; file?: string; fy?: string; lines?: { desc: string; amount: number }[] };
export type Account = { id: string; name: string; opening: number };
export type MoneyKind = "receipt" | "expense" | "transfer_out" | "transfer_in" | "capital_in" | "drawings" | "loan_taken" | "loan_repayment" | "asset_purchase" | "other_income" | "advance";
export type MoneyEntry = { id: string; date: string; account: string; kind: MoneyKind; amount: number; note: string; ref?: string; pair?: string; source?: string };
export type Goal = { id: string; title: string; metric: GoalMetric; start: string; end: string; period: string; target: number; manual?: number; note: string; archived: boolean };
export type GoalMetric = "revenue" | "collection" | "profit" | "expense_cap" | "orders" | "margin_pct" | "custom";
export type Shipment = { id: string; orderNo: string; batch?: string; date: string; courier: string; service: string; tracking: string; lines: { name: string; qty: number }[]; freightPaid: number; freightRecovered: number; eta: string; photo?: string };
export type StageMove = { id: string; orderNo: string; from: Stage; to: Stage; by: string; at: string; reason: string };
export type Asset = { id: string; name: string; machine: string; block: string; blockRate: number; cost: number; date: string };
export type Loan = { id: string; lender: string; principal: number; rate: number; date: string; repaid: number };
export type LineDesign = { file: string; profile: string; grams: number; minutes: number; bom: string; measuredBy: string; source: "slicer" | "nexcal" };
export type StatementLine = { id: string; account: string; date: string; text: string; amount: number; state: "review" | "confirmed" | "rejected"; match?: string; hash: string };
export type GstMonth = { r1: boolean; r3b: boolean; locked: boolean };

/* ---------------------------------------------------------------- seeds */
const L = (desc: string, qty: number, r: number, hsn = "491199"): InvLine => ({ desc, hsn, qty, rate: r });
const seedInvoices: Invoice[] = [
  { id: "i4", kind: "invoice", no: "B-058", date: "2026-08-14", customer: "Paper Lane Stationery", gstin: "24AAKFP1234M1Z2", orderNo: "EM-1022", lines: [L("Desk organiser", 100, 500)], gstRate: 18, interstate: false, status: "issued" },
  { id: "i3", kind: "invoice", no: "B-059", date: "2026-09-22", customer: "Gift Box Co.", gstin: "24AAGCG5678K1Z9", orderNo: "EM-1029", lines: [L("Logo coaster", 250, 109.32)], gstRate: 18, interstate: true, status: "issued" },
  { id: "i2", kind: "invoice", no: "B-060", date: "2026-10-18", customer: "Kabir Joshi", orderNo: "EM-1036", lines: [L("Cosplay helmet", 1, 5508)], gstRate: 18, interstate: false, status: "issued", paidOn: "2026-10-20", paidAccount: "ba1" },
  { id: "i1", kind: "invoice", no: "B-061", date: "2026-11-01", customer: "Neha Patel", orderNo: "EM-1037", lines: [L("Planter set", 3, 592.33)], gstRate: 18, interstate: false, status: "issued", paidOn: "2026-11-01", paidAccount: "ba1" },
];
const seedQuotes: Quote[] = X.quotes.map((q) => ({ id: q.id, no: q.no, date: q.date, customer: q.customer, lines: [L("As quoted", 1, Math.round(q.value / 1.18))], gstRate: 18, valid: q.valid, outcome: q.outcome as Quote["outcome"] }));
const seedExpenses: Expense[] = [
  { id: "e1", date: "2026-10-30", head: "Filament", vendor: "Bambu Store India", amount: 11250, tax: 1716, billId: "bl2", paid: true, account: "ba1" },
  { id: "e2", date: "2026-10-31", head: "Electricity", vendor: "MGVCL", amount: 2860, tax: 0, paid: true, account: "ba1" },
  { id: "e3", date: "2026-10-28", head: "Utilities", vendor: "Jio Fiber", amount: 1179, tax: 180, billId: "bl3", paid: true, account: "ba1" },
  { id: "e4", date: "2026-10-25", head: "Courier", vendor: "Delhivery", amount: 1840, tax: 0, paid: true, account: "ba2" },
  { id: "e5", date: "2026-10-20", head: "Packing", vendor: "Sharma Traders", amount: 2100, tax: 320, paid: false, msme: "Micro", dueDate: "2026-12-04" },
  { id: "e6", date: "2026-09-15", head: "Filament", vendor: "Polymaker Distributor", amount: 8200, tax: 1250, paid: false, dueDate: "2026-11-30" },
];
const seedBills: Bill[] = X.bills.map((b) => ({ id: b.id, vendor: b.vendor, no: b.no, date: b.date, subtotal: b.total - b.tax, tax: b.tax, total: b.total, cat: b.cat, status: b.status as Bill["status"], note: b.note, fy: "FY 2026-27",
  lines: b.id === "bl1" ? [{ desc: "Box 15×15×10 ×100", amount: 1800 }, { desc: "Bubble wrap 50 m", amount: 1624 }, { desc: "Tape ×20", amount: 756 }] : undefined }));
const seedAccounts: Account[] = [{ id: "ba1", name: "HDFC Current ··4421", opening: 150000 }, { id: "ba2", name: "Cash in hand", opening: 12000 }, { id: "ba3", name: "Razorpay settlements", opening: 4000 }];
const seedMoney: MoneyEntry[] = [
  { id: "m1", date: "2026-04-01", account: "ba1", kind: "capital_in", amount: 50000, note: "Capital introduced" },
  { id: "m2", date: "2026-07-10", account: "ba1", kind: "drawings", amount: -40000, note: "Drawings" },
  { id: "m3", date: "2026-10-20", account: "ba1", kind: "receipt", amount: 6499, note: "Kabir Joshi", ref: "B-060" },
  { id: "m4", date: "2026-10-30", account: "ba1", kind: "expense", amount: -11250, note: "Bambu Store India", ref: "e1" },
  { id: "m5", date: "2026-10-31", account: "ba1", kind: "expense", amount: -2860, note: "MGVCL", ref: "e2" },
  { id: "m6", date: "2026-10-28", account: "ba1", kind: "expense", amount: -1179, note: "Jio Fiber", ref: "e3" },
  { id: "m7", date: "2026-10-25", account: "ba2", kind: "expense", amount: -1840, note: "Delhivery", ref: "e4" },
  { id: "m8", date: "2026-10-31", account: "ba1", kind: "advance", amount: 25000, note: "Advance · Paper Lane", ref: "EM-1041" },
  { id: "m9", date: "2026-11-01", account: "ba1", kind: "receipt", amount: 2097, note: "Neha Patel", ref: "B-061" },
  { id: "m10", date: "2026-10-29", account: "ba1", kind: "transfer_out", amount: -5000, note: "To cash", pair: "t1" },
  { id: "m11", date: "2026-10-29", account: "ba2", kind: "transfer_in", amount: 5000, note: "From HDFC", pair: "t1" },
  { id: "m12", date: "2026-05-02", account: "ba1", kind: "asset_purchase", amount: -84999, note: "Bambu P1S Combo", ref: "fa1" },
];
const seedGoals: Goal[] = [
  { id: "g1", title: "₹5L this quarter", metric: "revenue", start: "2026-10-01", end: "2026-12-31", period: "Q3 · Oct–Dec", target: 500000, note: "Diwali corporate push", archived: false },
  { id: "g2", title: "Cash in by month end", metric: "collection", start: "2026-11-01", end: "2026-11-30", period: "November", target: 120000, note: "", archived: false },
  { id: "g3", title: "Keep spend under ₹60k", metric: "expense_cap", start: "2026-11-01", end: "2026-11-30", period: "November", target: 60000, note: "A ceiling — met by staying under", archived: false },
  { id: "g4", title: "40 orders this year", metric: "orders", start: "2026-04-01", end: "2027-03-31", period: "FY 2026-27", target: 40, note: "", archived: false },
  { id: "g5", title: "Margin above 55%", metric: "margin_pct", start: "2026-04-01", end: "2027-03-31", period: "FY 2026-27", target: 55, note: "", archived: false },
  { id: "g6", title: "Instagram reels", metric: "custom", start: "2026-11-01", end: "2026-11-30", period: "November", target: 12, manual: 4, note: "Moved by hand", archived: false },
];
const seedShipments: Shipment[] = [
  { id: "sh2", orderNo: "EM-1033", date: "2026-10-29", courier: "DTDC", service: "Express", tracking: "D84719201", lines: [{ name: "Notebook stand", qty: 60 }], freightPaid: 640, freightRecovered: 600, eta: "2026-11-01" },
  { id: "sh3", orderNo: "EM-1036", date: "2026-10-18", courier: "India Post", service: "Speed Post", tracking: "EV221903IN", lines: [{ name: "Cosplay helmet", qty: 1 }], freightPaid: 90, freightRecovered: 0, eta: "2026-10-21" },
];
const seedAssets: Asset[] = [
  { id: "fa1", name: "Bambu P1S Combo", machine: "P1S-01", block: "Plant & machinery", blockRate: 15, cost: 84999, date: "2026-05-02" },
  { id: "fa2", name: "Bambu A1 Combo", machine: "A1-01", block: "Plant & machinery", blockRate: 15, cost: 49999, date: "2025-11-12" },
  { id: "fa3", name: "Laptop", machine: "—", block: "Computers", blockRate: 40, cost: 72000, date: "2025-06-01" },
];
const seedStatement: StatementLine[] = [
  { id: "sl1", account: "ba1", date: "2026-11-02", text: "NEFT GIFT BOX CO PART PMT", amount: 31605, state: "review", hash: "a1" },
  { id: "sl2", account: "ba1", date: "2026-11-02", text: "UPI/RIYA SHAH/KEYCHAIN", amount: 500, state: "review", hash: "a2" },
];

/* ---------------------------------------------------------------- stores */
export const invoicesSig = persisted<Invoice[]>("invoices", seedInvoices);
export const quotesSig = persisted<Quote[]>("quotes", seedQuotes);
export const expensesSig = persisted<Expense[]>("expenses", seedExpenses);
export const billsSig = persisted<Bill[]>("bills", seedBills);
export const accountsSig = persisted<Account[]>("accounts", seedAccounts);
export const moneySig = persisted<MoneyEntry[]>("money", seedMoney);
export const goalsSig = persisted<Goal[]>("goals", seedGoals);
export const shipmentsSig = persisted<Shipment[]>("shipments", seedShipments);
export const historySig = persisted<StageMove[]>("stageHistory", []);
export const assetsSig = persisted<Asset[]>("assets", seedAssets);
export const loansSig = persisted<Loan[]>("loans", []);
export const designSig = persisted<Record<string, LineDesign>>("lineDesign", {});
export const statementSig = persisted<StatementLine[]>("statement", seedStatement);
export const gstSig = persisted<Record<string, GstMonth>>("gstFiled", { "2026-04": { r1: true, r3b: true, locked: true }, "2026-05": { r1: true, r3b: true, locked: true }, "2026-06": { r1: true, r3b: true, locked: true }, "2026-07": { r1: true, r3b: true, locked: true }, "2026-08": { r1: true, r3b: true, locked: true }, "2026-09": { r1: true, r3b: true, locked: false } });
export const photosSig = persisted<{ id: string; ref: string; stage: string; name: string; data: string; at: string }[]>("photos", []);
export const openingSig = persisted<{ capital: number; stock: number; closingStock: number }>("opening", { capital: 300000, stock: 22000, closingStock: 64848 });

/* ---------------------------------------------------------------- helpers */
export const r2 = (n: number) => Math.round(n * 100) / 100;
export const fyOf = (d: string) => { const [y, m] = d.split("-").map(Number); const s = m >= 4 ? y : y - 1; return `${s}-${String((s + 1) % 100).padStart(2, "0")}`; };
export const fyWindow = (fy: string): [string, string] => { const s = Number(fy.slice(0, 4)); return [`${s}-04-01`, `${s + 1}-03-31`]; };
export const inWin = (d: string, [a, b]: [string, string]) => d >= a && d <= b;
export const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 864e5);
export function invTax(i: Invoice) {
  const taxable = r2(i.lines.reduce((s, l) => s + l.qty * l.rate, 0));
  const gst = r2((taxable * i.gstRate) / 100);
  const sign = i.kind === "credit" ? -1 : 1;
  const live = i.status === "issued" ? 1 : 0;
  return { taxable: sign * live * taxable, cgst: sign * live * (i.interstate ? 0 : r2(gst / 2)), sgst: sign * live * (i.interstate ? 0 : r2(gst / 2)), igst: sign * live * (i.interstate ? gst : 0), total: sign * live * r2(taxable + gst) };
}

/** Financial-year letter: Apr 2025–Mar 2026 = A, Apr 2026–Mar 2027 = B (the studio's existing series). */
export function fyLetter(d: string) {
  const i = Number(fyOf(d).slice(0, 4)) - 2025;
  if (i < 0 || i > 25) throw new Error(`No series letter for the financial year of ${d}`);
  return String.fromCharCode(65 + i);
}
export const seriesPrefix = (kind: "invoice" | "credit", date = today()) => (kind === "credit" ? `CN-${fyLetter(date)}-` : `${fyLetter(date)}-`);
const seqOf = (no: string, prefix: string) => (no.startsWith(prefix) && /^\d+$/.test(no.slice(prefix.length)) ? Number(no.slice(prefix.length)) : 0);
/** Invoices: A-001… per FY, gapless, cancelled numbers kept. Quotes: Q-B-08-001…, restarting each month. */
export function nextNo(kind: "invoice" | "credit" | "quote", date = today()) {
  if (kind === "quote") {
    const prefix = `Q-${fyLetter(date)}-${date.slice(5, 7)}-`;
    return prefix + String(Math.max(0, ...quotesSig.value.map((q) => seqOf(q.no, prefix))) + 1).padStart(3, "0");
  }
  const prefix = seriesPrefix(kind, date);
  return prefix + String(Math.max(0, ...invoicesSig.value.map((i) => seqOf(i.no, prefix))) + 1).padStart(3, "0");
}
/** A new invoice may not be dated before the latest one in its series (B-017 cannot predate B-016). */
export function seriesLatest(kind: "invoice" | "credit", date = today()) {
  const prefix = seriesPrefix(kind, date);
  return invoicesSig.value.filter((i) => seqOf(i.no, prefix)).reduce((m, i) => (i.date > m ? i.date : m), "");
}

let logFn: (a: string, t: string, k?: "order" | "stock" | "consumption" | "money") => void = () => {};
export const setLogger = (f: typeof logFn) => (logFn = f);

/* ---------------------------------------------------------------- invoice actions */
export function raiseInvoice(d: { customer: string; gstin?: string; orderNo?: string; batch?: string; lines: InvLine[]; interstate?: boolean; date?: string }) {
  const date = d.date ?? today();
  const latest = seriesLatest("invoice", date);
  if (latest && date < latest) throw new Error(`An invoice in this series is already dated ${latest} — a new one cannot be dated earlier.`);
  const inv: Invoice = { id: uid(), kind: "invoice", no: nextNo("invoice", date), date, customer: d.customer, gstin: d.gstin, orderNo: d.orderNo, batch: d.batch, lines: d.lines, gstRate: rate("gst"), interstate: d.interstate ?? (!!d.gstin && /^\d{2}/.test(d.gstin) && d.gstin.slice(0, 2) !== "24"), status: "issued" };
  invoicesSig.value = [...invoicesSig.value, inv]; logFn("Raised invoice", `${inv.no} · ${inv.customer}`, "money"); return inv;
}
export function updateInvoice(i: Invoice, p: Partial<Invoice>, what = "Edited invoice") { invoicesSig.value = invoicesSig.value.map((x) => (x.id === i.id ? { ...x, ...p } : x)); logFn(what, i.no, "money"); }
export const cancelInvoice = (i: Invoice) => updateInvoice(i, { status: "cancelled" }, "Cancelled invoice (number kept)");
export function creditNote(i: Invoice, amount: number, note: string) {
  const cn: Invoice = { id: uid(), kind: "credit", no: nextNo("credit"), date: today(), customer: i.customer, gstin: i.gstin, orderNo: i.orderNo, lines: [{ desc: `Credit against ${i.no}: ${note}`, hsn: i.lines[0]?.hsn ?? "", qty: 1, rate: amount }], gstRate: i.gstRate, interstate: i.interstate, status: "issued", against: i.no, note };
  invoicesSig.value = [...invoicesSig.value, cn]; logFn("Credit note", `${cn.no} against ${i.no}`, "money"); return cn;
}
/** Mark paid also books a Mauny receipt; mark unpaid removes it. */
export function markPaid(i: Invoice, account: string, on = today()) {
  updateInvoice(i, { paidOn: on, paidAccount: account }, "Marked invoice paid");
  moneySig.value = [...moneySig.value, { id: uid(), date: on, account, kind: "receipt", amount: invTax(i).total, note: i.customer, ref: i.no, source: "invoice_desk" }];
}
export function markUnpaid(i: Invoice) {
  updateInvoice(i, { paidOn: undefined, paidAccount: undefined }, "Marked invoice unpaid");
  moneySig.value = moneySig.value.filter((m) => !(m.ref === i.no && m.source === "invoice_desk"));
}
/** Renumber unpaid, uncancelled invoices of a series in date order (used to close an accidental gap). */
export function resequence(fy: string) {
  const prefix = seriesPrefix("invoice", `${fy.slice(0, 4)}-04-01`);
  const list = invoicesSig.value.filter((i) => seqOf(i.no, prefix)).sort((a, b) => a.date.localeCompare(b.date) || a.no.localeCompare(b.no));
  const map = new Map(list.map((i, k) => [i.id, prefix + String(k + 1).padStart(3, "0")]));
  invoicesSig.value = invoicesSig.value.map((i) => (map.has(i.id) ? { ...i, no: map.get(i.id)! } : i));
  logFn("Resequenced invoice series", prefix, "money");
}

/* ---------------------------------------------------------------- purchases / expenses */
export function billChecks(b: Bill): { block: string[]; warn: string[] } {
  const block: string[] = [], warn: string[] = [];
  if (!b.total) block.push("No amount"); if (!b.date) block.push("No date");
  const lines = (b.lines ?? []).reduce((s, l) => s + l.amount, 0);
  if (b.lines?.length && Math.abs(lines - b.total) > 1) warn.push(`Lines sum to ₹${lines.toLocaleString("en-IN")} — ₹${Math.abs(b.total - lines).toLocaleString("en-IN")} ${lines < b.total ? "short" : "over"}`);
  if (Math.abs(b.subtotal + b.tax - b.total) > 1) warn.push("Subtotal + tax ≠ total");
  if (b.tax > b.total) warn.push("Tax larger than total");
  return { block, warn };
}
export function confirmBill(b: Bill, paidFrom: string | "") {
  billsSig.value = billsSig.value.map((x) => (x.id === b.id ? { ...b, status: "logged" } : x));
  const e: Expense = { id: uid(), date: b.date, head: b.cat, vendor: b.vendor, amount: b.total, tax: b.tax, billId: b.id, paid: !!paidFrom, account: paidFrom || undefined };
  expensesSig.value = [...expensesSig.value, e];
  if (paidFrom) moneySig.value = [...moneySig.value, { id: uid(), date: b.date, account: paidFrom, kind: "expense", amount: -b.total, note: b.vendor, ref: e.id, source: "purchases" }];
  logFn("Logged bill as expense", `${b.vendor} ${b.no}`, "money");
}
export function addBill(file: { name: string; data?: string }) {
  const b: Bill = { id: uid(), vendor: "", no: "", date: today(), subtotal: 0, tax: 0, total: 0, cat: "Other", status: "needs_review", note: "Not read — type the figures (AI reader connects with the backend)", file: file.data, fy: `FY ${fyOf(today())}` };
  billsSig.value = [b, ...billsSig.value]; logFn("Uploaded bill", file.name, "money"); return b;
}
export function addExpense(e: Omit<Expense, "id">) {
  const x = { ...e, id: uid() }; expensesSig.value = [...expensesSig.value, x];
  if (e.paid && e.account) moneySig.value = [...moneySig.value, { id: uid(), date: e.date, account: e.account, kind: "expense", amount: -e.amount, note: e.vendor, ref: x.id }];
  logFn("Added expense", `${e.head} · ${e.vendor}`, "money"); return x;
}

/* ---------------------------------------------------------------- Mauny */
export function addMoney(e: Omit<MoneyEntry, "id">) {
  const x = { ...e, id: uid() }; moneySig.value = [...moneySig.value, x];
  if (e.kind === "asset_purchase") assetsSig.value = [...assetsSig.value, { id: uid(), name: e.note, machine: "—", block: "Plant & machinery", blockRate: 15, cost: -e.amount, date: e.date }];
  if (e.kind === "loan_taken") loansSig.value = [...loansSig.value, { id: uid(), lender: e.note, principal: e.amount, rate: 12, date: e.date, repaid: 0 }];
  logFn(`Mauny · ${e.kind.replace("_", " ")}`, `${e.note} ${e.amount}`, "money"); return x;
}
export function transfer(from: string, to: string, amount: number, date = today()) {
  const pair = uid();
  moneySig.value = [...moneySig.value, { id: uid(), date, account: from, kind: "transfer_out", amount: -amount, note: "Transfer", pair }, { id: uid(), date, account: to, kind: "transfer_in", amount, note: "Transfer", pair }];
  logFn("Transfer", `${amount}`, "money");
}
export const balanceOf = (acc: string, upto = "9999") => (accountsSig.value.find((a) => a.id === acc)?.opening ?? 0) + moneySig.value.filter((m) => m.account === acc && m.date <= upto).reduce((s, m) => s + m.amount, 0);
export function daySummary(acc: string, d: string) {
  const prev = new Date(Date.parse(d) - 864e5).toISOString().slice(0, 10);
  const rows = moneySig.value.filter((m) => m.account === acc && m.date === d);
  return { opening: balanceOf(acc, prev), in: rows.filter((r) => r.amount > 0).reduce((s, r) => s + r.amount, 0), out: rows.filter((r) => r.amount < 0).reduce((s, r) => s + r.amount, 0), closing: balanceOf(acc, d), rows };
}

/* ---------------------------------------------------------------- statements */
const hashStr = (s: string) => { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) | 0; return String(h); };
export function parseStatementCsv(text: string, account: string) {
  const out: StatementLine[] = []; const seen = new Set(statementSig.value.map((l) => l.hash));
  let dup = 0;
  for (const raw of text.split(/\r?\n/).slice(1)) {
    const c = raw.split(",").map((x) => x.replace(/^"|"$/g, "").trim()); if (c.length < 3) continue;
    const [date, text2, ...rest] = c; const dr = Number(rest[0] || 0), cr = Number(rest[1] || 0);
    const amount = rest.length > 1 ? cr - dr : Number(rest[0]); if (!date || !isFinite(amount) || !amount) continue;
    const hash = hashStr(account + date + text2 + amount); if (seen.has(hash)) { dup++; continue; } seen.add(hash);
    out.push({ id: uid(), account, date: normDate(date), text: text2, amount, state: "review", hash });
  }
  statementSig.value = [...out, ...statementSig.value]; logFn("Imported statement", `${out.length} lines · ${dup} duplicates skipped`, "money");
  return { added: out.length, dup };
}
const normDate = (d: string) => (/^\d{4}-/.test(d) ? d : (([a, b, c]) => `${c.length === 2 ? "20" + c : c}-${b.padStart(2, "0")}-${a.padStart(2, "0")}`)(d.split(/[/.-]/)));
/** Suggest a match: unpaid invoice by exact amount, or net of 1%/2% TDS; expense by amount; else name tokens. */
export function suggest(l: StatementLine): string {
  if (l.amount > 0) {
    for (const i of invoicesSig.value.filter((i) => i.kind === "invoice" && !i.paidOn && i.status === "issued")) {
      const t = invTax(i).total;
      if (Math.abs(t - l.amount) < 1) return `Receipt · ${i.no}`;
      for (const tds of [1, 2]) if (Math.abs(t - invTax(i).taxable * tds / 100 - l.amount) < 2) return `Receipt · ${i.no} (net of ${tds}% TDS)`;
      if (l.text.toUpperCase().includes(i.customer.split(" ")[0].toUpperCase())) return `Part receipt · ${i.no}?`;
    }
    return "Other income / advance";
  }
  const e = expensesSig.value.find((e) => !e.paid && Math.abs(e.amount + l.amount) < 1);
  return e ? `Pays expense · ${e.vendor}` : "New expense";
}
export function confirmLine(l: StatementLine) {
  const s = suggest(l); const m = s.match(/(B\/\d\d-\d\d\/\d{4})/);
  const inv = m && invoicesSig.value.find((i) => i.no === m[1]);
  if (inv && !s.startsWith("Part")) markPaid(inv, l.account, l.date);
  else addMoney({ date: l.date, account: l.account, kind: l.amount > 0 ? (s.startsWith("Part") ? "receipt" : "other_income") : "expense", amount: l.amount, note: l.text, source: "statement" });
  statementSig.value = statementSig.value.map((x) => (x.id === l.id ? { ...x, state: "confirmed", match: s } : x));
}
export const rejectLine = (l: StatementLine) => (statementSig.value = statementSig.value.map((x) => (x.id === l.id ? { ...x, state: "rejected" } : x)));

/* ---------------------------------------------------------------- finance summary (one rule, every caller) */
export const orderValue = (o: Order) => o.items.reduce((s, i) => s + i.qty * i.price, 0);
export function financeSummary(win: [string, string], orders: Order[]) {
  const inv = invoicesSig.value.filter((i) => inWin(i.date, win));
  const linked = new Set(invoicesSig.value.filter((i) => i.status === "issued").map((i) => i.orderNo));
  const collected = inv.filter((i) => i.paidOn && i.kind === "invoice").reduce((s, i) => s + invTax(i).total, 0);
  const closedNoInv = orders.filter((o) => o.stage === "archived" && !linked.has(o.no) && inWin(o.due, win)).reduce((s, o) => s + orderValue(o), 0);
  const credits = inv.filter((i) => i.kind === "credit").reduce((s, i) => s + invTax(i).total, 0);
  const outstanding = inv.filter((i) => !i.paidOn && i.kind === "invoice").reduce((s, i) => s + invTax(i).total, 0);
  const outstandingAll = invoicesSig.value.filter((i) => !i.paidOn && i.kind === "invoice").reduce((s, i) => s + invTax(i).total, 0);
  const exp = expensesSig.value.filter((e) => inWin(e.date, win));
  const spent = exp.reduce((s, e) => s + e.amount, 0);
  const pipeline = orders.filter((o) => o.stage !== "archived").reduce((s, o) => s + orderValue(o), 0);
  const revenue = inv.reduce((s, i) => s + invTax(i).taxable, 0);
  return { earned: collected + closedNoInv + credits, collected, outstanding, outstandingAll, spent, pipeline, revenue, entries: exp.length, closedNoInv };
}
export function windowFor(p: string, fy: string): [string, string] {
  const t = today(), [y, m] = t.split("-").map(Number);
  if (p === "mtd") return [`${t.slice(0, 7)}-01`, t];
  if (p === "last") { const d = new Date(y, m - 2, 1); const e = new Date(y, m - 1, 0); return [d.toISOString().slice(0, 10), e.toISOString().slice(0, 10)]; }
  if (p === "qtd") { const qs = Math.floor(((m + 8) % 12) / 3) * 3 + 4; const sm = qs > 12 ? qs - 12 : qs; const sy = sm > m ? y - 1 : y; return [`${sy}-${String(sm).padStart(2, "0")}-01`, t]; }
  return fyWindow(fy);
}
export function monthly(fy: string) {
  const s = Number(fy.slice(0, 4));
  return Array.from({ length: 12 }, (_, i) => { const mm = ((i + 3) % 12) + 1, yy = mm >= 4 ? s : s + 1; const k = `${yy}-${String(mm).padStart(2, "0")}`;
    return { k, label: new Date(yy, mm - 1, 1).toLocaleString("en-IN", { month: "short" }),
      earned: invoicesSig.value.filter((i) => i.date.startsWith(k)).reduce((a, i) => a + invTax(i).total, 0),
      spent: expensesSig.value.filter((e) => e.date.startsWith(k)).reduce((a, e) => a + e.amount, 0) }; });
}

/* ---------------------------------------------------------------- Books */
export const depreciation = (a: Asset, fy: string) => { const [s] = fyWindow(fy); const half = a.date >= `${Number(fy.slice(0, 4))}-10-03` && a.date <= fyWindow(fy)[1]; const wdvStart = a.date < s ? a.cost * Math.pow(1 - a.blockRate / 100, Math.max(0, Number(fy.slice(0, 4)) - Number(fyOf(a.date).slice(0, 4)))) : a.cost; const dep = r2(wdvStart * a.blockRate / 100 * (half ? 0.5 : 1)); return { open: r2(wdvStart), dep, wdv: r2(wdvStart - dep) }; };
export function books(fy: string) {
  const win = fyWindow(fy);
  const sales = invoicesSig.value.filter((i) => inWin(i.date, win)).map((i) => ({ ...invTax(i), id: i.id, no: i.no, date: i.date, party: i.customer, status: i.status, kind: i.kind }));
  const purchase = billsSig.value.filter((b) => b.status === "logged" && inWin(b.date, win)).map((b) => ({ id: b.id, no: b.no, date: b.date, party: b.vendor, taxable: b.subtotal, cgst: r2(b.tax / 2), sgst: r2(b.tax / 2), igst: 0, total: b.total }));
  const t = today();
  const debt = new Map<string, number[]>();
  invoicesSig.value.filter((i) => !i.paidOn && i.kind === "invoice" && i.status === "issued").forEach((i) => {
    const age = daysBetween(i.date, t), b = age <= 30 ? 0 : age <= 60 ? 1 : age <= 90 ? 2 : 3;
    const row = debt.get(i.customer) ?? [0, 0, 0, 0]; row[b] += invTax(i).total; debt.set(i.customer, row);
  });
  const debtors = [...debt].map(([party, r]) => ({ id: party, party, b0: r[0], b30: r[1], b60: r[2], b90: r[3], total: r.reduce((a, b) => a + b, 0) }));
  const creditors = expensesSig.value.filter((e) => !e.paid).map((e) => {
    const deadline = e.msme ? new Date(Date.parse(e.date) + 45 * 864e5).toISOString().slice(0, 10) : e.dueDate ?? "";
    return { id: e.id, party: e.vendor, msme: e.msme || "—", due: deadline, total: e.amount, h: !!e.msme && t > deadline, left: deadline ? daysBetween(t, deadline) : 0, date: e.date };
  });
  const heads = new Map<string, number>(); expensesSig.value.filter((e) => inWin(e.date, win)).forEach((e) => heads.set(e.head, (heads.get(e.head) ?? 0) + e.amount));
  const deps = assetsSig.value.map((a) => ({ ...a, ...depreciation(a, fy) }));
  const salesTot = sales.reduce((s, x) => s + x.taxable, 0);
  const direct = expensesSig.value.filter((e) => inWin(e.date, win) && ["Filament", "Packing", "Courier"].includes(e.head)).reduce((s, e) => s + e.amount - e.tax, 0);
  const indirect = expensesSig.value.filter((e) => inWin(e.date, win) && !["Filament", "Packing", "Courier"].includes(e.head)).reduce((s, e) => s + e.amount - e.tax, 0);
  const op = openingSig.value;
  const gross = salesTot - (op.stock + direct - op.closingStock);
  const depTot = deps.reduce((s, d) => s + d.dep, 0);
  const interest = loansSig.value.reduce((s, l) => s + (l.principal - l.repaid) * l.rate / 100, 0);
  const net = gross - indirect - depTot - interest;
  const cash = accountsSig.value.reduce((s, a) => s + balanceOf(a.id, win[1]), 0);
  const debtorsTot = debtors.reduce((s, d) => s + d.total, 0), creditorsTot = creditors.reduce((s, c) => s + c.total, 0);
  const capitalIn = moneySig.value.filter((m) => m.kind === "capital_in" && inWin(m.date, win)).reduce((s, m) => s + m.amount, 0);
  const drawings = -moneySig.value.filter((m) => m.kind === "drawings" && inWin(m.date, win)).reduce((s, m) => s + m.amount, 0);
  const loansOut = loansSig.value.reduce((s, l) => s + l.principal - l.repaid, 0);
  const fixed = deps.reduce((s, d) => s + d.wdv, 0);
  const assetsSide = fixed + debtorsTot + cash + op.closingStock;
  const capital = op.capital + capitalIn - drawings + net;
  const suspense = r2(assetsSide - (capital + creditorsTot + loansOut));
  const cf = (kinds: string[]) => moneySig.value.filter((m) => kinds.includes(m.kind) && inWin(m.date, win)).reduce((s, m) => s + m.amount, 0);
  const cashflow = { operating: cf(["receipt", "expense", "advance", "other_income"]), investing: cf(["asset_purchase"]), financing: cf(["capital_in", "drawings", "loan_taken", "loan_repayment"]) };
  const wastage = M.consumption.filter((c) => c.kind === "scrap").reduce((s, c) => s + c.cost, 0);
  return { sales, purchase, debtors, creditors, heads: [...heads].map(([head, amount], k) => ({ id: String(k), head, amount })), wastage, deps,
    pl: { salesTot, opening: op.stock, direct, closing: op.closingStock, gross, indirect, depTot, interest, net },
    bs: { capital, creditorsTot, loansOut, suspense, fixed, debtorsTot, cash, stock: op.closingStock, total: assetsSide }, cashflow };
}
export function parties() {
  const m = new Map<string, { name: string; type: string; gstin: string; bal: number }>();
  const norm = (s: string) => s.toLowerCase().replace(/\b(pvt|private|ltd|limited|co|llp)\b\.?/g, "").replace(/[^a-z0-9]/g, "");
  invoicesSig.value.forEach((i) => { const k = i.gstin || norm(i.customer); const p = m.get(k) ?? { name: i.customer, type: "Customer", gstin: i.gstin ?? "", bal: 0 }; if (!i.paidOn && i.status === "issued") p.bal += invTax(i).total; m.set(k, p); });
  expensesSig.value.forEach((e) => { const k = norm(e.vendor); const p = m.get(k) ?? { name: e.vendor, type: e.msme ? `Vendor · MSME ${e.msme}` : "Vendor", gstin: "", bal: 0 }; if (!e.paid) p.bal -= e.amount; m.set(k, p); });
  return [...m].map(([id, p]) => ({ id, ...p }));
}

/* ---------------------------------------------------------------- GST */
export function gstMonths(fy: string) {
  const s = Number(fy.slice(0, 4));
  return Array.from({ length: 12 }, (_, i) => { const mm = ((i + 3) % 12) + 1, yy = mm >= 4 ? s : s + 1; const k = `${yy}-${String(mm).padStart(2, "0")}`;
    const inv = invoicesSig.value.filter((x) => x.date.startsWith(k)); const t = inv.map(invTax);
    const sum = (f: (x: ReturnType<typeof invTax>) => number) => r2(t.reduce((a, x) => a + f(x), 0));
    const purch = billsSig.value.filter((b) => b.status === "logged" && b.date.startsWith(k));
    return { id: k, k, label: new Date(yy, mm - 1, 1).toLocaleString("en-IN", { month: "short", year: "2-digit" }), inv, purch,
      b2b: inv.filter((x) => x.gstin && x.kind === "invoice").length, b2c: inv.filter((x) => !x.gstin && x.kind === "invoice").length, credits: inv.filter((x) => x.kind === "credit").length,
      taxable: sum((x) => x.taxable), cgst: sum((x) => x.cgst), sgst: sum((x) => x.sgst), igst: sum((x) => x.igst), itc: r2(purch.reduce((a, b) => a + b.tax, 0)),
      filed: gstSig.value[k] ?? { r1: false, r3b: false, locked: false } }; });
}
export function setGst(k: string, p: Partial<GstMonth>) { gstSig.value = { ...gstSig.value, [k]: { ...(gstSig.value[k] ?? { r1: false, r3b: false, locked: false }), ...p } }; logFn("GST month updated", `${k} ${JSON.stringify(p)}`, "money"); }
export const monthLocked = (d: string) => !!gstSig.value[d.slice(0, 7)]?.locked;

/* ---------------------------------------------------------------- Goals (progress derived, never stored) */
export const GOAL_HINT: Record<GoalMetric, string> = {
  revenue: "Paid invoices + closed orders never invoiced — what the business earned",
  collection: "Paid invoices only — money that reached the bank",
  profit: "Revenue earned less every expense in the window",
  expense_cap: "A ceiling, not a target — met by staying under it",
  orders: "Orders that reached Archive inside the window",
  margin_pct: "Average margin across orders archived in the window",
  custom: "Nothing measures this — you move the number yourself",
};
export const GOAL_LABEL: Record<GoalMetric, string> = { revenue: "Revenue earned", collection: "Cash collected", profit: "Profit", expense_cap: "Spending ceiling", orders: "Orders closed", margin_pct: "Average margin", custom: "Tracked by hand" };
export function goalProgress(g: Goal, orders: Order[]) {
  const win: [string, string] = [g.start, g.end]; const f = financeSummary(win, orders);
  const arch = orders.filter((o) => o.stage === "archived" && inWin(o.due, win));
  const v = { revenue: f.earned, collection: f.collected, profit: f.earned - f.spent, expense_cap: f.spent, orders: arch.length,
    margin_pct: arch.filter((o) => orderValue(o)).length ? Math.round(arch.filter((o) => orderValue(o)).reduce((s, o) => s + (1 - o.items.reduce((a, i) => a + i.qty * i.cost, 0) / orderValue(o)), 0) / arch.filter((o) => orderValue(o)).length * 100) : 0,
    custom: g.manual ?? 0 }[g.metric];
  const total = Math.max(1, daysBetween(g.start, g.end)), gone = Math.min(total, Math.max(0, daysBetween(g.start, today())));
  const pct = Math.round((v / g.target) * 100), pace = Math.round((gone / total) * 100);
  return { value: v, pct, pace, behind: g.metric === "expense_cap" ? pct > pace : pct < pace };
}

/* ---------------------------------------------------------------- Attention (derived, never stored) */
export type Alert = { t: "danger" | "warn" | "info"; text: string; href: string };
export function attention(orders: Order[], spools: { material: string; colour: string; grams: number; spoolNo: string }[], pack: { name: string; qty: number; reorderAt: number; unit: string }[], batches: { orderNo: string; name: string; stage: string; invoiceNo?: string }[]): Record<string, Alert[]> {
  const t = today(), terms = rate("terms");
  const linked = new Set(invoicesSig.value.filter((i) => i.status === "issued").map((i) => i.orderNo));
  const money: Alert[] = [];
  invoicesSig.value.filter((i) => i.kind === "invoice" && i.status === "issued" && !i.paidOn).forEach((i) => { const age = daysBetween(i.date, t);
    money.push({ t: age > 75 ? "danger" : age > terms ? "warn" : "info", text: `${i.no} · ${i.customer} — unpaid ${age} days`, href: "/work/invoice" }); });
  orders.filter((o) => o.stage === "archived" && orderValue(o) && !linked.has(o.no)).forEach((o) => money.push({ t: "danger", text: `${o.no} closed out but never invoiced`, href: "/work/invoice" }));
  orders.filter((o) => o.stage === "archived" && orderValue(o) && o.items.reduce((s, i) => s + i.qty * i.cost, 0) > orderValue(o)).forEach((o) => money.push({ t: "danger", text: `${o.no} closed at a loss`, href: "/work/archive" }));
  orders.filter((o) => o.stage !== "archived" && o.type !== "inhouse" && !orderValue(o)).forEach((o) => money.push({ t: "warn", text: `${o.no} open with no price`, href: "/work/orders" }));
  quotesSig.value.filter((q) => q.outcome === "open" && daysBetween(t, q.valid) <= 7 && daysBetween(t, q.valid) >= 0).forEach((q) => money.push({ t: "warn", text: `${q.no} lapses in ${daysBetween(t, q.valid)} days`, href: "/work/quotes" }));
  const rev = billsSig.value.filter((b) => b.status === "needs_review").length, bad = billsSig.value.filter((b) => b.status === "failed").length;
  if (rev || bad) money.push({ t: "info", text: `${rev} bill(s) waiting for review · ${bad} unreadable`, href: "/mauny/purchases" });
  batches.filter((b) => b.stage === "invoice" && !b.invoiceNo).forEach((b) => money.push({ t: "warn", text: `${b.orderNo} ${b.name} — dispatch invoice not raised`, href: "/work/bulk" }));
  const quality: Alert[] = [];
  M.jobs.filter((j) => j.status === "failed").forEach((j) => quality.push({ t: "danger", text: `${j.orderNo} ${j.item} failed — no reprint queued`, href: "/work/production" }));
  const floor = X.machineLog.reduce((s, m) => s + m.fail, 0) / X.machineLog.length;
  if (floor > rate("failRate")) quality.push({ t: "warn", text: `Floor failure rate ${Math.round(floor)}% (alert at ${rate("failRate")}%)`, href: "/mauny/reports" });
  X.machineLog.filter((m) => m.fail > floor * 2).forEach((m) => quality.push({ t: "warn", text: `${m.printer} failing ${m.fail}% vs floor ${Math.round(floor)}%`, href: "/workshop/printers" }));
  M.qc.filter((q) => q.result === "scrap").forEach((q) => quality.push({ t: "info", text: `${q.orderNo} QC ended in scrap (${q.grams} g)`, href: "/work/qc" }));
  const flow: Alert[] = [];
  orders.filter((o) => o.stage !== "archived" && o.due < t).forEach((o) => flow.push({ t: "danger", text: `${o.no} missed target date (${o.due})`, href: "/work/orders" }));
  orders.filter((o) => o.stage !== "archived" && daysBetween(o.created, t) > 21).forEach((o) => flow.push({ t: "warn", text: `${o.no} open more than three weeks`, href: "/work/orders" }));
  orders.filter((o) => o.blocked).forEach((o) => flow.push({ t: "warn", text: `${o.no} on hold — ${o.blocked}`, href: "/work/orders" }));
  orders.filter((o) => o.stage === "shipping" && !o.tracking).forEach((o) => flow.push({ t: "warn", text: `${o.no} shipping — tracking missing`, href: "/work/shipping" }));
  shipmentsSig.value.filter((s) => s.eta < t && daysBetween(s.eta, t) < 30 && !s.tracking).forEach((s) => flow.push({ t: "warn", text: `${s.orderNo} shipment past delivery date`, href: "/work/shipping" }));
  const stock: Alert[] = [];
  spools.forEach((s) => { if (s.grams === 0) stock.push({ t: "danger", text: `${s.material} ${s.colour} — out of stock`, href: "/workshop" }); else if (s.grams < rate("reorderFilament")) stock.push({ t: "warn", text: `${s.material} ${s.colour} ${s.grams} g — below reorder`, href: "/workshop" }); });
  pack.filter((p) => p.qty <= p.reorderAt).forEach((p) => stock.push({ t: "warn", text: `${p.name} ${p.qty} ${p.unit} — at reorder point`, href: "/workshop/packing" }));
  X.accessories.filter((a) => a.qty <= a.reorderAt).forEach((a) => stock.push({ t: "warn", text: `${a.name} — below reorder`, href: "/workshop/parts" }));
  const order = (l: Alert[]) => l.sort((a, b) => ["danger", "warn", "info"].indexOf(a.t) - ["danger", "warn", "info"].indexOf(b.t));
  return { Money: order(money), Quality: order(quality), Flow: order(flow), Stock: order(stock) };
}

/* ---------------------------------------------------------------- exports */
export function download(name: string, content: string, type = "text/plain") {
  // Inside a claude.ai artifact, files go through the viewer's downloads capability; elsewhere a plain link.
  const c = (window as unknown as { claude?: { use: (n: string) => Promise<{ save: (r: { filename: string; data: Blob }) => Promise<unknown> } | null> } }).claude;
  const blob = new Blob([content], { type });
  const plain = () => { const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); };
  if (c?.use) c.use("downloads").then((d) => (d ? d.save({ filename: name, data: blob }).catch(() => {}) : plain())); else plain();
}
export const csv = (rows: Record<string, unknown>[]) => { if (!rows.length) return ""; const k = Object.keys(rows[0]); const q = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`; return [k.join(","), ...rows.map((r) => k.map((x) => q(r[x])).join(","))].join("\n"); };
export function tallyXml(fy: string) {
  const win = fyWindow(fy); const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  const v = invoicesSig.value.filter((i) => inWin(i.date, win) && i.status === "issued").map((i) => { const t = invTax(i);
    return `<TALLYMESSAGE><VOUCHER VCHTYPE="${i.kind === "credit" ? "Credit Note" : "Sales"}" ACTION="Create"><DATE>${i.date.replace(/-/g, "")}</DATE><VOUCHERNUMBER>${esc(i.no)}</VOUCHERNUMBER><PARTYLEDGERNAME>${esc(i.customer)}</PARTYLEDGERNAME>
<ALLLEDGERENTRIES.LIST><LEDGERNAME>${esc(i.customer)}</LEDGERNAME><AMOUNT>${-t.total}</AMOUNT></ALLLEDGERENTRIES.LIST>
<ALLLEDGERENTRIES.LIST><LEDGERNAME>Sales</LEDGERNAME><AMOUNT>${t.taxable}</AMOUNT></ALLLEDGERENTRIES.LIST>
${t.igst ? `<ALLLEDGERENTRIES.LIST><LEDGERNAME>IGST</LEDGERNAME><AMOUNT>${t.igst}</AMOUNT></ALLLEDGERENTRIES.LIST>` : `<ALLLEDGERENTRIES.LIST><LEDGERNAME>CGST</LEDGERNAME><AMOUNT>${t.cgst}</AMOUNT></ALLLEDGERENTRIES.LIST><ALLLEDGERENTRIES.LIST><LEDGERNAME>SGST</LEDGERNAME><AMOUNT>${t.sgst}</AMOUNT></ALLLEDGERENTRIES.LIST>`}
</VOUCHER></TALLYMESSAGE>`; });
  const p = expensesSig.value.filter((e) => inWin(e.date, win)).map((e) => `<TALLYMESSAGE><VOUCHER VCHTYPE="Purchase" ACTION="Create"><DATE>${e.date.replace(/-/g, "")}</DATE><PARTYLEDGERNAME>${esc(e.vendor)}</PARTYLEDGERNAME><ALLLEDGERENTRIES.LIST><LEDGERNAME>${esc(e.head)}</LEDGERNAME><AMOUNT>${-e.amount}</AMOUNT></ALLLEDGERENTRIES.LIST><ALLLEDGERENTRIES.LIST><LEDGERNAME>${esc(e.vendor)}</LEDGERNAME><AMOUNT>${e.amount}</AMOUNT></ALLLEDGERENTRIES.LIST></VOUCHER></TALLYMESSAGE>`);
  return `<?xml version="1.0"?>\n<ENVELOPE><HEADER><TALLYREQUEST>Import Data</TALLYREQUEST></HEADER><BODY><IMPORTDATA><REQUESTDESC><REPORTNAME>Vouchers</REPORTNAME></REQUESTDESC><REQUESTDATA>\n${[...v, ...p].join("\n")}\n</REQUESTDATA></IMPORTDATA></BODY></ENVELOPE>`;
}
export const nowS = nowStamp;
export const unpaidTotal = computed(() => invoicesSig.value.filter((i) => !i.paidOn && i.kind === "invoice" && i.status === "issued").reduce((s, i) => s + invTax(i).total, 0));
