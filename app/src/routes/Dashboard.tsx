import { Bars } from "../charts";
import { Card, CardTitle, Icon, PageHead, Stat, Status } from "../ui";
import { db, inr, orderTotal, STAGES } from "../data";

export default function Dashboard() {
  const open = db.orders.filter((o) => o.stage !== "archived");
  const blocked = db.orders.filter((o) => o.blocked);
  const pipeline = open.filter((o) => o.type !== "inhouse").reduce((s, o) => s + orderTotal(o), 0);
  const todo = db.tasks.filter((t) => !t.done);
  return (
    <>
      <PageHead title="Hi, Studio Nexify" sub="Tuesday, 3 November" />
      <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Card dark>
          <CardTitle>Work in progress</CardTitle>
          <div class="flex items-end gap-6 mb-5">
            <div><div class="num text-5xl font-semibold">{open.length}</div><div class="text-sm opacity-80">open orders</div></div>
            <div><div class="num text-3xl font-semibold">{inr(pipeline)}</div><div class="text-sm opacity-80">in pipeline</div></div>
          </div>
          <div class="grid grid-cols-3 gap-2">
            <Stat dark value={db.jobs.filter((j) => j.status === "printing").length} label="Printing" />
            <Stat dark value={db.orders.filter((o) => o.stage === "qc").length} label="In QC" />
            <Stat dark value={blocked.length} label="Blocked" />
          </div>
        </Card>
        <Card>
          <CardTitle action={<a href="/mauny" class="text-sm text-c3">Mauny →</a>}>Money this week</CardTitle>
          <Bars data={[4200, -1800, 6100, 2097, -6250, 25000, -380]} labels={["M", "T", "W", "T", "F", "S", "S"]} />
        </Card>
        <Card>
          <CardTitle>Needs attention</CardTitle>
          <ul class="flex flex-col gap-3">
            {blocked.map((o) => (
              <li key={o.id}><a href="/work/orders" class="flex items-start gap-3">
                <span class="w-9 h-9 shrink-0 rounded-full bg-c4 text-c0 flex items-center justify-center"><Icon name="bell" size={16} /></span>
                <span class="text-sm"><span class="font-semibold block">{o.no} · {o.customer}</span><span class="text-c3">{o.blocked}</span></span>
              </a></li>
            ))}
            {db.packStock.filter((p) => p.qty <= p.reorderAt).map((p) => (
              <li key={p.id} class="flex items-start gap-3 text-sm">
                <span class="w-9 h-9 shrink-0 rounded-full bg-c1 flex items-center justify-center"><Icon name="box" size={16} /></span>
                <span><span class="font-semibold block">Low stock · {p.name}</span><span class="text-c3">{p.qty} {p.unit} left, reorder at {p.reorderAt}</span></span>
              </li>
            ))}
          </ul>
        </Card>
        <Card class="xl:col-span-2">
          <CardTitle action={<a href="/work" class="text-sm text-c3">Work Area →</a>}>Stages</CardTitle>
          <div class="grid grid-cols-3 sm:grid-cols-6 gap-2">
            {STAGES.map((s) => <Stat key={s.key} value={db.orders.filter((o) => o.stage === s.key).length} label={s.label} />)}
          </div>
        </Card>
        <Card>
          <CardTitle action={<a href="/todo" class="text-sm text-c3">All →</a>}>To-do today</CardTitle>
          <ul class="flex flex-col gap-2">
            {todo.slice(0, 4).map((t) => (
              <li key={t.id} class="text-sm flex items-center justify-between gap-2">
                <span>{t.title}</span>
                {t.link && <Status tone="waiting">{t.link.ref}</Status>}
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  );
}
