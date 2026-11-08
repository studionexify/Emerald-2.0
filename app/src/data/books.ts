/** Books, GST months, goals and exports — only the Mauny screens use these, so they load with Mauny, not on every page. */
import { billsSig, balanceOf, orderValue, gstSig, invoicesSig, expensesSig, moneySig, assetsSig, loansSig, openingSig, accountsSig, fyOf, fyWindow, inWin, invTax, r2, daysBetween, financeSummary, logFn, type Asset, type Goal, type GoalMetric, type GstMonth } from "./ledger";
import type { Order } from "../mock/types";
import { today } from "./store";
import * as M from "../mock/data";
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
  const cashflow = { operating: cf(["receipt", "expense", "advance", "other_income", "tax_payment"]), investing: cf(["asset_purchase"]), financing: cf(["capital_in", "drawings", "loan_taken", "loan_repayment"]) };
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
