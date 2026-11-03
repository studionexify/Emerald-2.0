import { Bars } from "../charts";
import { Card, CardTitle, Icon, Page, Section, Stat, Status } from "../ui";
import { db, inr, orderCost, orderTotal, shortDate, STAGES } from "../data";

const jobTone = (s: string) => (s === "done" ? "done" : s === "printing" ? "active" : s === "failed" ? "blocked" : "waiting") as "done";

export default function Dashboard() {
  const open = db.orders.filter((o) => o.stage !== "archived");
  const blocked = db.orders.filter((o) => o.blocked);
  const low = db.packStock.filter((p) => p.qty <= p.reorderAt);
  const out = db.spools.filter((s) => s.grams === 0);
  const paid = open.filter((o) => o.type !== "inhouse");
  const pipeline = paid.reduce((s, o) => s + orderTotal(o), 0);
  const margin = Math.round((1 - paid.reduce((s, o) => s + orderCost(o), 0) / pipeline) * 100);
  const todo = db.tasks.filter((t) => !t.done);
  const dueSoon = [...open].sort((a, b) => a.due.localeCompare(b.due)).slice(0, 5);
  const attention = [
    ...blocked.map((o) => ({ id: o.id, href: "/work/orders", icon: "bell", dark: true, t: `${o.no} · ${o.customer}`, d: o.blocked! })),
    ...out.map((s) => ({ id: s.id, href: "/workshop/filament", icon: "box", dark: false, t: `Out of ${s.material} ${s.colour}`, d: s.spoolNo })),
    ...low.map((p) => ({ id: p.id, href: "/workshop/packing", icon: "box", dark: false, t: `Low · ${p.name}`, d: `${p.qty} ${p.unit} left` })),
  ];
  return (
    <Page title="Hi, Studio Nexify" sub="Tuesday, 3 November">
      <Section title="At a glance">
        <div class="grid gap-3 md:grid-cols-2 2xl:grid-cols-[1.4fr_1fr_1fr]">
          <Card dark class="md:col-span-2 2xl:col-span-1">
            <CardTitle action={<a href="/work" class="text-sm opacity-80">Work Area →</a>}>Work in progress</CardTitle>
            <div class="flex flex-wrap items-end gap-x-8 gap-y-2 mb-4">
              <div><div class="num text-5xl font-semibold leading-none">{open.length}</div><div class="text-sm opacity-80 mt-1">open orders</div></div>
              <div><div class="num text-3xl font-semibold leading-none">{inr(pipeline)}</div><div class="text-sm opacity-80 mt-1">order value in pipeline</div></div>
            </div>
            <div class="grid grid-cols-3 md:grid-cols-6 gap-2">
              {STAGES.map((s) => <Stat dark key={s.key} value={db.orders.filter((o) => o.stage === s.key).length} label={s.label} />)}
            </div>
          </Card>
          <Card>
            <CardTitle action={<a href="/mauny" class="text-sm text-c3">Mauny →</a>}>Money in / out this week</CardTitle>
            <Bars data={[4200, -1800, 6100, 2097, -6250, 25000, -380]} labels={["M", "T", "W", "T", "F", "S", "S"]} height={120} />
          </Card>
          <Card>
            <CardTitle action={<a href="/mauny/finance" class="text-sm text-c3">Finance →</a>}>This month</CardTitle>
            <div class="grid grid-cols-2 gap-x-4 gap-y-4">
              <div><div class="text-xs text-c3">Revenue</div><div class="num text-2xl font-semibold">{inr(142800)}</div></div>
              <div><div class="text-xs text-c3">Net profit</div><div class="num text-2xl font-semibold">{inr(52700)}</div></div>
              <div><div class="text-xs text-c3">Orders</div><div class="num text-2xl font-semibold">34</div></div>
              <div><div class="text-xs text-c3">Pipeline margin</div><div class="num text-2xl font-semibold">{margin}%</div></div>
            </div>
          </Card>
        </div>
      </Section>

      <Section title="Today" note={`${attention.length} alerts · ${todo.length} tasks`}>
        <div class="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <Card>
            <CardTitle>Needs attention</CardTitle>
            <ul class="flex flex-col gap-3 text-sm">
              {attention.map((x) => (
                <li key={x.id}><a href={x.href} class="flex items-start gap-3">
                  <span class={`w-8 h-8 shrink-0 rounded-full flex items-center justify-center ${x.dark ? "bg-c4 text-c0" : "bg-c1"}`}><Icon name={x.icon} size={14} /></span>
                  <span class="min-w-0"><span class="font-semibold block">{x.t}</span><span class="text-c3">{x.d}</span></span>
                </a></li>
              ))}
            </ul>
          </Card>
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
              {db.logs.slice(0, 5).map((l) => (
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
