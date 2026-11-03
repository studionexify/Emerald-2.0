import { useState } from "preact/hooks";
import { Card, CardTitle, Stat, Status } from "../../ui";
import { Ring } from "../../charts";
import { db, ordersSig, STAGES, type Order } from "../../data";
import { OrderCard, OrderDrawer, TypeChips, WorkShell, type TypeFilter } from "./shared";

export default function Overview() {
  const [f, setF] = useState<TypeFilter>("all");
  const [open, setOpen] = useState<Order | null>(null);
  const list = ordersSig.value.filter((o) => f === "all" || o.type === f);
  const live = list.filter((o) => o.stage !== "archived");
  const busy = db.printers.filter((p) => p.status === "printing").length;
  return (
    <WorkShell title="Work Area" sub="Everything on the floor, in one place">
      <div class="mb-4"><TypeChips value={f} onChange={setF} /></div>
      <div class="grid gap-4 lg:grid-cols-3">
        <Card dark class="lg:col-span-2">
          <CardTitle>Overall</CardTitle>
          <div class="grid grid-cols-3 sm:grid-cols-6 gap-2">
            {STAGES.map((s) => <Stat dark key={s.key} value={list.filter((o) => o.stage === s.key).length} label={s.label} />)}
          </div>
        </Card>
        <Card class="flex items-center gap-5">
          <Ring value={Math.round((busy / db.printers.length) * 100)} label="printers busy" size={120} />
          <ul class="text-sm flex flex-col gap-2">
            {db.printers.map((p) => (
              <li key={p.id}><Status tone={p.status === "printing" ? "active" : p.status === "down" ? "blocked" : "idle"}>{p.name} · {p.status}</Status></li>
            ))}
          </ul>
        </Card>
        <Card class="lg:col-span-2">
          <CardTitle action={<a href="/work/orders" class="text-sm text-c3">Board →</a>}>Live orders ({live.length})</CardTitle>
          <div class="grid sm:grid-cols-2 gap-3">
            {live.map((o) => <div key={o.id} class="bg-c1 rounded-2xl p-1"><OrderCard o={o} onOpen={setOpen} /></div>)}
          </div>
        </Card>
        <Card>
          <CardTitle action={<a href="/work/production" class="text-sm text-c3">All →</a>}>Jobs today</CardTitle>
          <ul class="flex flex-col gap-3 text-sm">
            {db.jobs.map((j) => (
              <li key={j.id} class="flex justify-between gap-2">
                <span><span class="font-medium block">{j.item}</span><span class="text-c3">{j.orderNo} · {j.printer}</span></span>
                <Status tone={j.status === "done" ? "done" : j.status === "printing" ? "active" : j.status === "failed" ? "blocked" : "waiting"}>{j.status}</Status>
              </li>
            ))}
          </ul>
        </Card>
      </div>
      <OrderDrawer order={open} onClose={() => setOpen(null)} onOpen={setOpen} />
    </WorkShell>
  );
}
