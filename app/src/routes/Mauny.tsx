import { pastValues, recall } from "../data/memory";
import { moneySig } from "../data";
import { sortAbc } from "../mock/types";
import { modeAccounts } from "../data/mode";
import { vBills, vExpenses, vMoney, vOrders, vQuotes } from "../data";
import type { ComponentChildren } from "preact";
import { useEffect, useState } from "preact/hooks";
import { inspectSig, peek, Peeked } from "../ui/record";
import { MAUNY_TABS } from "../nav";
import { Bars, Line } from "../charts";
import { Icon, Pick, Button, Card, CardTitle, Chip, DetailHead, Empty, Fact, Field, inputCls, Page, Progress, Section, Stat, Status, SubTabs, Table } from "../ui";
import { fyWindow, inWin, jobsSig, qcSig, historySig, daysBetween, STAGE_ORDER, STAGE_LABEL, TYPE_LABEL, rate, moduleOf } from "../data";
import { shrinkImage, storeMedia } from "../data";
import { MediaFile } from "../ui/media";
import { books, csv, download, GOAL_LABEL, goalProgress, gstMonths, parties, setGst, tallyXml } from "../data/books";
import {
  accountsSig, addBill, addExpense, addMoney, balanceOf, billChecks, billsSig, can, confirmBill, confirmLine, consSig, daySummary, expensesSig,
  financeSummary, fyOf, goalsSig, inr, invoicesSig, invTax, isExternal, loansSig, monthly, openingSig, 
  parseStatementCsv, rejectLine, shortDate, statementSig, suggest, today, transfer, uid, windowFor,
  type Bill, type Goal, type GoalMetric, type MoneyKind,
} from "../data";

const FYS = ["2026-27", "2025-26"];
function Shell({ title, sub, actions, toolbar, detail, children }: { title: string; sub?: string; actions?: ComponentChildren; toolbar?: ComponentChildren; detail?: ComponentChildren | null; children: ComponentChildren }) {
  useEffect(() => () => { inspectSig.value = null; }, []);
  return <Page title={title} sub={sub} actions={actions} toolbar={toolbar} detail={detail || (inspectSig.value ? <Peeked /> : null)} tabs={isExternal() ? undefined : MAUNY_TABS.filter((t) => can(moduleOf(t.href)))}>{children}</Page>;
}
const sm = "h-7 px-2.5 rounded-md bg-c0 border border-line text-xs font-medium";
const FY = ({ v, on }: { v: string; on: (v: string) => void }) => <select aria-label="Financial year" class={sm} value={v} onChange={(e) => on((e.target as HTMLSelectElement).value)}>{FYS.map((f) => <option key={f} value={f}>FY {f}</option>)}</select>;
/** A figure with its rule always visible (tap ⓘ to expand formula + inputs). */
function Fig({ label, value, note, dark, rule, inputs }: { label: string; value: string; note?: string; dark?: boolean; rule: string; inputs?: [string, string][] }) {
  const [o, setO] = useState(false);
  return (
    <div class="bg-c0 px-3 py-2 min-w-0">
      <button class="t-meta flex items-center gap-1 cursor-pointer" onClick={() => setO(!o)} aria-expanded={o} title={rule}>{label} <span aria-hidden="true" class="text-c2">ⓘ</span></button>
      <div class={`num text-[17px] font-semibold leading-tight mt-0.5 ${dark ? "" : ""}`}>{value}</div>
      {note && <div class="t-meta">{note}</div>}
      {o && <div class="t-meta mt-1 leading-snug">{rule}</div>}
      {o && inputs && <ul class="text-[11px] mt-1 border-t border-line pt-1">{inputs.map(([a, b]) => <li key={a} class="flex justify-between gap-2"><span class="text-c3">{a}</span><span class="num">{b}</span></li>)}</ul>}
    </div>
  );
}

/** Every vendor typed before, on bills and expenses. */
function VendorList() {
  const names = [...new Set([...pastValues(billsSig.value, "vendor"), ...pastValues(vExpenses(), "vendor")])].sort((a, b) => a.localeCompare(b));
  return <datalist id="mem-vendors">{names.map((n) => <option key={n} value={n} />)}</datalist>;
}

/* ======================================================= Overview / Mauny money book */
const KINDS: [MoneyKind, string, 1 | -1][] = [["receipt", "Customer receipt", 1], ["advance", "Customer advance", 1], ["other_income", "Other income", 1], ["capital_in", "Capital introduced", 1], ["loan_taken", "Loan taken", 1],
  ["expense", "Expense paid", -1], ["drawings", "Drawings", -1], ["loan_repayment", "Loan repayment", -1], ["asset_purchase", "Asset purchase", -1], ["tax_payment", "GST / tax paid", -1]];
export function DayBook() {
  const accs = sortAbc(modeAccounts(), (a) => a.name);
  const [acc, setAcc] = useState(accs[0]?.id ?? "");
  const [day, setDay] = useState(today());
  const [form, setForm] = useState<null | "in" | "out" | "transfer">(null);
  const [f, setF] = useState({ kind: "receipt" as MoneyKind, amount: 0, note: "", to: accs[1]?.id ?? "" });
  const d = daySummary(acc, day);
  const shift = (n: number) => setDay(new Date(Date.parse(day) + n * 864e5).toISOString().slice(0, 10));
  const full = can("mauny", "full");
  return (
    <Shell title="Day book" sub="Running ledger per account — opening, in, out, closing"
>
      <div class="grid gap-2 grid-cols-1 sm:grid-cols-3">
        {accs.map((a) => (
          <button key={a.id} onClick={() => setAcc(a.id)} aria-pressed={a.id === acc} class={`text-left rounded-2xl px-3 py-2 cursor-pointer border ${a.id === acc ? "bg-c0 border-c4" : "bg-c0 border-line hover:bg-c1/40"}`}>
            <div class="flex items-baseline justify-between gap-2"><span class="t-meta">{a.name}</span><span class="t-meta num">{statementSig.value.filter((l) => l.account === a.id && l.state === "review").length} to review</span></div>
          </button>
        ))}
      </div>
      <Section title="Day book" note={`${accs.length} accounts`} action={<span class="flex items-center gap-1"><button class={sm} onClick={() => shift(-1)} aria-label="Previous day">‹</button><input type="date" class={sm} value={day} onInput={(e) => setDay((e.target as HTMLInputElement).value)} /><button class={sm} onClick={() => shift(1)} aria-label="Next day">›</button></span>}>
        <div class="rounded-[var(--radius-card)] bg-c0 border border-line overflow-hidden">
          <div class="grid grid-cols-2 border-b border-line divide-x divide-line">
            {([["In", d.in], ["Out", -d.out]] as const).map(([l, v]) => <div key={l} class="px-3 py-1.5 min-w-0"><div class="t-meta">{l}</div><div class="num text-[13px] font-semibold truncate">{inr(v)}</div></div>)}
          </div>
          {full && (form ? (
            <div class="grid gap-2 grid-cols-2 md:grid-cols-[150px_150px_minmax(0,1fr)_120px_auto] items-end p-2 bg-c1/50 border-b border-line">
              {form !== "transfer" ? <Field label="Kind"><select class={inputCls} value={f.kind} onChange={(e) => setF({ ...f, kind: (e.target as HTMLSelectElement).value as MoneyKind })}>{KINDS.filter((k) => (form === "in" ? k[2] > 0 : k[2] < 0)).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
                : <Field label="To account"><select class={inputCls} value={f.to} onChange={(e) => setF({ ...f, to: (e.target as HTMLSelectElement).value })}>{accs.filter((a) => a.id !== acc).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></Field>}
              <Field label={form === "transfer" ? "From" : "Account"}><select class={inputCls} value={acc} onChange={(e) => setAcc((e.target as HTMLSelectElement).value)}>{accs.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></Field>
              <div class="col-span-2 md:col-span-1"><Field label="Note / party / invoice no."><input class={inputCls} list="mem-notes" value={f.note} onInput={(e) => { const v = (e.target as HTMLInputElement).value; const last = recall(moneySig.value.filter((m) => form === "in" ? m.amount > 0 : m.amount < 0), { note: v }); setF({ ...f, note: v, ...(last && form !== "transfer" && KINDS.some((k) => k[0] === last.kind && (form === "in" ? k[2] > 0 : k[2] < 0)) ? { kind: last.kind } : {}) }); }} /><datalist id="mem-notes">{pastValues(moneySig.value, "note").map((n) => <option key={n} value={n} />)}</datalist></Field></div>
              <Field label={form === "out" ? "Debit ₹" : "Credit ₹"}><input class={`${inputCls} num text-right`} type="number" value={f.amount || ""} onInput={(e) => setF({ ...f, amount: Number((e.target as HTMLInputElement).value) || 0 })} /></Field>
              <div class="flex gap-1.5"><Button onClick={() => { if (!f.amount) return; if (form === "transfer") transfer(acc, f.to, f.amount, day); else addMoney({ date: day, account: acc, kind: f.kind, amount: form === "in" ? f.amount : -f.amount, note: f.note }); setForm(null); setF({ ...f, amount: 0, note: "" }); }}>Save</Button><Button variant="ghost" onClick={() => setForm(null)}>Cancel</Button></div>
            </div>
          ) : (
            <div class="flex items-center gap-1 px-2 h-9 border-b border-line">
              <button class="h-7 px-2 rounded-md text-[13px] font-medium text-c3 hover:bg-c1 hover:text-c4 cursor-pointer inline-flex items-center gap-1" onClick={() => { setForm("in"); setF({ ...f, kind: "receipt" }); }}><Icon name="plus" size={12} />Money in</button>
              <button class="h-7 px-2 rounded-md text-[13px] font-medium text-c3 hover:bg-c1 hover:text-c4 cursor-pointer" onClick={() => { setForm("out"); setF({ ...f, kind: "expense" }); }}>Money out</button>
              <button class="h-7 px-2 rounded-md text-[13px] font-medium text-c3 hover:bg-c1 hover:text-c4 cursor-pointer" onClick={() => setForm("transfer")}>Transfer</button>
            </div>
          ))}
          <Ledger acc={acc} upto={day} />
        </div>
      </Section>
    </Shell>
  );
}

/** Running ledger for one account up to a day: date dividers, debit/credit split, running balance. Paged. */
function Ledger({ acc, upto }: { acc: string; upto: string }) {
  const [n, setN] = useState(30);
  const rows = vMoney().filter((m) => m.account === acc && m.date <= upto).sort((a, b) => b.date.localeCompare(a.date));
  let bal = balanceOf(acc, upto);
  const withBal = rows.slice(0, n).map((m) => { const r = { m, bal }; bal -= m.amount; return r; });
  const cols = "grid grid-cols-[minmax(0,1fr)_88px_88px] md:grid-cols-[minmax(0,1fr)_110px_96px_96px] gap-x-3 items-center px-3";
  if (!rows.length) return <p class="t-meta px-3 py-3">No entries on or before {shortDate(upto)}.</p>;
  let last = "";
  return (
    <div class="text-[13px]">
      <div class={`${cols} h-7 t-meta uppercase tracking-[0.06em]`}><span>Entry</span><span class="hidden md:block">Kind</span><span class="text-right">Debit</span><span class="text-right">Credit</span></div>
      {withBal.map(({ m }) => {
        const div = m.date !== last ? (last = m.date, <div key={`d${m.date}`} class="px-3 h-6 flex items-center bg-c1/50 border-t border-line t-meta font-semibold">{new Date(m.date).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" })}</div>) : null;
        return [div, (
          <button key={m.id} onClick={() => peek(m)} class={`${cols} w-full text-left min-h-9 py-1.5 border-t border-line hover:bg-c1/60 cursor-pointer`}>
            <span class="min-w-0 truncate font-medium">{m.note || "—"}{m.ref && <span class="t-meta ml-1.5">{m.ref}</span>}</span>
            <span class="hidden md:block t-meta truncate capitalize">{m.kind.replace("_", " ")}</span>
            <span class="num text-right">{m.amount < 0 ? inr(-m.amount) : ""}</span>
            <span class="num text-right">{m.amount > 0 ? inr(m.amount) : ""}</span>
          </button>
        )];
      })}
      {rows.length > n && <button onClick={() => setN(n + 30)} class="w-full h-9 border-t border-line t-meta hover:bg-c1/60 cursor-pointer">Load 30 more · {rows.length - n} older</button>}
    </div>
  );
}

/* ======================================================= Purchases */
export function Purchases() {
  const [f, setF] = useState("all");
  const [open, setOpen] = useState<Bill | null>(null);
  const [paidFrom, setPaidFrom] = useState("");
  const rows = vBills().filter((b) => f === "all" || b.status === f);
  const tone = (s: string) => (s === "logged" ? "done" : s === "failed" ? "blocked" : s === "rejected" ? "idle" : "waiting") as "done";
  const upd = (p: Partial<Bill>) => { if (!open) return; const n = { ...open, ...p }; setOpen(n); billsSig.value = billsSig.value.map((b) => (b.id === n.id ? n : b)); };
  const onFiles = (fl: FileList | null) => [...(fl ?? [])].forEach((file) => { if (file.type.startsWith("image/")) shrinkImage(file).then((data) => setOpen(addBill({ name: file.name, data: storeMedia(data, file.name) }))); else { const r = new FileReader(); r.onload = () => setOpen(addBill({ name: file.name, data: file.size < 8e6 ? storeMedia(String(r.result), file.name) : undefined })); r.readAsDataURL(file); } });
  const chk = open && billChecks(open);
  const num = (k: keyof Bill) => ({ class: inputCls, type: "number" as const, value: String(open?.[k] ?? ""), onInput: (e: Event) => upd({ [k]: Number((e.target as HTMLInputElement).value) || 0 } as Partial<Bill>) });
  const txt = (k: keyof Bill) => ({ class: inputCls, value: String(open?.[k] ?? ""), onInput: (e: Event) => upd({ [k]: (e.target as HTMLInputElement).value } as Partial<Bill>) });
  return (
    <Shell title="Purchases" sub="Bill vault — filed by the bill's own FY, figures confirmed by a person"
      toolbar={<Pick title="Show" value={f} on={setF} items={["all", "needs_review", "logged", "failed", "rejected"]} label={(k) => `${({ all: "All", needs_review: "To review", logged: "Logged", failed: "Unreadable", rejected: "Rejected" } as Record<string, string>)[k]} (${k === "all" ? vBills().length : vBills().filter((b) => b.status === k).length})`} />}
      detail={open && chk && (
        <div>
          <DetailHead title={`Review · ${open.vendor || "new bill"}`} onClose={() => setOpen(null)} />
          <div class="rounded-xl bg-c1 h-44 flex items-center justify-center text-xs text-c3 mb-3 overflow-hidden"><MediaFile v={open.file} alt="Bill" class="h-full object-contain" fallback="Document preview" /></div>
          <div class="grid grid-cols-2 gap-2">
            <Field label="Vendor"><input {...txt("vendor")} list="mem-vendors" onChange={(e) => { const v = (e.target as HTMLInputElement).value; const last = recall(billsSig.value, { vendor: v }, open.id); if (last) upd({ vendor: v, ...(open.gstin ? {} : { gstin: last.gstin }), cat: last.cat }); }} /><VendorList /></Field><Field label="GSTIN"><input {...txt("gstin")} placeholder="24AAA…" /></Field>
            <Field label="Bill no."><input {...txt("no")} /></Field><Field label="Date"><input {...txt("date")} type="date" /></Field>
            <Field label="Subtotal"><input {...num("subtotal")} /></Field><Field label="Tax"><input {...num("tax")} /></Field>
            <Field label="Total"><input {...num("total")} /></Field>
            <Field label="Category"><select class={inputCls} value={open.cat} onChange={(e) => upd({ cat: (e.target as HTMLSelectElement).value })}>{sortAbc(["Filament", "Resin", "Packing", "Accessories", "Spares", "Courier", "Electricity", "Utilities", "Rent", "Software", "Marketing", "Tools", "Other"]).map((c) => <option key={c}>{c}</option>)}</select></Field>
          </div>
          <div class="mt-2">
            <div class="text-xs font-semibold mb-1">Lines {/filament|packing/i.test(open.cat) && <span class="font-normal text-c3">· lines with a quantity come into stock on confirm{open.stockApplied ? ` (applied ${open.stockApplied})` : ""}</span>}</div>
            {(open.lines ?? []).map((l, i) => (
              <div key={i} class="grid grid-cols-[1fr_60px_60px_90px_28px] gap-1 mb-1">
                <input class={inputCls} value={l.desc} onInput={(e) => upd({ lines: open.lines!.map((x, k) => (k === i ? { ...x, desc: (e.target as HTMLInputElement).value } : x)) })} />
                <input class={inputCls} type="number" placeholder="Qty" value={l.qty ?? ""} onInput={(e) => upd({ lines: open.lines!.map((x, k) => (k === i ? { ...x, qty: Number((e.target as HTMLInputElement).value) || undefined } : x)) })} />
                <input class={inputCls} placeholder="Unit" value={l.unit ?? ""} onInput={(e) => upd({ lines: open.lines!.map((x, k) => (k === i ? { ...x, unit: (e.target as HTMLInputElement).value || undefined } : x)) })} />
                <input class={inputCls} type="number" value={l.amount} onInput={(e) => upd({ lines: open.lines!.map((x, k) => (k === i ? { ...x, amount: Number((e.target as HTMLInputElement).value) || 0 } : x)) })} />
                <button aria-label="Remove line" class="cursor-pointer" onClick={() => upd({ lines: open.lines!.filter((_, k) => k !== i) })}>×</button>
              </div>
            ))}
            <Button variant="outline" onClick={() => upd({ lines: [...(open.lines ?? []), { desc: "", amount: 0 }] })}>Add line</Button>
          </div>
          <div class="text-xs text-c3 mt-2">Filed in Drive → “Emerald — Purchase Documents / FY {fyOf(open.date || today())}”</div>
          {[...chk.block.map((t) => ["Blocks", t]), ...chk.warn.map((t) => ["Check", t])].map(([k, t]) => <div key={t} class={`mt-2 rounded-xl p-2 text-xs ${k === "Blocks" ? "bg-c4 text-c0" : "bg-c1"}`}><b>{k}:</b> {t}</div>)}
          {open.status !== "logged" && <>
            <Field label="Paid from"><select class={`${inputCls} mt-2`} value={paidFrom} onChange={(e) => setPaidFrom((e.target as HTMLSelectElement).value)}><option value="">Not paid yet</option>{modeAccounts().map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></Field>
            <div class="flex gap-2 mt-3"><Button variant="outline" onClick={() => { upd({ status: "rejected" }); setOpen(null); }}>Reject</Button><Button disabled={chk.block.length > 0} onClick={() => { confirmBill(open, paidFrom); setOpen(null); }}>Log expense</Button></div>
          </>}
          {open.status === "logged" && <p class="text-xs mt-3">Logged. Deleting this document would bin the file but leave its expense alone.</p>}
        </div>
      )}>
      <label class="rounded-[var(--radius-card)] border border-dashed border-c2 px-3 py-2.5 text-center t-meta cursor-pointer block hover:bg-c0">
        Drop or choose bills — PDF or photo · <b>AI reader (Claude / Gemini) connects with the backend</b>; until then figures are typed in review
        <input type="file" accept="application/pdf,image/*" multiple class="sr-only" onChange={(e) => onFiles((e.target as HTMLInputElement).files)} />
      </label>
      <div class="listbox">
        {rows.map((b) => (
          <button key={b.id} onClick={() => setOpen(b)} class="w-full text-left grid grid-cols-[minmax(0,1fr)_auto] md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_120px_100px] gap-x-3 items-center px-3 py-2 md:py-0 md:h-9 hover:bg-c1/60 cursor-pointer text-[13px]">
            <span class="min-w-0 truncate font-medium">{b.vendor || "Unnamed bill"}{b.note && <span class="t-meta ml-1.5">{b.note}</span>}</span>
            <span class="hidden md:block t-meta truncate">{b.no || "—"} · {shortDate(b.date)} · {b.cat}</span>
            <Status tone={tone(b.status)}>{b.status.replace("_", " ")}</Status>
            <span class="hidden md:block num text-right">{b.total ? inr(b.total) : "—"}</span>
          </button>
        ))}
      </div>
    </Shell>
  );
}

/* ======================================================= Finance */
export function Finance() {
  const [fy, setFy] = useState(fyOf(today()));
  const [p, setP] = useState("fy");
  const [tab, setTab] = useState<"expenses" | "outstanding" | "receipts" | "today">("today");
  const [add, setAdd] = useState(false);
  const [e, setE] = useState({ head: "Filament", vendor: "", amount: 0, tax: 0, account: "" });
  const win = windowFor(p, fy), o = vOrders();
  const f = financeSummary(win, o);
  const prevWin: [string, string] = [`${Number(win[0].slice(0, 4)) - 1}${win[0].slice(4)}`, `${Number(win[1].slice(0, 4)) - 1}${win[1].slice(4)}`];
  const ly = financeSummary(prevWin, o);
  const delta = (a: number, b: number) => (b ? `${a >= b ? "+" : ""}${Math.round(((a - b) / b) * 100)}% vs last year` : "no prior-year data");
  const mo = monthly(fy);
  const heads = new Map<string, number>(); vExpenses().filter((x) => x.date >= win[0] && x.date <= win[1]).forEach((x) => heads.set(x.head, (heads.get(x.head) ?? 0) + x.amount));
  const doToday = [
    ...invoicesSig.value.filter((i) => !i.paidOn && i.kind === "invoice" && i.status === "issued").map((i) => `Chase ${i.no} · ${i.customer} · ${inr(invTax(i).total)}`),
    ...vExpenses().filter((x) => !x.paid).map((x) => `Pay ${x.vendor} ${inr(x.amount)}${x.msme ? " (MSME — 45-day rule)" : ""}`),
    ...vBills().filter((b) => b.status === "needs_review").map((b) => `Review bill ${b.vendor || b.no}`),
  ];
  return (
    <Shell title="Finance" sub="Five figures, one rule each · everything narrows to the window"
      toolbar={<div class="flex flex-wrap items-center gap-2"><FY v={fy} on={setFy} /><Pick title="Period" value={p} on={setP} items={["mtd", "last", "qtd", "fy"]} label={(k) => ({ mtd: "MTD", last: "Last month", qtd: "QTD", fy: "Full FY" } as Record<string, string>)[k]} /></div>}
      actions={can("mauny", "full") && <Button icon="plus" onClick={() => setAdd(!add)}>Add expense</Button>}>
      {add && (
        <Card class="grid gap-2 grid-cols-2 md:grid-cols-6 items-end">
          <Field label="Head"><select class={inputCls} value={e.head} onChange={(x) => setE({ ...e, head: (x.target as HTMLSelectElement).value })}>{sortAbc(["Filament", "Packing", "Courier", "Electricity", "Utilities", "Rent", "Software", "Marketing", "Tools", "Other"]).map((h) => <option key={h}>{h}</option>)}</select></Field>
          <Field label="Vendor"><input class={inputCls} list="mem-vendors" value={e.vendor} onInput={(x) => { const v = (x.target as HTMLInputElement).value; const last = recall(vExpenses(), { vendor: v }); setE({ ...e, vendor: v, ...(last ? { head: last.head, account: last.account ?? e.account } : {}) }); }} /><VendorList /></Field>
          <Field label="Amount ₹"><input class={inputCls} type="number" value={e.amount || ""} onInput={(x) => setE({ ...e, amount: Number((x.target as HTMLInputElement).value) || 0 })} /></Field>
          <Field label="GST in it ₹"><input class={inputCls} type="number" value={e.tax || ""} onInput={(x) => setE({ ...e, tax: Number((x.target as HTMLInputElement).value) || 0 })} /></Field>
          <Field label="Paid from"><select class={inputCls} value={e.account} onChange={(x) => setE({ ...e, account: (x.target as HTMLSelectElement).value })}><option value="">Not paid yet</option>{modeAccounts().map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></Field>
          <Button onClick={() => { if (!e.amount) return; addExpense({ date: today(), head: e.head, vendor: e.vendor || e.head, amount: e.amount, tax: e.tax, paid: !!e.account, account: e.account || undefined }); setAdd(false); }}>Save</Button>
        </Card>
      )}
      <div class="strip grid grid-cols-2 xl:grid-cols-5">
        <Fig dark label="Earned" value={inr(f.earned)} note={delta(f.earned, ly.earned)} rule="Paid invoices + closed orders never invoiced" inputs={[["Paid invoices", inr(f.collected)], ["Closed, never invoiced", inr(f.closedNoInv)]]} />
        <Fig label="Collected" value={inr(f.collected)} rule="Paid invoices only" />
        <Fig label="Outstanding" value={inr(f.outstanding)} note={`${inr(f.outstandingAll)} all-time`} rule="Issued and unsettled" />
        <Fig label="Spent" value={inr(f.spent)} note={`${f.entries} entries`} rule="Structured expense entries only" />
        <Fig label="Pipeline" value={inr(f.pipeline)} rule="Open order value — never revenue" />
      </div>
      <div class="grid gap-2 lg:grid-cols-2">
        <Card><CardTitle>Earned vs spent · April-first</CardTitle><Line height={110} a={mo.map((m) => Math.round(m.earned / 1000))} b={mo.map((m) => Math.round(m.spent / 1000))} labels={mo.map((m) => m.label)} /></Card>
        <Card><CardTitle>Expenses by category (₹k)</CardTitle>{heads.size ? <Bars height={110} data={[...heads.values()].map((v) => Math.round(v / 1000))} labels={[...heads.keys()]} /> : <Empty title="No expenses in this window" />}</Card>
      </div>
      <SubTabs value={tab} onChange={setTab} items={[["today", `Do today (${doToday.length})`], ["expenses", "Expenses"], ["outstanding", "Outstanding by age"], ["receipts", "Receipts"]]} />
      <Card>
        {tab === "today" && (doToday.length ? <ul class="text-[13px] -my-1">{doToday.map((t) => <li key={t} class="min-h-9 py-1.5 flex items-center border-t border-line first:border-0 truncate">{t}</li>)}</ul> : <Empty title="Nothing to do" />)}
        {tab === "expenses" && <Table rows={[...vExpenses()].filter((x) => x.date >= win[0] && x.date <= win[1]).sort((a, b) => b.date.localeCompare(a.date))} rowKey={(x) => x.id} onRow={peek} cols={[
          { key: "h", label: "Head", render: (x) => <b>{x.head}</b> }, { key: "d", label: "Date", render: (x) => shortDate(x.date) }, { key: "v", label: "Vendor", render: (x) => x.vendor },
          { key: "p", label: "Paid", card: "status", render: (x) => <Status tone={x.paid ? "done" : "waiting"}>{x.paid ? "Paid" : "Unpaid"}</Status> },
          { key: "b", label: "Bill", render: (x) => (x.billId ? <a class="underline" href="/mauny/purchases">View</a> : "—") }, { key: "a", label: "Amount", align: "right", render: (x) => inr(x.amount) }]} />}
        {tab === "outstanding" && <Table rows={invoicesSig.value.filter((i) => !i.paidOn && i.kind === "invoice" && i.status === "issued").map((i) => ({ ...i, age: Math.round((Date.now() - Date.parse(i.date)) / 864e5) })).sort((a, b) => b.age - a.age)} rowKey={(i) => i.id} onRow={peek} cols={[
          { key: "n", label: "Invoice", render: (i) => <b>{i.no}</b> }, { key: "c", label: "Customer", render: (i) => i.customer },
          { key: "a", label: "Age", card: "status", render: (i) => <Status tone={i.age > 75 ? "blocked" : "waiting"}>{i.age} days</Status> }, { key: "v", label: "Total", align: "right", render: (i) => inr(invTax(i).total) }]} />}
        {tab === "receipts" && <Table rows={vMoney().filter((m) => m.kind === "receipt" || m.kind === "advance")} rowKey={(m) => m.id} onRow={peek} cols={[
          { key: "n", label: "From", render: (m) => <b>{m.note}</b> }, { key: "r", label: "Against", render: (m) => m.ref ?? "—" }, { key: "d", label: "Date", render: (m) => shortDate(m.date) }, { key: "v", label: "Amount", align: "right", render: (m) => inr(m.amount) }]} />}
      </Card>
    </Shell>
  );
}

/* ======================================================= Goals */
export function Goals() {
  const [arch, setArch] = useState(false);
  const [edit, setEdit] = useState<Goal | null>(null);
  const list = goalsSig.value.filter((g) => g.archived === arch);
  const save = (g: Goal) => { goalsSig.value = goalsSig.value.some((x) => x.id === g.id) ? goalsSig.value.map((x) => (x.id === g.id ? g : x)) : [...goalsSig.value, g]; setEdit(null); };
  const money = (m: GoalMetric) => ["revenue", "collection", "profit", "expense_cap"].includes(m);
  return (
    <Shell title="Goals" sub="A number and a window — measured off the ledger, never stored"
      actions={<Button icon="plus" onClick={() => setEdit({ id: uid(), title: "", metric: "revenue", start: today().slice(0, 8) + "01", end: today(), period: "This month", target: 100000, note: "", archived: false })}>New goal</Button>}
      toolbar={<div class="inline-flex gap-0.5 p-0.5 rounded-lg bg-c1"><Chip active={!arch} onClick={() => setArch(false)}>Active</Chip><Chip active={arch} onClick={() => setArch(true)}>Archived</Chip></div>}
      detail={edit && (
        <div>
          <DetailHead title={edit.title || "New goal"} onClose={() => setEdit(null)} />
          <div class="flex flex-col gap-2">
            <Field label="Title"><input class={inputCls} value={edit.title} onInput={(e) => setEdit({ ...edit, title: (e.target as HTMLInputElement).value })} /></Field>
            <Field label="Metric"><select class={inputCls} value={edit.metric} onChange={(e) => setEdit({ ...edit, metric: (e.target as HTMLSelectElement).value as GoalMetric })}>{(Object.keys(GOAL_LABEL) as GoalMetric[]).map((m) => <option key={m} value={m}>{GOAL_LABEL[m]}</option>)}</select></Field>
            <Field label="Target"><input class={inputCls} type="number" value={edit.target} onInput={(e) => setEdit({ ...edit, target: Number((e.target as HTMLInputElement).value) || 0 })} /></Field>
            <div class="grid grid-cols-2 gap-2"><Field label="From"><input class={inputCls} type="date" value={edit.start} onInput={(e) => setEdit({ ...edit, start: (e.target as HTMLInputElement).value })} /></Field><Field label="To"><input class={inputCls} type="date" value={edit.end} onInput={(e) => setEdit({ ...edit, end: (e.target as HTMLInputElement).value })} /></Field></div>
            <Field label="Period name"><input class={inputCls} value={edit.period} placeholder="Q3 · Oct–Dec" onInput={(e) => setEdit({ ...edit, period: (e.target as HTMLInputElement).value })} /></Field>
            {edit.metric === "custom" && <Field label="Current value (by hand)"><input class={inputCls} type="number" value={edit.manual ?? 0} onInput={(e) => setEdit({ ...edit, manual: Number((e.target as HTMLInputElement).value) || 0 })} /></Field>}
            <Field label="Note"><input class={inputCls} value={edit.note} onInput={(e) => setEdit({ ...edit, note: (e.target as HTMLInputElement).value })} /></Field>
            <Button onClick={() => save(edit)}>Save goal</Button>
          </div>
        </div>
      )}>
      {!list.length ? <Empty title={arch ? "No archived goals" : "No active goals"} /> : (
        <div class="listbox">
          {list.map((g) => {
            const p = goalProgress(g, vOrders());
            const fmt = (n: number) => (money(g.metric) ? inr(n) : g.metric === "margin_pct" ? `${n}%` : String(n));
            return (
              <div key={g.id} class="grid grid-cols-[minmax(0,1fr)_auto] lg:grid-cols-[minmax(0,1.4fr)_minmax(140px,1fr)_minmax(0,170px)_110px_auto] gap-x-4 gap-y-1 items-center px-3 py-2 text-[13px]">
                <span class="min-w-0"><span class="block font-medium truncate">{g.title}</span><span class="block t-meta truncate">{GOAL_LABEL[g.metric]} · {g.period}{g.metric === "custom" ? " · by hand" : ""}{g.note ? ` · “${g.note}”` : ""}</span></span>
                <span class="relative block col-span-2 lg:col-span-1 order-last lg:order-none">
                  <span class="block h-1 rounded-full bg-c1 overflow-hidden"><span class={`block h-full rounded-full ${p.behind ? "bg-warn" : "bg-c4"}`} style={{ width: `${Math.min(100, p.pct)}%` }} /></span>
                  <span class="absolute -top-1 h-3 w-px bg-c3" style={{ left: `${Math.min(100, p.pace)}%` }} title="Where today sits in the window" />
                </span>
                <span class="hidden lg:block num text-right">{fmt(p.value)} <span class="t-meta">of {fmt(g.target)} · {p.pct}%</span></span>
                <span class="text-[11px] font-semibold whitespace-nowrap">{p.behind ? <span class="inline-flex items-center gap-1"><span class="w-1.5 h-1.5 rounded-full bg-warn" />{g.metric === "expense_cap" ? "Over pace" : "Behind pace"}</span> : <span class="text-c3">On track</span>}</span>
                <span class="hidden lg:flex gap-1 justify-end"><Button variant="ghost" class="!h-7 !px-2" onClick={() => setEdit(g)}>Edit</Button><Button variant="ghost" class="!h-7 !px-2" onClick={() => save({ ...g, archived: !g.archived })}>{g.archived ? "Restore" : "Archive"}</Button></span>
              </div>
            );
          })}
        </div>
      )}
    </Shell>
  );
}

/* ======================================================= Accounts & statements */
export function Accounts() {
  const [acc, setAcc] = useState(modeAccounts()[0]?.id ?? "");
  const [msg, setMsg] = useState("");
  const [f, setF] = useState("review");
  const lines = statementSig.value.filter((l) => l.account === acc && (f === "all" || l.state === f));
  const onFile = (fl: FileList | null) => { const file = fl?.[0]; if (!file) return; if (!/\.csv$/i.test(file.name)) { setMsg("PDF/XLSX statements (incl. password-protected) are read by the server — upload CSV for now."); return; }
    file.text().then((t) => { const r = parseStatementCsv(t, acc); setMsg(`${r.added} lines imported · ${r.dup} duplicates skipped`); }); };
  return (
    <Shell title="Mauny settings" sub="CSV columns: date, narration, debit, credit (or a signed amount). Matching: unpaid invoice by exact amount or net of 1%/2% TDS, then customer name, then unpaid expense."
      actions={<><Button variant="outline" onClick={() => { const name = prompt("Account name"); if (name) accountsSig.value = [...accountsSig.value, { id: uid(), name, opening: Number(prompt("Opening balance ₹") || 0) }]; }}>Add account</Button>
        <label class="inline-flex items-center justify-center h-9 md:h-10 px-4 rounded-full bg-c4 text-c0 text-sm font-medium cursor-pointer">Upload CSV statement<input id="mauny-statement" type="file" accept=".csv,.pdf,.xlsx" class="sr-only" onChange={(e) => onFile((e.target as HTMLInputElement).files)} /></label></>}
      toolbar={<div class="flex flex-wrap gap-2 items-center"><SubTabs value={acc} onChange={setAcc} items={modeAccounts().map((a) => [a.id, a.name] as [string, string])} /><Pick title="Lines" value={f} on={setF} items={["review", "confirmed", "rejected", "all"]} label={(s) => s} /></div>}>
      {msg && <p class="text-sm font-medium" role="status">{msg}</p>}
      <div class="grid gap-2 grid-cols-1 sm:grid-cols-3">
        {modeAccounts().map((a) => <button key={a.id} onClick={() => setAcc(a.id)} aria-pressed={a.id === acc} class={`text-left rounded-2xl px-3 py-2 cursor-pointer bg-c0 border ${a.id === acc ? "border-c4" : "border-line hover:bg-c1/40"}`}><div class="t-meta">{a.name}</div><div class="t-meta num">{statementSig.value.filter((l) => l.account === a.id && l.state === "review").length} lines to review</div></button>)}
      </div>
      <Card class="!py-1">
        {lines.length ? <Table rows={lines} rowKey={(l) => l.id} onRow={peek} cols={[
          { key: "t", label: "Narration", render: (l) => <b>{l.text}</b> }, { key: "d", label: "Date", render: (l) => shortDate(l.date) },
          { key: "a", label: "Amount", align: "right", render: (l) => inr(l.amount) }, { key: "g", label: "Suggested", render: (l) => l.match ?? suggest(l) },
          { key: "s", label: "", render: (l) => (l.state === "review" ? <span class="flex gap-1"><Button variant="outline" onClick={() => confirmLine(l)}>Confirm</Button><Button variant="ghost" onClick={() => rejectLine(l)}>Reject</Button></span> : <Status tone={l.state === "confirmed" ? "done" : "idle"}>{l.state}</Status>) },
        ]} /> : <Empty title="No lines here" />}
      </Card>
    </Shell>
  );
}

/* ======================================================= Books */
const BOOK_TABS: [string, string][] = [["sales", "Sales Book"], ["purchase", "Purchase Book"], ["debtors", "Debtors"], ["creditors", "Creditors"], ["bank", "Bank Book"], ["expense", "Expense Book"],
  ["capital", "Capital & Loans"], ["assets", "Fixed Assets"], ["pl", "P&L"], ["bs", "Balance Sheet"], ["cf", "Cash flow"], ["msme", "MSME"], ["parties", "Parties"], ["opening", "Opening balances"]];
export function Books() {
  const [t, setT] = useState("sales");
  const [fy, setFy] = useState(fyOf(today()));
  const [acc, setAcc] = useState(modeAccounts()[0]?.id ?? "");
  const B = books(fy);
  const tax = [{ key: "n", label: "No.", render: (r: any) => <b>{r.no}{r.status === "cancelled" ? " (cancelled)" : ""}</b> }, { key: "d", label: "Date", render: (r: any) => shortDate(r.date) }, { key: "p", label: "Party", render: (r: any) => r.party },
    { key: "t", label: "Taxable", align: "right" as const, render: (r: any) => inr(r.taxable) }, { key: "c", label: "CGST", align: "right" as const, render: (r: any) => inr(r.cgst), hideTablet: true },
    { key: "s", label: "SGST", align: "right" as const, render: (r: any) => inr(r.sgst), hideTablet: true }, { key: "i", label: "IGST", align: "right" as const, render: (r: any) => inr(r.igst), hideTablet: true },
    { key: "v", label: "Total", align: "right" as const, render: (r: any) => inr(r.total) }];
  const Row = ({ l, v, b }: { l: string; v: number; b?: boolean }) => <div class={`flex justify-between py-1.5 border-t border-line text-sm ${b ? "font-semibold" : ""}`}><span>{l}</span><span class="num">{inr(v)}</span></div>;
  let running = modeAccounts().find((a) => a.id === acc)?.opening ?? 0;
  const bank = [...vMoney()].filter((m) => m.account === acc).sort((a, b) => a.date.localeCompare(b.date)).map((m) => ({ ...m, bal: (running += m.amount) }));
  const pack = () => {
    download(`Emerald-CA-pack-FY${fy}-sales.csv`, csv(B.sales.map(({ id, ...r }) => r)), "text/csv");
    download(`Emerald-CA-pack-FY${fy}-purchases.csv`, csv(B.purchase.map(({ id, ...r }) => r)), "text/csv");
    download(`Emerald-CA-pack-FY${fy}-expenses.csv`, csv(expensesSig.value.map(({ id, ...r }) => r)), "text/csv");
    download(`Emerald-FY${fy}-tally.xml`, tallyXml(fy), "application/xml");
  };
  return (
    <Shell title="Books" sub="Double-entry view derived from invoices, bills and Mauny — never retyped"
      actions={<><Button variant="outline" onClick={() => download(`Emerald-FY${fy}-tally.xml`, tallyXml(fy), "application/xml")}>Tally XML</Button><Button variant="outline" onClick={() => window.print()}>Print</Button><Button onClick={pack}>Year-end pack</Button></>}
      toolbar={<div class="flex flex-wrap items-center gap-2"><FY v={fy} on={setFy} /><SubTabs value={t} onChange={setT} items={BOOK_TABS} /></div>}>
      {B.bs.suspense !== 0 && t === "bs" && <div class="rounded-xl bg-c1 p-2.5 text-xs">Suspense {inr(B.bs.suspense)} — opening balances not fully compiled; visible and wrong in a way somebody will fix, never hidden.</div>}
      <Card>
        {t === "sales" && <Table rows={B.sales} rowKey={(r) => r.id} onRow={peek} cols={tax} />}
        {t === "purchase" && <Table rows={B.purchase} rowKey={(r) => r.id} onRow={peek} cols={tax} />}
        {t === "debtors" && <Table rows={B.debtors} rowKey={(r) => r.id} onRow={peek} cols={[{ key: "p", label: "Party", render: (r) => <b>{r.party}</b> }, { key: "a", label: "0–30", align: "right", render: (r) => inr(r.b0) }, { key: "b", label: "31–60", align: "right", render: (r) => inr(r.b30) }, { key: "c", label: "61–90", align: "right", render: (r) => inr(r.b60) }, { key: "d", label: "90+", align: "right", render: (r) => inr(r.b90) }, { key: "t", label: "Total", align: "right", render: (r) => inr(r.total) }]} />}
        {t === "creditors" && <Table rows={B.creditors} rowKey={(r) => r.id} onRow={peek} cols={[{ key: "p", label: "Party", render: (r) => <b>{r.party}</b> }, { key: "m", label: "MSME", render: (r) => r.msme }, { key: "d", label: "Pay by", render: (r) => (r.due ? shortDate(r.due) : "—") }, { key: "h", label: "43B(h)", render: (r) => (r.h ? <Status tone="blocked">Disallowed if unpaid</Status> : r.msme !== "—" ? <Status tone="waiting">Watch</Status> : "—") }, { key: "t", label: "Owed", align: "right", render: (r) => inr(r.total) }]} />}
        {t === "bank" && <><div class="mb-2"><SubTabs value={acc} onChange={setAcc} items={modeAccounts().map((a) => [a.id, a.name] as [string, string])} /></div><Table rows={bank} rowKey={(r) => r.id} onRow={peek} cols={[{ key: "t", label: "Particulars", render: (r) => <b>{r.note}</b> }, { key: "d", label: "Date", render: (r) => shortDate(r.date) }, { key: "r", label: "Receipt", align: "right", render: (r) => (r.amount > 0 ? inr(r.amount) : "—") }, { key: "p", label: "Payment", align: "right", render: (r) => (r.amount < 0 ? inr(-r.amount) : "—") }]} /></>}
        {t === "expense" && <><Table rows={B.heads} rowKey={(r) => r.id} onRow={peek} cols={[{ key: "h", label: "Head", render: (r) => <b>{r.head}</b> }, { key: "a", label: "FY", align: "right", render: (r) => inr(r.amount) }]} />
          <h3 class="font-semibold text-sm mt-4 mb-1">Wastage log</h3><Table rows={consSig.value.filter((c) => c.kind === "scrap")} rowKey={(c) => c.id} onRow={peek} cols={[{ key: "i", label: "Scrap", render: (c) => <b>{c.item}</b> }, { key: "o", label: "Order", render: (c) => c.orderNo ?? "—" }, { key: "q", label: "Grams", align: "right", render: (c) => c.qty }, { key: "v", label: "Cost", align: "right", render: (c) => inr(c.cost) }]} /></>}
        {t === "capital" && <><Table rows={vMoney().filter((m) => ["capital_in", "drawings"].includes(m.kind))} rowKey={(r) => r.id} onRow={peek} cols={[{ key: "t", label: "Entry", render: (r) => <b>{r.note}</b> }, { key: "d", label: "Date", render: (r) => shortDate(r.date) }, { key: "a", label: "Amount", align: "right", render: (r) => inr(r.amount) }]} />
          <h3 class="font-semibold text-sm mt-4 mb-1">Loans</h3>{loansSig.value.length ? <Table rows={loansSig.value} rowKey={(l) => l.id} onRow={peek} cols={[{ key: "l", label: "Lender", render: (l) => <b>{l.lender}</b> }, { key: "p", label: "Principal", align: "right", render: (l) => inr(l.principal) }, { key: "o", label: "Outstanding", align: "right", render: (l) => inr(l.principal - l.repaid) }, { key: "i", label: "Interest/yr", align: "right", render: (l) => inr((l.principal - l.repaid) * l.rate / 100) }]} /> : <p class="text-xs text-c3">No loans — printers were bought outright. A "Loan taken" entry in Mauny creates one here.</p>}</>}
        {t === "assets" && <Table rows={B.deps} rowKey={(r) => r.id} onRow={peek} cols={[{ key: "n", label: "Asset", render: (r) => <b>{r.name}</b> }, { key: "m", label: "Machine", render: (r) => r.machine }, { key: "b", label: "IT block", render: (r) => `${r.block} ${r.blockRate}%`, hideTablet: true }, { key: "c", label: "Cost", align: "right", render: (r) => inr(r.cost) }, { key: "o", label: "Opening WDV", align: "right", render: (r) => inr(r.open), hideTablet: true }, { key: "d", label: "Dep. FY", align: "right", render: (r) => inr(r.dep) }, { key: "w", label: "Closing WDV", align: "right", render: (r) => inr(r.wdv) }]} />}
        {t === "pl" && <div class="grid gap-x-8 md:grid-cols-2"><div><div class="text-xs font-semibold text-c3 mb-1">Trading account</div><Row l="Sales (net of credit notes)" v={B.pl.salesTot} /><Row l="Opening stock" v={-B.pl.opening} /><Row l="Direct purchases" v={-B.pl.direct} /><Row l="Closing stock" v={B.pl.closing} /><Row l="Gross profit" v={B.pl.gross} b /></div><div><div class="text-xs font-semibold text-c3 mb-1">Profit & loss</div><Row l="Gross profit" v={B.pl.gross} /><Row l="Indirect expenses" v={-B.pl.indirect} /><Row l="Depreciation" v={-B.pl.depTot} /><Row l="Interest" v={-B.pl.interest} /><Row l="Net profit" v={B.pl.net} b /></div></div>}
        {t === "bs" && <div class="grid gap-x-8 md:grid-cols-2"><div><div class="text-xs font-semibold text-c3 mb-1">Liabilities</div><Row l="Capital (incl. profit)" v={B.bs.capital} /><Row l="Loans" v={B.bs.loansOut} /><Row l="Creditors" v={B.bs.creditorsTot} /><Row l="Suspense" v={B.bs.suspense} /><Row l="Total" v={B.bs.total} b /></div><div><div class="text-xs font-semibold text-c3 mb-1">Assets</div><Row l="Fixed assets (WDV)" v={B.bs.fixed} /><Row l="Closing stock" v={B.bs.stock} /><Row l="Debtors" v={B.bs.debtorsTot} /><Row l="Bank + cash" v={B.bs.cash} /><Row l="Total" v={B.bs.total} b /></div></div>}
        {t === "cf" && <div class="max-w-lg"><Row l="Operating (receipts − expenses)" v={B.cashflow.operating} /><Row l="Investing (assets)" v={B.cashflow.investing} /><Row l="Financing (capital, drawings, loans)" v={B.cashflow.financing} /><Row l="Net change in cash" v={B.cashflow.operating + B.cashflow.investing + B.cashflow.financing} b /><p class="text-xs text-c3 mt-2">Direct method from Mauny entries. Transfers between own accounts cancel out.</p></div>}
        {t === "msme" && <Table rows={B.creditors.filter((c) => c.msme !== "—")} rowKey={(r) => r.id} onRow={peek} cols={[{ key: "p", label: "Supplier", render: (r) => <b>{r.party}</b> }, { key: "c", label: "Class", render: (r) => r.msme }, { key: "d", label: "Bill date", render: (r) => shortDate(r.date) }, { key: "x", label: "S.15 deadline (45 d)", render: (r) => shortDate(r.due) }, { key: "l", label: "Days left", align: "right", render: (r) => r.left }, { key: "a", label: "Owed", align: "right", render: (r) => inr(r.total) }]} />}
        {t === "parties" && <><Table rows={parties()} rowKey={(r) => r.id} onRow={peek} cols={[{ key: "n", label: "Party", render: (r) => <b>{r.name}</b> }, { key: "t", label: "Type", render: (r) => r.type }, { key: "g", label: "GSTIN", render: (r) => r.gstin || "—" }, { key: "b", label: "Balance", align: "right", render: (r) => inr(r.bal) }]} /></>}
        {t === "opening" && <div class="grid gap-3 sm:grid-cols-3">
          {([["capital", "Opening capital"], ["stock", "Opening stock"], ["closingStock", "Closing stock (valued)"]] as const).map(([k, l]) => <Field key={k} label={l}><input class={inputCls} type="number" value={openingSig.value[k]} onInput={(e) => (openingSig.value = { ...openingSig.value, [k]: Number((e.target as HTMLInputElement).value) || 0 })} /></Field>)}
          {accountsSig.value.map((a) => <Field key={a.id} label={`Opening · ${a.name}`}><input class={inputCls} type="number" value={a.opening} onInput={(e) => (accountsSig.value = accountsSig.value.map((x) => (x.id === a.id ? { ...x, opening: Number((e.target as HTMLInputElement).value) || 0 } : x)))} /></Field>)}
        </div>}
      </Card>
    </Shell>
  );
}

/* ======================================================= GST desk (CA has this page only) */
export function Gst() {
  const [fy, setFy] = useState(fyOf(today()));
  const [open, setOpen] = useState<string | null>(null);
  const [tab, setTab] = useState<"b2b" | "b2c" | "cn" | "purch">("b2b");
  const months = gstMonths(fy);
  const m = months.find((x) => x.k === open);
  const full = can("gst", "full");
  const monthPack = (k: string) => { const mm = months.find((x) => x.k === k)!;
    download(`GST-${k}-sales.csv`, csv(mm.inv.map((i) => ({ no: i.no, date: i.date, customer: i.customer, gstin: i.gstin ?? "", kind: i.kind, status: i.status, hsn: i.lines.map((l) => l.hsn).join("|"), ...invTax(i) }))), "text/csv");
    download(`GST-${k}-purchases.csv`, csv(mm.purch.map((b) => ({ vendor: b.vendor, gstin: b.gstin ?? "", no: b.no, date: b.date, taxable: b.subtotal, tax: b.tax, total: b.total }))), "text/csv"); };
  return (
    <Shell title="GST desk" sub={isExternal() ? "CA access — invoices, credit notes and purchase bills by month" : "Monthly view · GSTR-1 / 3B · print · pack · lock when filed"} toolbar={<FY v={fy} on={setFy} />}
      detail={m && (
        <div>
          <DetailHead title={`GST · ${m.label}`} onClose={() => setOpen(null)} />
          <div class="grid grid-cols-2 gap-2 text-sm mb-3"><Fact label="Taxable" value={inr(m.taxable)} /><Fact label="Output tax" value={inr(m.cgst + m.sgst + m.igst)} /><Fact label="ITC" value={inr(m.itc)} /><Fact label="Net payable" value={inr(m.cgst + m.sgst + m.igst - m.itc)} /></div>
          <SubTabs value={tab} onChange={setTab} items={[["b2b", `B2B (${m.b2b})`], ["b2c", `B2C (${m.b2c})`], ["cn", `Credit notes (${m.credits})`], ["purch", `Purchases (${m.purch.length})`]]} />
          <ul class="text-xs mt-2">
            {(tab === "purch" ? m.purch.map((b) => ({ k: b.id, a: `${b.vendor} · ${b.no}`, b: inr(b.tax), c: inr(b.total) }))
              : m.inv.filter((i) => (tab === "cn" ? i.kind === "credit" : i.kind === "invoice" && (tab === "b2b" ? !!i.gstin : !i.gstin))).map((i) => ({ k: i.id, a: `${i.no} · ${i.customer}${i.gstin ? " · " + i.gstin : ""}${i.status === "cancelled" ? " (cancelled)" : ""}`, b: inr(invTax(i).cgst + invTax(i).sgst + invTax(i).igst), c: inr(invTax(i).total) })))
              .map((r) => <li key={r.k} class="flex justify-between gap-2 py-1.5 border-t border-line"><span>{r.a}</span><span class="num whitespace-nowrap">{r.b} · {r.c}</span></li>)}
          </ul>
          <div class="flex flex-wrap gap-2 mt-3">
            <Button variant="outline" onClick={() => monthPack(m.k)}>Month pack</Button><Button variant="outline" onClick={() => window.print()}>Print</Button>
            {full && !m.filed.locked && <Button onClick={() => setGst(m.k, { r1: true, r3b: true, locked: true })}>Mark filed & lock</Button>}
            {full && m.filed.locked && !isExternal() && <Button variant="ghost" onClick={() => setGst(m.k, { locked: false })}>Unlock</Button>}
          </div>
          
        </div>
      )}>
      <div class="strip grid grid-cols-3">
        <Stat value={inr(months.reduce((s, x) => s + x.cgst + x.sgst + x.igst, 0))} label="Output GST" />
        <Stat value={inr(months.reduce((s, x) => s + x.itc, 0))} label="Input credit" />
        <Stat value={inr(months.reduce((s, x) => s + x.cgst + x.sgst + x.igst - x.itc, 0))} label="Net payable" />
      </div>
      <Card class="!py-1">
        <Table rows={months} rowKey={(r) => r.k} onRow={(r) => setOpen(r.k)} cols={[
          { key: "m", label: "Month", render: (r) => <b>{r.label}</b> },
          { key: "s", label: "Taxable", align: "right", render: (r) => inr(r.taxable) },
          { key: "o", label: "Output", align: "right", render: (r) => inr(r.cgst + r.sgst + r.igst) },
          { key: "i", label: "ITC", align: "right", render: (r) => inr(r.itc), hideTablet: true },
          { key: "n", label: "Docs", render: (r) => `${r.b2b} B2B · ${r.b2c} B2C · ${r.credits} CN`, hideTablet: true },
          { key: "f", label: "Status", card: "status", render: (r) => <Status tone={r.filed.locked ? "done" : r.inv.length ? "waiting" : "idle"}>{r.filed.locked ? "Filed · locked" : r.inv.length ? "Open" : "No activity"}</Status> },
        ]} />
      </Card>
    </Shell>
  );
}

/* ======================================================= Reports */
/** Blueprint 14: where work comes from and what keeps going wrong. Everything derived on view; every row links to its record. */
const med = (xs: number[]) => { if (!xs.length) return 0; const v = [...xs].sort((a, b) => a - b), m = Math.floor(v.length / 2); return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2; };
const NoData = ({ what }: { what: string }) => <p class="text-sm text-c3 py-2">{what}</p>;
export function Reports() {
  const [fy, setFy] = useState(fyOf(today()));
  const [tab, setTab] = useState("funnel");
  const win = fyWindow(fy), inFy = (d: string) => inWin(d, win);
  const fyLabel = `FY ${fy}`;
  const orders = vOrders().filter((x) => inFy(x.created));
  const quotes = vQuotes().filter((x) => inFy(x.date));
  const qVal = (q: (typeof quotes)[number]) => q.lines.reduce((s, l) => s + l.qty * l.rate, 0);
  const val = (x: (typeof orders)[number]) => x.items.reduce((s, i) => s + i.qty * i.price, 0);
  const cost = (x: (typeof orders)[number]) => x.items.reduce((s, i) => s + i.qty * i.cost, 0);
  const actual = (no: string) => consSig.value.filter((c) => c.orderNo === no).reduce((s, c) => s + c.cost, 0);

  /* Funnel — quotations by outcome; unknown outcomes are their own band, never "lost". */
  const band = (o: string) => quotes.filter((q) => q.outcome === o);
  const approved = band("approved"), qTot = quotes.reduce((s, q) => s + qVal(q), 0), aTot = approved.reduce((s, q) => s + qVal(q), 0);
  const archived = orders.filter((x) => x.stage === "archived");
  const funnel: [string, number, number | null, string][] = [
    ["Quoted", quotes.length, qTot, "/work/quotes"], ["Approved", approved.length, aTot, "/work/quotes"], ["Open (awaiting answer)", band("open").length, band("open").reduce((s, q) => s + qVal(q), 0), "/work/quotes"],
    ["Lost", band("lost").length, band("lost").reduce((s, q) => s + qVal(q), 0), "/work/quotes"], ["Outcome unrecorded", band("unrecorded").length, band("unrecorded").reduce((s, q) => s + qVal(q), 0), "/work/quotes"],
    ["In production", orders.filter((x) => x.stage === "production").length, null, "/work/production"], ["Archived", archived.length, archived.reduce((s, x) => s + val(x), 0), "/work/archive"]];

  /* Channels — sorted by rate, margin shown; volume is not the insight. */
  const channels = [...new Set(orders.filter((x) => x.type !== "inhouse").map((x) => x.medium || "Unknown"))].map((m) => {
    const l = orders.filter((x) => x.type !== "inhouse" && (x.medium || "Unknown") === m), won = l.filter((x) => x.approved || x.stage !== "quotation");
    const v = won.reduce((s, x) => s + val(x), 0), c = won.reduce((s, x) => s + (actual(x.no) || cost(x)), 0);
    return { id: m, m, quotes: l.length, won: won.length, rate: Math.round((won.length / l.length) * 100), value: v, margin: v && c ? Math.round((1 - c / v) * 100) : null };
  }).sort((a, b) => b.rate - a.rate || (b.margin ?? -1) - (a.margin ?? -1));

  /* Quality — failure by machine and material, defect Pareto by count and cost, improvement notes. */
  const jobs = jobsSig.value.filter((j) => j.status === "done" || j.status === "failed");
  const rateBy = (key: (j: (typeof jobs)[number]) => string) => [...new Set(jobs.map(key))].map((k) => { const l = jobs.filter((j) => key(j) === k), f = l.filter((j) => j.status === "failed").length; return { id: k, k, jobs: l.length, failed: f, pct: Math.round((f / l.length) * 100) }; }).sort((a, b) => b.pct - a.pct);
  const floor = jobs.length ? Math.round((jobs.filter((j) => j.status === "failed").length / jobs.length) * 100) : 0;
  const matOf = (j: (typeof jobs)[number]) => vOrders().find((o) => o.no === j.orderNo)?.items.find((i) => i.name === j.item)?.material ?? "Unknown";
  const byMachine = rateBy((j) => j.printer || "—"), byMaterial = rateBy(matOf);
  const qc = qcSig.value.filter((x) => inFy(x.date));
  const perG = rate("pla") / 1000;
  const defects = [...new Set(qc.filter((x) => x.result !== "pass" || x.defect).map((x) => x.defect || "Untagged"))].map((d) => { const l = qc.filter((x) => (x.defect || "Untagged") === d && (x.result !== "pass" || x.defect)); const g = l.reduce((s, x) => s + x.grams, 0); return { id: d, d, n: l.length, g, cost: Math.round(g * perG) }; });
  const notes = qc.filter((x) => x.note);

  /* Costs — estimate vs logged consumption, by line and by order kind. */
  const logged = archived.filter((x) => actual(x.no) > 0);
  const kinds = ["filament", "machine", "power", "labour", "packing", "accessory", "part", "freight", "scrap"];
  const byLine = kinds.map((k) => ({ id: k, k, v: consSig.value.filter((c) => c.kind === k && logged.some((o) => o.no === c.orderNo)).reduce((s, c) => s + c.cost, 0) })).filter((r) => r.v);
  const byKind = (["client", "bulk", "inhouse"] as const).map((t) => { const l = logged.filter((x) => x.type === t), e = l.reduce((s, x) => s + cost(x), 0), a = l.reduce((s, x) => s + actual(x.no), 0); return { id: t, t, n: l.length, e, a, drift: e ? Math.round(((a - e) / e) * 100) : 0 }; }).filter((r) => r.n);

  /* Cycle time — median days in each stage from stage history; outliers listed. */
  const hist = historySig.value;
  const spans: { stage: string; order: string; days: number }[] = [];
  for (const no of new Set(hist.map((h) => h.orderNo))) {
    const h = hist.filter((x) => x.orderNo === no).sort((a, b) => a.at.localeCompare(b.at));
    h.forEach((m, i) => { const next = h[i + 1]; if (next) spans.push({ stage: m.to, order: no, days: daysBetween(m.at.slice(0, 10), next.at.slice(0, 10)) }); });
  }
  const cycle = STAGE_ORDER.filter((s) => s !== "archived").map((s) => { const d = spans.filter((x) => x.stage === s).map((x) => x.days); const m = med(d); return { id: s, s, n: d.length, m, out: spans.filter((x) => x.stage === s && x.days > Math.max(3, m * 2)) }; }).filter((r) => r.n);

  const exportCsv = () => download(`Emerald-reports-FY${fy}-${tab}.csv`, csv(tab === "funnel" ? funnel.map(([l, n, v]) => ({ band: l, count: n, value: v ?? "" })) : tab === "channels" ? channels : tab === "quality" ? [...byMachine.map((r) => ({ by: "machine", ...r })), ...byMaterial.map((r) => ({ by: "material", ...r })), ...defects.map((r) => ({ by: "defect", ...r }))] : tab === "costs" ? byKind : cycle.map(({ out: _o, ...r }) => r)), "text/csv");
  const link = (href: string, children: ComponentChildren) => <a href={href} class="block hover:underline">{children}</a>;
  return (
    <Shell title="Reports & analytics" sub="Where work comes from and what keeps going wrong · derived on view, never stored"
      actions={<Button variant="outline" onClick={exportCsv}>Export CSV</Button>}
      toolbar={<div class="flex flex-wrap items-center gap-2"><FY v={fy} on={setFy} /><SubTabs value={tab} onChange={setTab} items={[["funnel", "Funnel"], ["channels", "Channels"], ["quality", "Quality"], ["costs", "Costs"], ["cycle", "Cycle time"]]} /></div>}>
      {tab === "funnel" && <Card><CardTitle>Quotation funnel · {fyLabel}</CardTitle>
        {!quotes.length ? <NoData what={`No quotations in ${fyLabel} yet.`} /> : <>
          <ul class="text-sm flex flex-col gap-2">{funnel.map(([l, n, v, href]) => <li key={l}>{link(href, <><div class="flex justify-between gap-2"><span>{l}</span><span class="num">{n}{v != null ? ` · ${inr(v)}` : ""}</span></div><Progress value={(n / Math.max(1, quotes.length)) * 100} /></>)}</li>)}</ul>
          <div class="grid grid-cols-2 gap-2 mt-3"><Fact label="Conversion by count" value={`${Math.round((approved.length / quotes.length) * 100)}%`} /><Fact label="Conversion by value" value={`${qTot ? Math.round((aTot / qTot) * 100) : 0}%`} /></div>
        </>}</Card>}
      {tab === "channels" && <Card><CardTitle>Channel attribution · sorted by rate, then margin</CardTitle>
        {!channels.length ? <NoData what={`No client orders in ${fyLabel} yet.`} /> :
          <Table rows={channels} rowKey={(x) => x.id} onRow={peek} cols={[{ key: "c", label: "Channel", render: (x) => <b>{x.m}</b> }, { key: "q", label: "Orders", align: "right", render: (x) => x.quotes }, { key: "w", label: "Won", align: "right", render: (x) => x.won }, { key: "r", label: "Rate", align: "right", render: (x) => `${x.rate}%` }, { key: "v", label: "Value won", align: "right", render: (x) => inr(x.value) }, { key: "m", label: "Margin", align: "right", render: (x) => (x.margin == null ? "—" : `${x.margin}%`) }]} />}</Card>}
      {tab === "quality" && <div class="grid gap-2 lg:grid-cols-2">
        <Card><CardTitle>Failure rate by machine · floor {floor}%</CardTitle>{!byMachine.length ? <NoData what="No finished print jobs yet." /> :
          <Table rows={byMachine} rowKey={(r) => r.id} onRow={peek} cols={[{ key: "k", label: "Machine", render: (r) => link("/work/production", <b>{r.k}</b>) }, { key: "j", label: "Jobs", align: "right", render: (r) => r.jobs }, { key: "f", label: "Failed", align: "right", render: (r) => r.failed }, { key: "p", label: "Rate", align: "right", render: (r) => r.pct > Math.max(floor * 1.5, rate("failRate")) ? <Status tone="blocked">{r.pct}%</Status> : `${r.pct}%` }]} />}</Card>
        <Card><CardTitle>Failure rate by material</CardTitle>{!byMaterial.length ? <NoData what="No finished print jobs yet." /> : <Bars data={byMaterial.map((r) => r.pct)} labels={byMaterial.map((r) => r.k)} />}</Card>
        <Card><CardTitle>Defects · by count</CardTitle>{!defects.length ? <NoData what={`No rework, scrap or tagged defects in ${fyLabel} — every QC passed clean.`} /> : <Bars data={[...defects].sort((a, b) => b.n - a.n).map((r) => r.n)} labels={[...defects].sort((a, b) => b.n - a.n).map((r) => r.d)} />}</Card>
        <Card><CardTitle>Defects · by cost (₹ wasted)</CardTitle>{!defects.length ? <NoData what="Nothing wasted yet." /> : <Bars data={[...defects].sort((a, b) => b.cost - a.cost).map((r) => r.cost)} labels={[...defects].sort((a, b) => b.cost - a.cost).map((r) => r.d)} />}</Card>
        <Card class="lg:col-span-2"><CardTitle>Improvement notes · by defect</CardTitle>{!notes.length ? <NoData what="No improvement notes written at QC yet." /> :
          <ul class="text-sm">{notes.map((x) => <li key={x.id} class="border-t border-line py-1.5">{link("/work/qc", <><b>{x.defect || "Untagged"}</b> · {x.orderNo} — {x.note}{x.cause ? <span class="text-c3"> (cause: {x.cause})</span> : null}</>)}</li>)}</ul>}</Card>
      </div>}
      {tab === "costs" && <div class="grid gap-2 lg:grid-cols-2">
        {!logged.length ? <Card class="lg:col-span-2"><NoData what={`No archived orders in ${fyLabel} have logged consumption yet — estimate vs actual needs both.`} /></Card> : <>
          <Card><CardTitle>Estimate vs actual by order kind</CardTitle><Table rows={byKind} rowKey={(r) => r.id} onRow={peek} cols={[{ key: "t", label: "Kind", render: (r) => <b>{TYPE_LABEL[r.t]}</b> }, { key: "n", label: "Orders", align: "right", render: (r) => r.n }, { key: "e", label: "Estimated", align: "right", render: (r) => inr(r.e) }, { key: "a", label: "Actual", align: "right", render: (r) => inr(r.a) }, { key: "d", label: "Drift", align: "right", render: (r) => `${r.drift > 0 ? "+" : ""}${r.drift}%` }]} /></Card>
          <Card><CardTitle>Actual cost by line (₹)</CardTitle><Bars data={byLine.map((r) => Math.round(r.v))} labels={byLine.map((r) => r.k)} /></Card>
        </>}</div>}
      {tab === "cycle" && <Card><CardTitle>Median days per stage</CardTitle>{!cycle.length ? <NoData what="No stage moves recorded yet — cycle time starts counting from the first order moved in 2.0." /> :
        <Table rows={cycle} rowKey={(r) => r.id} onRow={peek} cols={[{ key: "s", label: "Stage", render: (r) => <b>{STAGE_LABEL[r.s]}</b> }, { key: "n", label: "Moves", align: "right", render: (r) => r.n }, { key: "m", label: "Median days", align: "right", render: (r) => r.m },
          { key: "o", label: "Outliers", render: (r) => r.out.length ? r.out.map((x) => <a key={x.order} class="underline mr-2" href="/work/orders">{x.order} ({x.days} d)</a>) : "—" }]} />}</Card>}
    </Shell>
  );
}
