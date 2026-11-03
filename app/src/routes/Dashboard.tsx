import { Bars } from "../charts";
import { Card, CardTitle, Page, Section, Stat, Status } from "../ui";
import { financeSummary, moneySig, windowFor, attention as attn, batchesSig, db, inr, logsSig, ordersSig, packSig, spoolsSig, orderCost, orderTotal, shortDate, STAGES } from "../data";

const jobTone = (s: string) => (s === "done" ? "done" : s === "printing" ? "active" : s === "failed" ? "blocked" : "waiting") as "done";

export default function Dashboard() {
  const open = db.orders.filter((o) => o.stage !== "archived");
  const blocked = db.orders.filter((o) => o.blocked);
  const low = db.packStock.filter((p) => p.qty <= p.reorderAt);
  const out = db.spools.filter((s) => s.grams === 0);
  const paid = open.filter((o) => o.type !== "inhouse");
  const pipeline = paid.reduce((s, o) => s + orderTotal(o), 0);
  const margin = Math.round((1 - paid.reduce((s, o) => s + orderCost(o), 0) / pipeline) * 100);
  const al = attn(ordersSig.value, spoolsSig.value, packSig.value, batchesSig.value);
  const fm = financeSummary(windowFor("mtd", "2026-27"), ordersSig.value);
  const week = Array.from({ length: 7 }, (_, i) => { const d = new Date(Date.now() - (6 - i) * 864e5).toISOString().slice(0, 10); return { l: new Date(d).toLocaleDateString("en-IN", { weekday: "narrow" }), v: moneySig.value.filter((m) => m.date === d && !m.kind.startsWith("transfer")).reduce((s, m) => s + m.amount, 0) }; });
  const todo = db.tasks.filter((t) => !t.done);
  const dueSoon = [...open].sort((a, b) => a.due.localeCompare(b.due)).slice(0, 5);
  const attention = [
    ...blocked.map((o) => ({ id: o.id, href: "/work/orders", icon: "bell", dark: true, t: `${o.no} · ${o.customer}`, d: o.blocked! })),
    ...out.map((s) => ({ id: s.id, href: "/workshop/filament", icon: "box", dark: false, t: `Out of ${s.material} ${s.colour}`, d: s.spoolNo })),
    ...low.map((p) => ({ id: p.id, href: "/workshop/packing", icon: "box", dark: false, t: `Low · ${p.name}`, d: `${p.qty} ${p.unit} left` })),
  ];
  return (
    <Page title="Hi, Studio Nexify" sub="Tuesday, 3 November">
      <Section title="Needs attention" note={`${Object.values(al).flat().length} items`} action={<a href="/alerts" class="text-xs text-c3 whitespace-nowrap">All →</a>}>
        <div class="grid gap-2 grid-cols-1 md:grid-cols-2 2xl:grid-cols-4">
          {Object.entries(al).map(([g, list]) => (
            <Card key={g}>
              <CardTitle action={<span class="num text-xs text-c3">{list.length}</span>}>{g}</CardTitle>
              <ul class="flex flex-col">
                {[...list].sort((a, b) => ["danger", "warn", "info"].indexOf(a.t) - ["danger", "warn", "info"].indexOf(b.t)).slice(0, 3).map((a, i) => (
                  <li key={i} class="border-t border-c1 first:border-0"><a href={a.href} class="flex items-start gap-2 py-1.5 text-sm"><Status tone={a.t === "danger" ? "blocked" : a.t === "warn" ? "waiting" : "idle"}>{""}</Status><span class="min-w-0">{a.text}</span></a></li>
                ))}
              </ul>
            </Card>
          ))}
        </div>
      </Section>
      <Section title="At a glance">
        <div class="grid gap-3 md:grid-cols-2 2xl:grid-cols-[1.4fr_1fr_1fr]">
          <Card dark class="md:col-span-2 2xl:col-span-1">
            <CardTitle action={<a href="/work" class="text-sm opacity-80">Work Area →</a>}>Work in progress</CardTitle>
            <div class="flex flex-wrap items-end gap-x-8 gap-y-2 mb-4">
              <div><div class="num text-3xl md:text-5xl font-semibold leading-none">{open.length}</div><div class="text-sm opacity-80 mt-1">open orders</div></div>
              <div><div class="num text-xl md:text-3xl font-semibold leading-none">{inr(pipeline)}</div><div class="text-sm opacity-80 mt-1">order value in pipeline</div></div>
            </div>
            <div class="grid grid-cols-4 md:grid-cols-8 gap-1.5">
              {STAGES.map((s) => <Stat dark key={s.key} value={ordersSig.value.filter((o) => o.stage === s.key).length} label={s.label} />)}
            </div>
          </Card>
          <Card>
            <CardTitle action={<a href="/mauny" class="text-sm text-c3">Mauny →</a>}>Money in / out this week</CardTitle>
            <Bars data={week.map((d) => d.v)} labels={week.map((d) => d.l)} height={120} />
          </Card>
          <Card>
            <CardTitle action={<a href="/mauny/finance" class="text-sm text-c3">Finance →</a>}>This month</CardTitle>
            <div class="grid grid-cols-2 gap-x-4 gap-y-4">
              <div><div class="text-xs text-c3">Earned</div><div class="num text-2xl font-semibold">{inr(fm.earned)}</div></div>
              <div><div class="text-xs text-c3">Net profit</div><div class="num text-2xl font-semibold">{inr(fm.earned - fm.spent)}</div></div>
              <div><div class="text-xs text-c3">Spent</div><div class="num text-2xl font-semibold">{inr(fm.spent)}</div></div>
              <div><div class="text-xs text-c3">Pipeline margin</div><div class="num text-2xl font-semibold">{margin}%</div></div>
            </div>
          </Card>
        </div>
      </Section>

      <Section title="Today" note={`${attention.length} alerts · ${todo.length} tasks`}>
        <div class="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <Card>
            <CardTitle action={<a href="/work/orders" class="text-sm text-c3">All →</a>}>Due soonest</CardTitle>
            <ul class="flex flex-col gap-3 text-sm">
              {dueSoon.map((o) => (
                <li key={o.id} class="flex justify-between gap-2">
                  <span class="min-w-0"><span class="font-semibold block">{o.customer}</span><span class="text-c3">{o.no} · {STAGES.find((s) => s.key === o.stage)!.label}</span></span>
                  <span class="num whitespace-nowrap">{shortDate(o.due)}</span>
                </li>
              ))}
            </ul>
          </Card>
          <Card>
            <CardTitle action={<a href="/todo" class="text-sm text-c3">All →</a>}>To-do</CardTitle>
            <ul class="flex flex-col gap-3 text-sm">
              {todo.map((t) => (
                <li key={t.id} class="min-w-0">
                  <span class="font-medium block">{t.title}</span>
                  <span class="text-xs text-c3">{t.who} · {shortDate(t.due)}{t.link ? ` · ${t.link.ref}` : ""}</span>
                </li>
              ))}
            </ul>
          </Card>
          <Card>
            <CardTitle action={<a href="/logs" class="text-sm text-c3">All →</a>}>Recent activity</CardTitle>
            <ul class="flex flex-col gap-3 text-sm">
              {logsSig.value.slice(0, 5).map((l) => (
                <li key={l.id} class="min-w-0">
                  <span class="block"><b>{l.who}</b> {l.action.toLowerCase()}</span>
                  <span class="text-xs text-c3">{l.target} · {l.at.slice(11)}</span>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </Section>

      <Section title="Floor" note={`${db.printers.filter((p) => p.status === "printing").length} of ${db.printers.length} printers busy`} action={<a href="/work/production" class="text-sm text-c3 whitespace-nowrap">Production →</a>}>
        <div class="grid gap-3 xl:grid-cols-[1fr_1.4fr]">
          <div class="grid gap-2 sm:grid-cols-3 xl:grid-cols-1 content-start">
            {db.printers.map((p) => (
              <div key={p.id} class={`rounded-2xl p-3 flex justify-between items-center gap-2 ${p.status === "printing" ? "bg-c4 text-c0" : "bg-c0"}`}>
                <span class="min-w-0"><span class="font-semibold block">{p.name}</span><span class="text-xs opacity-80">{p.job ? `Printing ${p.job}` : p.model}</span></span>
                <Status tone={p.status === "printing" ? "active" : p.status === "down" ? "blocked" : "idle"}>{p.status}</Status>
              </div>
            ))}
          </div>
          <Card>
            <CardTitle>Job queue</CardTitle>
            <ul class="grid gap-x-6 gap-y-3 text-sm md:grid-cols-2">
              {db.jobs.map((j) => (
                <li key={j.id} class="flex justify-between gap-2">
                  <span class="min-w-0"><span class="font-medium block">{j.item}</span><span class="text-c3">{j.orderNo} · {j.printer} · {j.hours}h</span></span>
                  <Status tone={jobTone(j.status)}>{j.status}</Status>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </Section>
    </Page>
  );
}
