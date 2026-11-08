/** Money, documents and books: records + the pure rules computed over them (Blueprint v2 §Finance, Books, GST, Mauny, Goals, Attention). */
import { computed } from "@preact/signals";
import { persisted, uid, today, nowStamp } from "./store";
import { rate } from "./rates";
import { itemsSig, jobsSig, qcSig, machineStats, printersSig } from "./inventory";
import type { Order, Stage } from "../mock/types";

/* ---------------------------------------------------------------- types */
export type InvLine = { desc: string; hsn: string; qty: number; rate: number };
export type Invoice = {
  id: string; kind: "invoice" | "credit"; no: string; date: string; customer: string; gstin?: string; address?: string;
  orderNo?: string; batch?: string; lines: InvLine[]; gstRate: number; interstate: boolean;
  status: "issued" | "cancelled"; paidOn?: string; paidAccount?: string; against?: string; note?: string;
  shipTo?: string; contact?: string; pos?: string; shipping?: number;
};
export type Quote = { id: string; no: string; date: string; customer: string; orderNo?: string; lines: InvLine[]; gstRate: number; valid: string; outcome: "open" | "approved" | "lost" | "unrecorded"; address?: string; tech?: string };
export type Expense = { id: string; date: string; head: string; vendor: string; amount: number; tax: number; billId?: string; paid: boolean; account?: string; msme?: "Micro" | "Small" | ""; dueDate?: string };
export type Bill = { id: string; vendor: string; gstin?: string; no: string; date: string; subtotal: number; tax: number; total: number; cat: string; status: "needs_review" | "logged" | "failed" | "rejected"; note: string; file?: string; fy?: string; lines?: { desc: string; amount: number; qty?: number; unit?: string }[]; stockApplied?: string };
export type Account = { id: string; name: string; opening: number };
export type MoneyKind = "receipt" | "expense" | "transfer_out" | "transfer_in" | "capital_in" | "drawings" | "loan_taken" | "loan_repayment" | "asset_purchase" | "other_income" | "advance" | "tax_payment";
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

/* ---------------------------------------------------------------- stores */
export const invoicesSig = persisted<Invoice[]>("invoices", []);
export const quotesSig = persisted<Quote[]>("quotes", []);
export const expensesSig = persisted<Expense[]>("expenses", []);
export const billsSig = persisted<Bill[]>("bills", []);
export const accountsSig = persisted<Account[]>("accounts", []);
export const moneySig = persisted<MoneyEntry[]>("money", []);
export const goalsSig = persisted<Goal[]>("goals", []);
export const shipmentsSig = persisted<Shipment[]>("shipments", []);
export const historySig = persisted<StageMove[]>("stageHistory", []);
export const assetsSig = persisted<Asset[]>("assets", []);
export const loansSig = persisted<Loan[]>("loans", []);
export const designSig = persisted<Record<string, LineDesign>>("lineDesign", {});
export const statementSig = persisted<StatementLine[]>("statement", []);
export const gstSig = persisted<Record<string, GstMonth>>("gstFiled", {});
export const photosSig = persisted<{ id: string; ref: string; stage: string; name: string; data: string; at: string }[]>("photos", []);
export const openingSig = persisted<{ capital: number; stock: number; closingStock: number }>("opening", { capital: 0, stock: 0, closingStock: 0 });

/* ---------------------------------------------------------------- helpers */
export const r2 = (n: number) => Math.round(n * 100) / 100;
export const fyOf = (d: string) => { const [y, m] = d.split("-").map(Number); const s = m >= 4 ? y : y - 1; return `${s}-${String((s + 1) % 100).padStart(2, "0")}`; };
export const fyWindow = (fy: string): [string, string] => { const s = Number(fy.slice(0, 4)); return [`${s}-04-01`, `${s + 1}-03-31`]; };
export const inWin = (d: string, [a, b]: [string, string]) => d >= a && d <= b;
export const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 864e5);
/** Invoice arithmetic as printed: half-GST per head rounded to paise, shipping added, total rounded to the rupee (round-off shown). */
export function invTax(i: Invoice) {
  const taxable = r2(i.lines.reduce((s, l) => s + l.qty * l.rate, 0));
  const half = r2((taxable * i.gstRate) / 200);
  const gst = i.interstate ? r2((taxable * i.gstRate) / 100) : r2(half * 2);
  const ship = r2(i.shipping ?? 0);
  const exact = r2(taxable + gst + ship), total = Math.round(exact);
  const k = (i.kind === "credit" ? -1 : 1) * (i.status === "issued" ? 1 : 0);
  return { taxable: k * taxable, cgst: k * (i.interstate ? 0 : half), sgst: k * (i.interstate ? 0 : half), igst: k * (i.interstate ? gst : 0), shipping: k * ship, roundOff: k * r2(total - exact), total: k * total };
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

export let logFn: (a: string, t: string, k?: "order" | "stock" | "consumption" | "money") => void = () => {};
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
  receiveStock(b);
}
/** Bill → stock: filament and packing lines with a quantity come into the stock ledger once (blueprint 12, receiving). */
let applyMoveFn: ((m: import("../mock/types").Movement) => void) | null = null;
export const setStockSink = (f: typeof applyMoveFn) => (applyMoveFn = f);
export function receiveStock(b: Bill) {
  if (b.stockApplied || !applyMoveFn || !/filament|packing/i.test(b.cat)) return 0;
  const cat = /filament/i.test(b.cat) ? "filament" : "packing";
  const rows = (b.lines ?? []).filter((l) => l.qty && l.qty > 0);
  for (const l of rows) {
    const kg = /kg/i.test(l.unit ?? "") || (cat === "filament" && !l.unit);
    const qty = cat === "filament" ? (kg ? l.qty! * 1000 : l.qty!) : l.qty!;
    applyMoveFn({ id: uid(), date: b.date, cat, item: l.desc, dir: "in", qty, unit: cat === "filament" ? "g" : l.unit || "pcs", unitCost: r2(l.amount / qty), vendor: b.vendor, notes: `Bill ${b.no}`, by: "Purchases" });
  }
  if (rows.length) billsSig.value = billsSig.value.map((x) => (x.id === b.id ? { ...x, stockApplied: today() } : x));
  return rows.length;
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

export const monthLocked = (d: string) => !!gstSig.value[d.slice(0, 7)]?.locked;
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
  const failed = new Set(jobsSig.value.filter((j) => j.status === "failed").map((j) => j.id));
  jobsSig.value.filter((j) => j.status === "failed" && !jobsSig.value.some((r) => r.id !== j.id && r.orderNo === j.orderNo && r.item === j.item && !failed.has(r.id))).forEach((j) => quality.push({ t: "danger", text: `${j.orderNo} ${j.item} failed — no reprint queued`, href: "/work/production" }));
  const logs = printersSig.value.filter((p) => p.active !== false).map((p) => ({ printer: p.name, ...machineStats(p.name) })).filter((m) => m.jobs);
  const floor = logs.length ? logs.reduce((s, m) => s + m.fail, 0) / logs.length : 0;
  if (floor > rate("failRate")) quality.push({ t: "warn", text: `Floor failure rate ${Math.round(floor)}% (alert at ${rate("failRate")}%)`, href: "/mauny/reports" });
  logs.filter((m) => m.fail > Math.max(5, floor * 2)).forEach((m) => quality.push({ t: "warn", text: `${m.printer} failing ${m.fail}% vs floor ${Math.round(floor)}%`, href: "/workshop/printers" }));
  qcSig.value.filter((q) => q.result === "scrap").forEach((q) => quality.push({ t: "info", text: `${q.orderNo} QC ended in scrap (${q.grams} g)`, href: "/work/qc" }));
  const flow: Alert[] = [];
  orders.filter((o) => o.stage !== "archived" && o.due < t).forEach((o) => flow.push({ t: "danger", text: `${o.no} missed target date (${o.due})`, href: "/work/orders" }));
  orders.filter((o) => o.stage !== "archived" && daysBetween(o.created, t) > 21).forEach((o) => flow.push({ t: "warn", text: `${o.no} open more than three weeks`, href: "/work/orders" }));
  orders.filter((o) => o.blocked).forEach((o) => flow.push({ t: "warn", text: `${o.no} on hold — ${o.blocked}`, href: "/work/orders" }));
  orders.filter((o) => o.stage === "shipping" && !o.tracking).forEach((o) => flow.push({ t: "warn", text: `${o.no} shipping — tracking missing`, href: "/work/shipping" }));
  shipmentsSig.value.filter((s) => s.eta < t && daysBetween(s.eta, t) < 30 && !s.tracking).forEach((s) => flow.push({ t: "warn", text: `${s.orderNo} shipment past delivery date`, href: "/work/shipping" }));
  const stock: Alert[] = [];
  spools.forEach((s) => { if (s.grams === 0) stock.push({ t: "danger", text: `${s.material} ${s.colour} — out of stock`, href: "/workshop" }); else if (s.grams < rate("reorderFilament")) stock.push({ t: "warn", text: `${s.material} ${s.colour} ${s.grams} g — below reorder`, href: "/workshop" }); });
  pack.filter((p) => p.qty <= p.reorderAt).forEach((p) => stock.push({ t: "warn", text: `${p.name} ${p.qty} ${p.unit} — at reorder point`, href: "/workshop/packing" }));
  itemsSig.value.filter((a) => a.active !== false && a.qty <= a.reorderAt).forEach((a) => stock.push({ t: "warn", text: `${a.name} — below reorder`, href: "/workshop/parts" }));
  const order = (l: Alert[]) => l.sort((a, b) => ["danger", "warn", "info"].indexOf(a.t) - ["danger", "warn", "info"].indexOf(b.t));
  return { Money: order(money), Quality: order(quality), Flow: order(flow), Stock: order(stock) };
}

export const nowS = nowStamp;
export const unpaidTotal = computed(() => invoicesSig.value.filter((i) => !i.paidOn && i.kind === "invoice" && i.status === "issued").reduce((s, i) => s + invTax(i).total, 0));
