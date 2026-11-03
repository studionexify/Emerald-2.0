import type { ComponentChildren } from "preact";
import { MAUNY_TABS } from "../nav";
import { Bars, Line, Ring } from "../charts";
import { Button, Card, CardTitle, Empty, Fact, PageHead, Progress, Status, Table, Tabs } from "../ui";
import { db, inr, shortDate } from "../data";

function Shell({ title, sub, actions, children }: { title: string; sub?: string; actions?: ComponentChildren; children: ComponentChildren }) {
  return (
    <>
      <PageHead title={title} sub={sub} actions={actions} />
      <div class="mb-5"><Tabs tabs={MAUNY_TABS} /></div>
      {children}
    </>
  );
}

const accounts = [
  { name: "Current account", bal: 184250 },
  { name: "Cash", bal: 6420 },
  { name: "Razorpay", bal: 12300 },
];

export function MaunyHome() {
  return (
    <Shell title="Mauny" sub="Every rupee in and out" actions={<><Button variant="outline">Transfer</Button><Button icon="plus">Add entry</Button></>}>
      <div class="grid gap-3 md:grid-cols-3 mb-3">
        {accounts.map((a, i) => (
          <Card key={a.name} dark={i === 0}>
            <div class="text-sm opacity-80">{a.name}</div>
            <div class="num text-4xl font-semibold mt-2">{inr(a.bal)}</div>
          </Card>
        ))}
      </div>
      <Card>
        <CardTitle>Day book</CardTitle>
        <Table rows={db.money} rowKey={(m) => m.id} cols={[
          { key: "d", label: "Date", render: (m) => shortDate(m.date) },
          { key: "t", label: "Entry", render: (m) => m.title },
          { key: "a", label: "Account", render: (m) => m.account },
          { key: "k", label: "Kind", render: (m) => <Status tone={m.kind === "in" ? "done" : m.kind === "out" ? "active" : "idle"}>{m.kind}</Status> },
          { key: "v", label: "Amount", align: "right", render: (m) => inr(m.amount) },
        ]} />
      </Card>
    </Shell>
  );
}

export function Purchases() {
  return (
    <Shell title="Purchases" sub="Bill vault — upload, AI reads it, you confirm" actions={<Button icon="plus">Upload bill</Button>}>
      <Card dashed><Empty title="Drop bills here" hint="PDF or photo. Gemini reads vendor, date, items and GST; you review before it is saved." /></Card>
    </Shell>
  );
}

export function Finance() {
  return (
    <Shell title="Finance" sub="Month to date vs same days last month">
      <div class="grid gap-3 md:grid-cols-2 xl:grid-cols-4 mb-3">
        <Card dark><Fact label="Net revenue" value={<span class="num text-3xl">{inr(142800)}</span>} /></Card>
        <Card><Fact label="Gross profit" value={<span class="num text-3xl">{inr(91300)}</span>} /></Card>
        <Card><Fact label="Expenses" value={<span class="num text-3xl">{inr(38600)}</span>} /></Card>
        <Card><Fact label="Net profit" value={<span class="num text-3xl">{inr(52700)}</span>} /></Card>
      </div>
      <Card>
        <CardTitle>Revenue vs expenses</CardTitle>
        <Line a={[40, 55, 48, 70, 82, 95]} b={[30, 32, 35, 31, 38, 39]} labels={["Jun", "Jul", "Aug", "Sep", "Oct", "Nov"]} />
      </Card>
    </Shell>
  );
}

export function Goals() {
  const goals = [{ l: "Revenue", v: 142800, t: 250000 }, { l: "Orders", v: 34, t: 50 }, { l: "Spend cap", v: 38600, t: 60000 }];
  return (
    <Shell title="Goals" sub="Targets for this month" actions={<Button icon="plus">New goal</Button>}>
      <div class="grid gap-3 md:grid-cols-3">
        {goals.map((g) => (
          <Card key={g.l} class="flex flex-col items-center gap-3">
            <Ring value={Math.round((g.v / g.t) * 100)} label={g.l} />
            <div class="text-sm text-c3 num">{g.l === "Orders" ? `${g.v} / ${g.t}` : `${inr(g.v)} / ${inr(g.t)}`}</div>
          </Card>
        ))}
      </div>
    </Shell>
  );
}

export function Accounts() {
  return (
    <Shell title="Accounts & statements" sub="Upload bank or Razorpay statements to reconcile" actions={<Button icon="plus">Upload statement</Button>}>
      <div class="grid gap-3 md:grid-cols-2">
        {accounts.map((a) => (
          <Card key={a.name}>
            <CardTitle>{a.name}</CardTitle>
            <div class="num text-3xl font-semibold mb-3">{inr(a.bal)}</div>
            <Progress value={70} />
            <div class="text-xs text-c3 mt-2">Reconciled to 31 Oct</div>
          </Card>
        ))}
      </div>
    </Shell>
  );
}

export function Books() {
  const rows = ["Parties", "Loans", "Capital", "Fixed assets", "MSME", "Tally export", "Year-end CA pack"].map((n, i) => ({ id: String(i), n }));
  return (
    <Shell title="Books" sub="Ledgers and the year-end pack">
      <Card>
        <ul>{rows.map((r) => <li key={r.id} class="flex justify-between items-center py-3 border-t border-c1 first:border-0"><span class="font-medium">{r.n}</span><span class="text-c3">→</span></li>)}</ul>
      </Card>
    </Shell>
  );
}

export function Gst() {
  const months = ["Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct"].map((m, i) => ({ id: m, m, sales: 80000 + i * 9000, filed: i < 6 }));
  return (
    <Shell title="GST desk" sub="FY 2026–27 · monthly view, filing and pack">
      <Card>
        <Table rows={months} rowKey={(r) => r.id} cols={[
          { key: "m", label: "Month", render: (r) => <b>{r.m}</b> },
          { key: "s", label: "Taxable sales", align: "right", render: (r) => inr(r.sales) },
          { key: "g", label: "Output GST", align: "right", render: (r) => inr(r.sales * 0.18) },
          { key: "f", label: "GSTR-1", render: (r) => <Status tone={r.filed ? "done" : "waiting"}>{r.filed ? "Filed" : "Due 11 Nov"}</Status> },
          { key: "p", label: "", render: () => <Button variant="ghost">Pack</Button> },
        ]} />
      </Card>
    </Shell>
  );
}

export function Reports() {
  return (
    <Shell title="Reports & analytics" sub="Derived from records, never stored">
      <div class="grid gap-3 md:grid-cols-2">
        <Card><CardTitle>Revenue by order type</CardTitle><Bars data={[96, 42, 0]} labels={["Client", "Bulk", "In-house"]} /></Card>
        <Card><CardTitle>Orders by intake medium</CardTitle><Bars data={[14, 9, 6, 3, 2]} labels={["Insta", "WhatsApp", "Web", "Email", "Other"]} /></Card>
      </div>
    </Shell>
  );
}
