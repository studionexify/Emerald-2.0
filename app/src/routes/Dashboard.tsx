import { Bars } from "../charts";
import { Card, CardTitle, Icon, PageHead, Stat, Status } from "../ui";
import { db, inr, orderTotal, shortDate, STAGES } from "../data";

export default function Dashboard() {
  const open = db.orders.filter((o) => o.stage !== "archived");
  const blocked = db.orders.filter((o) => o.blocked);
  const low = db.packStock.filter((p) => p.qty <= p.reorderAt);
  const out = db.spools.filter((s) => s.grams === 0);
  const pipeline = open.filter((o) => o.type !== "inhouse").reduce((s, o) => s + orderTotal(o), 0);
  const todo = db.tasks.filter((t) => !t.done);
  const dueSoon = [...open].sort((a, b) => a.due.localeCompare(b.due)).slice(0, 4);
  return (
    <>
      <PageHead title="Hi, Studio Nexify" sub="Tuesday, 3 November" />
      <div class="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Card dark class="md:col-span-2">
          <CardTitle action={<a href="/work" class="text-sm opacity-80">Work Area →</a>}>Work in progress</CardTitle>
          <div class="flex flex-wrap items-end gap-x-8 gap-y-2 mb-4">
            <div><div class="num text-5xl font-semibold leading-none">{open.length}</div><div class="text-sm opacity-80 mt-1">open orders</div></div>
            <div><div class="num text-3xl font-semibold leading-none">{inr(pipeline)}</div><div class="text-sm opacity-80 mt-1">order value in pipeline</div></div>
          </div>
          <div class="grid grid-cols-3 md:grid-cols-6 gap-2">
            {STAGES.map((s) => <Stat dark key={s.key} value={db.orders.filter((o) => o.stage === s.key).length} label={s.label} />)}
          </div>
        </Card>
        <Card class="md:col-span-2">
          <CardTitle action={<a href="/mauny" class="text-sm text-c3">Mauny →</a>}>Money in / out this week</CardTitle>
          <Bars data={[4200, -1800, 6100, 2097, -6250, 25000, -380]} labels={["M", "T", "W", "T", "F", "S", "S"]} height={120} />
        </Card>

        <Card>
          <CardTitle>Needs attention ({blocked.length + low.length + out.length})</CardTitle>
          <ul class="flex flex-col gap-3 text-sm">
            {blocked.map((o) => (
              <li key={o.id}><a href="/work/orders" class="flex items-start gap-3">
                <span class="w-8 h-8 shrink-0 rounded-full bg-c4 text-c0 flex items-center justify-center"><Icon name="bell" size={14} /></span>
                <span class="min-w-0"><span class="font-semibold block">{o.no} · {o.customer}</span><span class="text-c3">{o.blocked}</span></span>
              </a></li>
            ))}
            {[...out.map((s) => ({ id: s.id, t: `Out of ${s.material} ${s.colour}`, d: s.spoolNo })), ...low.map((p) => ({ id: p.id, t: `Low · ${p.name}`, d: `${p.qty} ${p.unit} left` }))].map((x) => (
              <li key={x.id}><a href="/workshop/filament" class="flex items-start gap-3">
                <span class="w-8 h-8 shrink-0 rounded-full bg-c1 flex items-center justify-center"><Icon name="box" size={14} /></span>
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
          <CardTitle action={<a href="/todo" class="text-sm text-c3">All →</a>}>To-do ({todo.length})</CardTitle>
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
        <Card class="md:col-span-2 xl:col-span-4">
          <CardTitle action={<a href="/workshop" class="text-sm text-c3">Workshop →</a>}>Printers</CardTitle>
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {db.printers.map((p) => (
              <div key={p.id} class={`rounded-2xl p-3 flex justify-between items-center gap-2 ${p.status === "printing" ? "bg-c4 text-c0" : "bg-c1"}`}>
                <span><span class="font-semibold block">{p.name}</span><span class="text-xs opacity-80">{p.job ?? p.model}</span></span>
                <Status tone={p.status === "printing" ? "active" : p.status === "down" ? "blocked" : "idle"}>{p.status}</Status>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </>
  );
}
