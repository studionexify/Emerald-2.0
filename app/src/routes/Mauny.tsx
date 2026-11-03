import type { ComponentChildren } from "preact";
import { useState } from "preact/hooks";
import { MAUNY_TABS } from "../nav";
import { Bars, Line } from "../charts";
import { Button, Card, CardTitle, Chip, Fact, Field, inputCls, Page, Progress, Section, Stat, Status, SubTabs, Table } from "../ui";
import { consSig, db, inr, shortDate, X } from "../data";

function Shell({ title, sub, actions, toolbar, detail, children }: { title: string; sub?: string; actions?: ComponentChildren; toolbar?: ComponentChildren; detail?: ComponentChildren | null; children: ComponentChildren }) {
  return <Page title={title} sub={sub} actions={actions} toolbar={toolbar} detail={detail} tabs={MAUNY_TABS}>{children}</Page>;
}
const FY = () => <select class="h-7 md:h-8 px-3 rounded-full bg-c0 text-xs md:text-sm font-medium"><option>FY 2026-27</option><option>FY 2025-26</option></select>;
const Fig = ({ label, value, note, dark, rule }: { label: string; value: string; note?: string; dark?: boolean; rule: string }) => (
  <Card dark={dark}><div class="text-xs opacity-80" title={rule}>{label}</div><div class="num text-xl md:text-2xl xl:text-3xl font-semibold mt-1">{value}</div>{note && <div class="text-xs opacity-80 mt-1">{note}</div>}<div class="text-[11px] opacity-60 mt-1.5 leading-snug">{rule}</div></Card>
);

export function MaunyHome() {
  const total = X.bankAccounts.reduce((s, a) => s + a.bal, 0);
  return (
    <Shell title="Mauny" sub="Every rupee in and out" actions={<><Button variant="outline">Transfer</Button><Button icon="plus">Add entry</Button></>}>
      <Section title="Balances" note={inr(total) + " total"}>
        <div class="grid gap-2 grid-cols-1 sm:grid-cols-3">
          {X.bankAccounts.map((a, i) => (
            <Card key={a.id} dark={i === 0}><div class="text-xs opacity-80">{a.name}</div><div class="num text-xl md:text-3xl font-semibold mt-1">{inr(a.bal)}</div><div class="text-xs opacity-80 mt-1">Reconciled to {a.recon}{a.pending ? ` · ${a.pending} to review` : ""}</div></Card>
          ))}
        </div>
      </Section>
      <Section title="This year" note="FY 2026-27">
        <div class="grid grid-cols-2 xl:grid-cols-5 gap-2">
          <Stat value={inr(482150)} label="Earned" /><Stat value={inr(391000)} label="Collected" /><Stat value={inr(91150)} label="Outstanding" /><Stat value={inr(112400)} label="Spent" /><Stat value={inr(98600)} label="Pipeline" />
        </div>
      </Section>
      <Section title="Day book" note={`${db.money.length} entries`}>
        <Card>
          <Table rows={db.money} rowKey={(m) => m.id} cols={[
            { key: "t", label: "Entry", render: (m) => <b>{m.title}</b> },
            { key: "d", label: "Date", render: (m) => shortDate(m.date) },
            { key: "a", label: "Account", render: (m) => m.account },
            { key: "k", label: "Kind", render: (m) => <Status tone={m.kind === "in" ? "done" : m.kind === "out" ? "active" : "idle"}>{m.kind}</Status> },
            { key: "v", label: "Amount", align: "right", render: (m) => inr(m.amount) },
          ]} />
        </Card>
      </Section>
    </Shell>
  );
}

export function Purchases() {
  const [f, setF] = useState("all");
  const [open, setOpen] = useState<(typeof X.bills)[number] | null>(null);
  const rows = X.bills.filter((b) => f === "all" || b.status === f);
  const tone = (s: string) => (s === "logged" ? "done" : s === "failed" ? "blocked" : s === "rejected" ? "idle" : "waiting") as "done";
  return (
    <Shell title="Purchases" sub="Bill vault — read by AI, filed to Drive by FY, confirmed by a person" actions={<Button icon="plus">Upload bill</Button>}
      toolbar={<div class="flex flex-wrap gap-1.5">{[["all", "All"], ["needs_review", "To review"], ["logged", "Logged"], ["failed", "Unreadable"], ["rejected", "Rejected"]].map(([k, l]) => <Chip key={k} active={f === k} onClick={() => setF(k)}>{l}</Chip>)}</div>}
      detail={open && (
        <div>
          <div class="flex items-center gap-2 mb-3"><button class="w-8 h-8 rounded-full bg-c1 cursor-pointer" aria-label="Close" onClick={() => setOpen(null)}>✕</button><h2 class="font-semibold">Review · {open.vendor}</h2></div>
          <div class="rounded-xl bg-c1 h-40 flex items-center justify-center text-xs text-c3 mb-3">Bill preview (PDF / image)</div>
          <div class="grid grid-cols-2 gap-2">
            <Field label="Vendor"><input class={inputCls} value={open.vendor} /></Field><Field label="GSTIN"><input class={inputCls} placeholder="24AAA…" /></Field>
            <Field label="Bill no."><input class={inputCls} value={open.no} /></Field><Field label="Date"><input class={inputCls} value={open.date} /></Field>
            <Field label="Tax"><input class={inputCls} value={String(open.tax)} /></Field><Field label="Total"><input class={inputCls} value={String(open.total)} /></Field>
            <div class="col-span-2"><Field label="Category"><select class={inputCls}><option>{open.cat}</option><option>Filament</option><option>Packing</option><option>Utilities</option></select></Field></div>
          </div>
          {open.note && <div class="mt-3 rounded-xl bg-c4 text-c0 p-2.5 text-xs">{open.note}</div>}
          <div class="flex gap-2 mt-3"><Button variant="outline">Reject</Button><Button>Log expense</Button></div>
        </div>
      )}>
      <Card dashed><div class="text-center text-sm text-c3 py-2">Drop bills here — PDF or photo. Reader: <b>Claude</b> / Gemini · filed in Drive “Emerald — Purchase Documents / FY 2026-27”</div></Card>
      <div class="grid gap-2 sm:grid-cols-2 2xl:grid-cols-3">
        {rows.map((b) => (
          <button key={b.id} onClick={() => setOpen(b)} class="text-left bg-c0 rounded-xl p-3 cursor-pointer">
            <div class="flex justify-between gap-2"><b class="text-sm">{b.vendor}</b><Status tone={tone(b.status)}>{b.status.replace("_", " ")}</Status></div>
            <div class="text-xs text-c3 mt-1">{b.no} · {shortDate(b.date)} · {b.cat}</div>
            <div class="num font-semibold mt-1">{b.total ? inr(b.total) : "—"}</div>
            {b.note && <div class="text-xs mt-1">{b.note}</div>}
          </button>
        ))}
      </div>
    </Shell>
  );
}

export function Finance() {
  const [tab, setTab] = useState<"expenses" | "outstanding" | "receipts" | "extras">("expenses");
  return (
    <Shell title="Finance" sub="Five figures, one rule each · April-first FY windows" toolbar={<div class="flex items-center gap-2"><FY /><Button variant="outline" class="!h-7 md:!h-8">Settings</Button></div>} actions={<Button icon="plus">Add expense</Button>}>
      <div class="grid gap-2 grid-cols-2 xl:grid-cols-5">
        <Fig dark label="Earned" value={inr(482150)} note="+18.2% vs LY" rule="Paid invoices + closed orders never invoiced" />
        <Fig label="Collected" value={inr(391000)} rule="Paid invoices only" />
        <Fig label="Outstanding" value={inr(91150)} note={`${inr(124000)} all-time`} rule="Issued and unsettled" />
        <Fig label="Spent" value={inr(112400)} note="41 entries" rule="Structured expense entries only" />
        <Fig label="Pipeline" value={inr(98600)} rule="Open order value — never revenue" />
      </div>
      <div class="grid gap-2 lg:grid-cols-2">
        <Card><CardTitle>Earned vs spent · monthly</CardTitle><Line a={[40, 55, 48, 70, 82, 95, 88]} b={[30, 32, 35, 31, 38, 39, 36]} labels={["Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct"]} /></Card>
        <Card><CardTitle>Expenses by category</CardTitle><Bars data={X.books.expenseHeads.map((h) => Math.round(h.amount / 1000))} labels={["Filament", "Power", "Courier", "Packing", "Waste"]} /></Card>
      </div>
      <SubTabs value={tab} onChange={setTab} items={[["expenses", "Recent expenses"], ["outstanding", "Outstanding by age"], ["receipts", "Receipts"], ["extras", "Extras"]]} />
      <Card>
        {tab === "expenses" && <Table rows={X.expenses} rowKey={(e) => e.id} cols={[
          { key: "h", label: "Head", render: (e) => <b>{e.head}</b> }, { key: "d", label: "Date", render: (e) => shortDate(e.date) }, { key: "v", label: "Vendor", render: (e) => e.vendor },
          { key: "b", label: "Bill", render: (e) => (e.bill ? <a class="underline" href="/mauny/purchases">View</a> : "—") }, { key: "a", label: "Amount", align: "right", render: (e) => inr(e.amount) }]} />}
        {tab === "outstanding" && <Table rows={X.invoices.filter((i) => !i.paid).sort((a, b) => b.age - a.age)} rowKey={(i) => i.id} cols={[
          { key: "n", label: "Invoice", render: (i) => <b>{i.no}</b> }, { key: "c", label: "Customer", render: (i) => i.customer },
          { key: "a", label: "Age", render: (i) => <Status tone={i.age > 60 ? "blocked" : "waiting"}>{i.age} days</Status> }, { key: "v", label: "Total", align: "right", render: (i) => inr(i.total) }]} />}
        {tab === "receipts" && <Table rows={X.invoices.filter((i) => i.paid)} rowKey={(i) => i.id} cols={[
          { key: "n", label: "Against", render: (i) => <b>{i.no}</b> }, { key: "c", label: "From", render: (i) => i.customer }, { key: "d", label: "Date", render: (i) => shortDate(i.date) }, { key: "v", label: "Amount", align: "right", render: (i) => inr(i.total) }]} />}
        {tab === "extras" && <p class="text-sm text-c3">Extras — freight recovered, design fees, rush charges and other non-line income. None this month.</p>}
      </Card>
    </Shell>
  );
}

export function Goals() {
  const [arch, setArch] = useState(false);
  return (
    <Shell title="Goals" sub="Targets measured off the ledger — progress is derived, never stored" actions={<Button icon="plus">New goal</Button>}
      toolbar={<div class="flex gap-1.5"><Chip active={!arch} onClick={() => setArch(false)}>Active</Chip><Chip active={arch} onClick={() => setArch(true)}>Archived</Chip></div>}>
      {arch ? <Card><p class="text-sm text-c3">FY 2025-26 goals — archived, kept so this year's numbers mean something.</p></Card> : (
        <div class="grid gap-2 md:grid-cols-2 2xl:grid-cols-3">
          {X.goals.map((g) => {
            const pct = Math.round((g.value / g.target) * 100), behind = g.cap ? pct > g.pace : pct < g.pace;
            const fmt = (n: number) => (g.money ? inr(n) : g.pct ? `${n}%` : String(n));
            return (
              <Card key={g.id}>
                <div class="flex justify-between gap-2 text-xs text-c3"><span>{g.metric}</span><span>{g.period}</span></div>
                <div class="font-semibold mt-0.5">{g.title}</div>
                <div class="flex justify-between items-baseline mt-2"><span class="num text-xl md:text-2xl font-semibold">{fmt(g.value)}</span><span class="num text-sm">{pct}%</span></div>
                <div class="relative mt-1"><Progress value={pct} /><span class="absolute -top-1 h-4 w-0.5 bg-c3" style={{ left: `${g.pace}%` }} aria-label="today" /></div>
                <div class="flex justify-between text-xs mt-1.5"><span class="text-c3">of {fmt(g.target)}</span>{behind ? <Status tone="blocked">{g.cap ? "over pace" : "behind pace"}</Status> : <Status tone="done">on pace</Status>}</div>
                {g.note && <p class="text-xs text-c3 mt-1.5">“{g.note}”</p>}
                <div class="flex gap-1 mt-2"><Button variant="ghost">Edit</Button><Button variant="ghost">Archive</Button></div>
              </Card>
            );
          })}
        </div>
      )}
    </Shell>
  );
}

export function Accounts() {
  const [acct, setAcct] = useState(X.bankAccounts[0].id);
  return (
    <Shell title="Accounts & statements" sub="Upload a statement · AI extracts lines · review, confirm or reject" actions={<><Button variant="outline">Transfer</Button><Button icon="plus">Upload statement</Button></>}
      toolbar={<SubTabs value={acct} onChange={setAcct} items={X.bankAccounts.map((a) => [a.id, a.name] as [string, string])} />}>
      <div class="grid gap-2 grid-cols-1 sm:grid-cols-3">
        {X.bankAccounts.map((a) => (
          <Card key={a.id} dark={a.id === acct}><div class="text-xs opacity-80">{a.name}</div><div class="num text-xl md:text-2xl font-semibold mt-1">{inr(a.bal)}</div><div class="text-xs opacity-80">Reconciled to {a.recon}</div></Card>
        ))}
      </div>
      <Section title="Statement lines" note={`${X.statementLines.filter((l) => l.state === "review").length} to review`}>
        <Card>
          <Table rows={X.statementLines} rowKey={(l) => l.id} cols={[
            { key: "t", label: "Narration", render: (l) => <b>{l.text}</b> }, { key: "d", label: "Date", render: (l) => shortDate(l.date) },
            { key: "a", label: "Amount", align: "right", render: (l) => inr(l.amount) }, { key: "g", label: "Matched to", render: (l) => l.guess },
            { key: "s", label: "", render: (l) => (l.state === "confirmed" ? <Status tone="done">Confirmed</Status> : <span class="flex gap-1"><Button variant="outline">Confirm</Button><Button variant="ghost">Reject</Button></span>) },
          ]} />
        </Card>
      </Section>
    </Shell>
  );
}

const BOOK_TABS: [string, string][] = [["sales", "Sales Book"], ["purchase", "Purchase Book"], ["debtors", "Debtors"], ["creditors", "Creditors"], ["bank", "Bank Book"], ["expense", "Expense Book"],
  ["capital", "Capital & Loans"], ["assets", "Fixed Assets"], ["pl", "P&L"], ["bs", "Balance Sheet"], ["msme", "MSME"], ["parties", "Parties"]];

export function Books() {
  const [t, setT] = useState("sales");
  const B = X.books;
  const tax = [{ key: "n", label: "No.", render: (r: any) => <b>{r.no}</b> }, { key: "d", label: "Date", render: (r: any) => shortDate(r.date) }, { key: "p", label: "Party", render: (r: any) => r.party },
    { key: "t", label: "Taxable", align: "right" as const, render: (r: any) => inr(r.taxable) }, { key: "c", label: "CGST", align: "right" as const, render: (r: any) => inr(r.cgst), hideTablet: true },
    { key: "s", label: "SGST", align: "right" as const, render: (r: any) => inr(r.sgst), hideTablet: true }, { key: "i", label: "IGST", align: "right" as const, render: (r: any) => inr(r.igst), hideTablet: true },
    { key: "v", label: "Total", align: "right" as const, render: (r: any) => inr(r.total) }];
  return (
    <Shell title="Books" sub="Double-entry ledger · derived vouchers, never retyped" actions={<><Button variant="outline">Build party master</Button><Button variant="outline">Tally export</Button><Button>Audit pack</Button></>}
      toolbar={<div class="flex flex-col md:flex-row md:items-center gap-2"><SubTabs value={t} onChange={setT} items={BOOK_TABS} /></div>}>
      <Card>
        {t === "sales" && <Table rows={B.sales} rowKey={(r) => r.id} cols={tax} />}
        {t === "purchase" && <Table rows={B.purchase} rowKey={(r) => r.id} cols={tax} />}
        {t === "debtors" && <Table rows={B.debtors} rowKey={(r) => r.id} cols={[{ key: "p", label: "Party", render: (r) => <b>{r.party}</b> }, { key: "a", label: "0–30", align: "right", render: (r) => inr(r.b0) }, { key: "b", label: "31–60", align: "right", render: (r) => inr(r.b30) }, { key: "c", label: "61–90", align: "right", render: (r) => inr(r.b60) }, { key: "d", label: "90+", align: "right", render: (r) => inr(r.b90) }, { key: "t", label: "Total", align: "right", render: (r) => inr(r.total) }]} />}
        {t === "creditors" && <Table rows={B.creditors} rowKey={(r) => r.id} cols={[{ key: "p", label: "Party", render: (r) => <b>{r.party}</b> }, { key: "m", label: "MSME", render: (r) => r.msme }, { key: "d", label: "Pay by", render: (r) => shortDate(r.due) }, { key: "h", label: "43B(h)", render: (r) => (r.h ? <Status tone="waiting">Exposed</Status> : "—") }, { key: "t", label: "Owed", align: "right", render: (r) => inr(r.total) }]} />}
        {t === "bank" && <Table rows={B.bank} rowKey={(r) => r.id} cols={[{ key: "t", label: "Particulars", render: (r) => <b>{r.text}</b> }, { key: "d", label: "Date", render: (r) => shortDate(r.date) }, { key: "r", label: "Receipt", align: "right", render: (r) => (r.dr ? inr(r.dr) : "—") }, { key: "p", label: "Payment", align: "right", render: (r) => (r.cr ? inr(r.cr) : "—") }, { key: "b", label: "Balance", align: "right", render: (r) => inr(r.bal) }]} />}
        {t === "expense" && <Table rows={B.expenseHeads} rowKey={(r) => r.id} cols={[{ key: "h", label: "Head", render: (r) => <b>{r.head}</b> }, { key: "a", label: "FY to date", align: "right", render: (r) => inr(r.amount) }]} />}
        {t === "capital" && <><Table rows={B.capital} rowKey={(r) => r.id} cols={[{ key: "t", label: "Entry", render: (r) => <b>{r.text}</b> }, { key: "d", label: "Date", render: (r) => shortDate(r.date) }, { key: "a", label: "Amount", align: "right", render: (r) => inr(r.amount) }]} /><p class="text-xs text-c3 mt-3">Loans: none — printers were bought outright. The loan book is ready for when that changes.</p></>}
        {t === "assets" && <Table rows={B.assets} rowKey={(r) => r.id} cols={[{ key: "n", label: "Asset", render: (r) => <b>{r.name}</b> }, { key: "m", label: "Machine", render: (r) => r.machine }, { key: "b", label: "IT block", render: (r) => r.block, hideTablet: true }, { key: "c", label: "Cost", align: "right", render: (r) => inr(r.cost) }, { key: "d", label: "Dep. FY", align: "right", render: (r) => inr(r.dep) }, { key: "w", label: "WDV", align: "right", render: (r) => inr(r.wdv) }]} />}
        {t === "pl" && <div class="grid gap-x-6 gap-y-1 md:grid-cols-2 text-sm">{[["Sales", 482150], ["Purchases (materials)", -164200], ["Gross profit", 317950], ["Expenses", -75040], ["Depreciation", -49050], ["Net profit", 193860]].map(([l, v]) => <div key={l as string} class="flex justify-between py-1.5 border-t border-c1"><span class={String(l).includes("profit") ? "font-semibold" : ""}>{l}</span><span class="num">{inr(v as number)}</span></div>)}</div>}
        {t === "bs" && <div class="grid gap-x-6 md:grid-cols-2 text-sm">{[["Capital + profit", 503860], ["Creditors", 13156], ["Fixed assets (WDV)", 157948], ["Debtors", 91250], ["Bank + cash", 202970], ["Stock", 64848]].map(([l, v]) => <div key={l as string} class="flex justify-between py-1.5 border-t border-c1"><span>{l}</span><span class="num">{inr(v as number)}</span></div>)}</div>}
        {t === "msme" && <Table rows={B.msme} rowKey={(r) => r.id} cols={[{ key: "p", label: "Supplier", render: (r) => <b>{r.party}</b> }, { key: "c", label: "Class", render: (r) => r.cls }, { key: "b", label: "Bill", render: (r) => r.bill }, { key: "d", label: "S.15 deadline", render: (r) => shortDate(r.deadline) }, { key: "l", label: "Days left", align: "right", render: (r) => r.left }]} />}
        {t === "parties" && <Table rows={B.parties} rowKey={(r) => r.id} cols={[{ key: "n", label: "Party", render: (r) => <b>{r.name}</b> }, { key: "t", label: "Type", render: (r) => r.type }, { key: "g", label: "GSTIN", render: (r) => r.gstin }, { key: "b", label: "Balance", align: "right", render: (r) => inr(r.bal) }]} />}
      </Card>
    </Shell>
  );
}

export function Gst() {
  return (
    <Shell title="GST desk" sub="Monthly view · GSTR-1 / 3B filing · print · pack" toolbar={<FY />}>
      <div class="grid grid-cols-3 gap-2">
        <Stat value={inr(X.gstMonths.reduce((s, m) => s + m.out, 0))} label="Output GST" />
        <Stat value={inr(X.gstMonths.reduce((s, m) => s + m.inp, 0))} label="Input credit" />
        <Stat value={inr(X.gstMonths.reduce((s, m) => s + m.out - m.inp, 0))} label="Net payable" />
      </div>
      <Card>
        <Table rows={X.gstMonths} rowKey={(r) => r.id} cols={[
          { key: "m", label: "Month", render: (r) => <b>{r.m}</b> },
          { key: "s", label: "Taxable sales", align: "right", render: (r) => inr(r.sales) },
          { key: "o", label: "Output", align: "right", render: (r) => inr(r.out) },
          { key: "i", label: "Input", align: "right", render: (r) => inr(r.inp), hideTablet: true },
          { key: "f", label: "GSTR-1", render: (r) => <Status tone={r.r1 ? "done" : "waiting"}>{r.r1 ? "Filed" : "Due 11 Nov"}</Status> },
          { key: "b", label: "3B", render: (r) => <Status tone={r.r3b ? "done" : "waiting"}>{r.r3b ? "Filed" : "Due 20 Nov"}</Status> },
          { key: "p", label: "", render: () => <span class="flex gap-1"><Button variant="ghost">Print</Button><Button variant="ghost">Pack</Button></span> },
        ]} />
      </Card>
    </Shell>
  );
}

export function Reports() {
  const funnel = [["Quoted", 48, 1840000], ["Approved", 31, 1210000], ["In production", 12, 0], ["Archived", 19, 790000], ["Outcome unrecorded", 6, 0]] as const;
  const ch = [["Instagram", 19, 8, 210000, 54], ["Referral", 7, 6, 480000, 61], ["Word of mouth", 6, 5, 190000, 58], ["Website", 9, 2, 70000, 49], ["Exhibition", 4, 3, 310000, 44]].map((r, i) => ({ id: String(i), r }));
  return (
    <Shell title="Reports & analytics" sub="Derived from records, never stored" toolbar={<FY />}>
      <div class="grid gap-2 lg:grid-cols-2 2xl:grid-cols-3">
        <Card><CardTitle>Quotation funnel</CardTitle><ul class="text-sm flex flex-col gap-2">{funnel.map(([l, n, v]) => <li key={l}><a href="/work/orders" class="block"><div class="flex justify-between"><span>{l}</span><span class="num">{n}{v ? ` · ${inr(v)}` : ""}</span></div><Progress value={(n / 48) * 100} /></a></li>)}</ul></Card>
        <Card><CardTitle>Retail vs bulk vs in-house</CardTitle><Bars data={[96, 142, 0]} labels={["Client", "Bulk", "In-house"]} /></Card>
        <Card><CardTitle>Failure rate by machine</CardTitle><Bars data={X.machineLog.map((m) => m.fail)} labels={X.machineLog.map((m) => m.printer)} /></Card>
        <Card class="lg:col-span-2"><CardTitle>Channel attribution · sorted by rate</CardTitle>
          <Table rows={[...ch].sort((a, b) => (b.r[2] as number) / (b.r[1] as number) - (a.r[2] as number) / (a.r[1] as number))} rowKey={(x) => x.id} cols={[
            { key: "c", label: "Channel", render: (x) => <b>{x.r[0]}</b> }, { key: "q", label: "Quotes", align: "right", render: (x) => x.r[1] }, { key: "w", label: "Won", align: "right", render: (x) => x.r[2] },
            { key: "r", label: "Rate", align: "right", render: (x) => `${Math.round(((x.r[2] as number) / (x.r[1] as number)) * 100)}%` }, { key: "v", label: "Value won", align: "right", render: (x) => inr(x.r[3] as number) }, { key: "m", label: "Margin", align: "right", render: (x) => `${x.r[4]}%` }]} /></Card>
        <Card><CardTitle>Consumption by kind</CardTitle>{(() => { const ks = [...new Set(consSig.value.map((c) => c.kind))]; return <Bars data={ks.map((k) => consSig.value.filter((c) => c.kind === k).reduce((s, c) => s + c.cost, 0))} labels={ks} />; })()}</Card>
        <Card><CardTitle>Machine utilisation</CardTitle><Bars data={X.machineLog.map((m) => m.util)} labels={X.machineLog.map((m) => m.printer)} /></Card>
        <Card><CardTitle>Defect Pareto · by cost</CardTitle><Bars data={[540, 310, 120, 60]} labels={["Layer shift", "Warping", "Stringing", "Dims"]} /></Card>
        <Card><CardTitle>Estimate vs actual</CardTitle><div class="grid grid-cols-3 gap-2 text-sm"><Fact label="Estimated" value={inr(340000)} /><Fact label="Actual" value={inr(412000)} /><Fact label="Drift" value="+21%" /></div><p class="text-xs text-c3 mt-2">Material +9% · machine time +31% · freight absorbed ₹6,400</p></Card>
        <Card><CardTitle>Median days per stage</CardTitle><Bars data={[2, 4, 1, 1, 1, 3]} labels={["Quote", "Prod", "QC", "Pack", "Inv", "Ship"]} /></Card>
      </div>
    </Shell>
  );
}
