import { useState } from "preact/hooks";
import { Card, CardTitle, Stat, Status } from "../../ui";
import { Ring } from "../../charts";
import { db, ordersSig, shortDate, STAGES, type Order } from "../../data";
import { OrderCard, OrderDrawer, TypeChips, WorkShell, type TypeFilter } from "./shared";

const jobTone = (s: string) => (s === "done" ? "done" : s === "printing" ? "active" : s === "failed" ? "blocked" : "waiting") as "done";

export default function Overview() {
  const [f, setF] = useState<TypeFilter>("all");
  const [open, setOpen] = useState<Order | null>(null);
  const list = ordersSig.value.filter((o) => f === "all" || o.type === f);
  const live = list.filter((o) => o.stage !== "archived");
  const busy = db.printers.filter((p) => p.status === "printing").length;
  const tasks = db.tasks.filter((t) => !t.done);
  return (
    <WorkShell title="Work Area" sub="Everything on the floor, in one place">
      <div class="mb-3"><TypeChips value={f} onChange={setF} /></div>
      <div class="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Card dark class="md:col-span-2 xl:col-span-3">
          <CardTitle>Orders by stage</CardTitle>
          <div class="grid grid-cols-3 md:grid-cols-6 gap-2">
            {STAGES.map((s) => (
              <a key={s.key} href="/work/orders"><Stat dark value={list.filter((o) => o.stage === s.key).length} label={s.label} /></a>
            ))}
          </div>
        </Card>
        <Card class="flex items-center gap-4 md:col-span-2 xl:col-span-1">
          <Ring value={Math.round((busy / db.printers.length) * 100)} label="busy" size={104} />
          <ul class="text-sm flex-1 grid gap-2 md:grid-cols-3 xl:grid-cols-1 min-w-0">
            {db.printers.map((p) => (
              <li key={p.id} class="md:bg-c1 xl:bg-transparent md:rounded-2xl md:p-3 xl:p-0"><Status tone={p.status === "printing" ? "active" : p.status === "down" ? "blocked" : "idle"}>{p.name} · {p.status}</Status></li>
            ))}
          </ul>
        </Card>

        <Card class="md:col-span-2 xl:col-span-3 xl:row-span-2">
          <CardTitle action={<a href="/work/orders" class="text-sm text-c3">Board →</a>}>Live orders ({live.length})</CardTitle>
          <div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {live.map((o, i) => <div key={o.id} class={i >= 4 ? "hidden sm:block" : ""}><OrderCard inset o={o} onOpen={setOpen} /></div>)}
          </div>
          <a href="/work/orders" class="sm:hidden mt-3 h-10 rounded-full border border-c4 flex items-center justify-center text-sm font-medium">See all {live.length} orders</a>
          <div class="hidden">
          </div>
        </Card>
        <Card>
          <CardTitle action={<a href="/work/production" class="text-sm text-c3">All →</a>}>Jobs today</CardTitle>
          <ul class="flex flex-col gap-2.5 text-sm">
            {db.jobs.map((j) => (
              <li key={j.id} class="flex justify-between gap-2">
                <span class="min-w-0"><span class="font-medium block break-words">{j.item}</span><span class="text-c3">{j.orderNo} · {j.printer}</span></span>
                <Status tone={jobTone(j.status)}>{j.status}</Status>
              </li>
            ))}
          </ul>
        </Card>
        <Card>
          <CardTitle action={<a href="/todo" class="text-sm text-c3">All →</a>}>Floor to-do</CardTitle>
          <ul class="flex flex-col gap-2.5 text-sm">
            {tasks.map((t) => (
              <li key={t.id} class="min-w-0">
                <span class="font-medium block break-words">{t.title}</span>
                <span class="text-c3 text-xs">{t.who} · {shortDate(t.due)}{t.link ? ` · ${t.link.ref}` : ""}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
      <OrderDrawer order={open} onClose={() => setOpen(null)} onOpen={setOpen} />
    </WorkShell>
  );
}
