import { useState } from "preact/hooks";
import { Card, CardTitle, Section, Stat, Status } from "../../ui";
import { Ring } from "../../charts";
import { ordersSig, shortDate, STAGES, type Order , printersSig, jobsSig, tasksSig } from "../../data";
import { OrderCard, OrderDetail, TypeChips, WorkShell, type TypeFilter } from "./shared";

const jobTone = (s: string) => (s === "done" ? "done" : s === "printing" ? "active" : s === "failed" ? "blocked" : "waiting") as "done";

export default function Overview() {
  const [f, setF] = useState<TypeFilter>("all");
  const [open, setOpen] = useState<Order | null>(null);
  const list = ordersSig.value.filter((o) => f === "all" || o.type === f);
  const live = list.filter((o) => o.stage !== "archived");
  const busy = printersSig.value.filter((p) => p.active !== false).filter((p) => p.status === "printing").length;
  const tasks = tasksSig.value.filter((t) => !t.done);
  return (
    <WorkShell detail={open && <OrderDetail order={ordersSig.value.find((o) => o.id === open.id) ?? open} onClose={() => setOpen(null)} onOpen={setOpen} />} title="Production" sub="Everything on the floor, in one place" toolbar={<TypeChips value={f} onChange={setF} />}>
      <Section title="Pipeline" note={`${live.length} live`}>
        <div class="grid gap-3 md:grid-cols-2 xl:grid-cols-[3fr_1fr]">
          <Card dark class="md:col-span-2 xl:col-span-1">
            <CardTitle>Orders by stage</CardTitle>
            <div class="grid grid-cols-4 md:grid-cols-8 gap-2 md:gap-2">
              {STAGES.map((s) => (
                <a key={s.key} href="/work/orders"><Stat dark value={list.filter((o) => o.stage === s.key).length} label={s.label} /></a>
              ))}
            </div>
          </Card>
          <Card class="flex items-center gap-4 md:col-span-2 xl:col-span-1">
            <Ring value={Math.round((busy / printersSig.value.filter((p) => p.active !== false).length) * 100)} label="busy" size={104} />
            <ul class="text-sm flex-1 grid gap-2 md:grid-cols-3 xl:grid-cols-1 min-w-0">
              {printersSig.value.filter((p) => p.active !== false).map((p) => (
                <li key={p.id}><Status tone={p.status === "printing" ? "active" : p.status === "down" ? "blocked" : "idle"}>{p.name} · {p.status}</Status></li>
              ))}
            </ul>
          </Card>
        </div>
      </Section>

      <div class="grid gap-5 xl:grid-cols-[3fr_1fr]">
        <Section title="Live orders" note={String(live.length)} action={<a href="/work/orders" class="text-sm text-c3 whitespace-nowrap">Board →</a>}>
          <div class="grid sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-2">
            {live.map((o, i) => <div key={o.id} class={i >= 4 ? "hidden sm:block" : ""}><OrderCard o={o} onOpen={setOpen} /></div>)}
          </div>
          <a href="/work/orders" class="sm:hidden h-10 rounded-full border border-c4 flex items-center justify-center text-sm font-medium">See all {live.length} orders</a>
        </Section>
        <Section title="Floor today">
          <div class="grid gap-3 md:grid-cols-2 xl:grid-cols-1">
            <Card>
              <CardTitle action={<a href="/work/production" class="text-sm text-c3">All →</a>}>Jobs</CardTitle>
              <ul class="flex flex-col gap-2.5 text-sm">
                {jobsSig.value.map((j) => (
                  <li key={j.id} class="flex justify-between gap-2">
                    <span class="min-w-0"><span class="font-medium block">{j.item}</span><span class="text-c3">{j.orderNo} · {j.printer}</span></span>
                    <Status tone={jobTone(j.status)}>{j.status}</Status>
                  </li>
                ))}
              </ul>
            </Card>
            <Card>
              <CardTitle action={<a href="/todo" class="text-sm text-c3">All →</a>}>To-do</CardTitle>
              <ul class="flex flex-col gap-2.5 text-sm">
                {tasks.map((t) => (
                  <li key={t.id} class="min-w-0">
                    <span class="font-medium block">{t.title}</span>
                    <span class="text-c3 text-xs">{t.who} · {shortDate(t.due)}{t.link ? ` · ${t.link.ref}` : ""}</span>
                  </li>
                ))}
              </ul>
            </Card>
          </div>
        </Section>
      </div>
    </WorkShell>
  );
}
