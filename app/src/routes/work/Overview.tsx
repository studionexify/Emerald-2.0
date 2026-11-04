import { useState } from "preact/hooks";
import { Card, Section, Status, KV } from "../../ui";
import { TYPE_LABEL, inr, orderTotal, ordersSig, shortDate, STAGES, type Order, printersSig, jobsSig, tasksSig, today } from "../../data";
import { OrderDetail, TypeChips, WorkShell, type TypeFilter } from "./shared";

const jobTone = (s: string) => (s === "done" ? "done" : s === "printing" ? "active" : s === "failed" ? "blocked" : "waiting") as "done";
const PAGE = 25;

/** Pipeline tracker: one segmented strip, each stage a count + share bar. */
function StageStrip({ list }: { list: Order[] }) {
  const live = list.filter((o) => o.stage !== "archived");
  const max = Math.max(1, ...STAGES.map((s) => list.filter((o) => o.stage === s.key).length));
  return (
    <div class="grid grid-cols-4 md:grid-cols-8 rounded-[var(--radius-card)] bg-c0 border border-line overflow-hidden divide-x divide-line">
      {STAGES.map((s) => {
        const n = list.filter((o) => o.stage === s.key).length;
        return (
          <a key={s.key} href="/work/orders" class="px-3 py-2 min-w-0 hover:bg-c1/60 border-line max-md:[&:nth-child(n+5)]:border-t">
            <div class="t-meta truncate">{s.label}</div>
            <div class="num text-[17px] font-semibold leading-tight">{n}</div>
            <div class="mt-1.5 h-1 rounded-full bg-c1 overflow-hidden"><div class="h-full bg-c4 rounded-full" style={{ width: `${(n / max) * 100}%` }} /></div>
          </a>
        );
      })}
      <span class="sr-only">{live.length} live orders</span>
    </div>
  );
}

/** Dense order row: ID + client | item | due/status | price. */
function OrderRow({ o, onOpen }: { o: Order; onOpen: (o: Order) => void }) {
  const late = o.due && o.due < today();
  return (
    <button onClick={() => onOpen(o)} class="w-full text-left grid grid-cols-[1fr_auto] md:grid-cols-[minmax(0,1.3fr)_minmax(0,1.6fr)_170px_96px] items-center gap-x-4 gap-y-0.5 h-auto md:h-10 py-2 md:py-0 px-3 border-t border-line first:border-0 hover:bg-c1/60 cursor-pointer min-w-0">
      <span class="min-w-0 truncate"><span class="font-mono text-[12px] font-bold mr-2">{o.no}</span><span class="text-[13px] font-medium">{o.customer}</span></span>
      <span class="hidden md:block min-w-0 truncate text-[13px] text-c3">{o.items.map((i) => `${i.name}${i.qty > 1 ? ` ×${i.qty}` : ""}`).join(", ")}</span>
      <span class="flex items-center gap-2 justify-end whitespace-nowrap text-[11px]">
        {o.blocked ? <span class="inline-flex items-center gap-1 px-1.5 h-5 rounded bg-warn/15 text-c4 font-semibold"><span class="w-1.5 h-1.5 rounded-full bg-warn" />Blocked</span>
          : <span class={`px-1.5 h-5 inline-flex items-center rounded bg-c1 ${late ? "font-semibold" : "text-c3"}`}>{late ? "Late · " : ""}{shortDate(o.due)}</span>}
        <span class="hidden lg:inline text-c2">{TYPE_LABEL[o.type]}</span>
      </span>
      <span class="hidden md:block num text-[13px] text-right">{o.type === "inhouse" ? "—" : inr(orderTotal(o))}</span>
    </button>
  );
}

export default function Overview() {
  const [f, setF] = useState<TypeFilter>("all");
  const [open, setOpen] = useState<Order | null>(null);
  const [n, setN] = useState(PAGE);
  const list = ordersSig.value.filter((o) => f === "all" || o.type === f);
  const live = list.filter((o) => o.stage !== "archived").sort((a, b) => Number(!!b.blocked) - Number(!!a.blocked) || a.due.localeCompare(b.due));
  const fleet = printersSig.value.filter((p) => p.active !== false);
  const busy = fleet.filter((p) => p.status === "printing").length;
  const tasks = tasksSig.value.filter((t) => !t.done);
  return (
    <WorkShell detail={open && <OrderDetail order={ordersSig.value.find((o) => o.id === open.id) ?? open} onClose={() => setOpen(null)} onOpen={setOpen} />} title="Production" sub="Everything on the floor, in one place" toolbar={<TypeChips value={f} onChange={setF} />}>
      <Section title="Pipeline" note={`${live.length} live`}><StageStrip list={list} /></Section>

      <div class="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px] items-start">
        <Section title="Live orders" note={String(live.length)} action={<a href="/work/orders" class="t-meta whitespace-nowrap">Board →</a>}>
          <div class="rounded-[var(--radius-card)] bg-c0 border border-line overflow-hidden">
            <div class="hidden md:grid grid-cols-[minmax(0,1.3fr)_minmax(0,1.6fr)_auto_96px] gap-x-4 px-3 h-7 items-center border-b border-line t-meta uppercase tracking-[0.06em]"><span>Order · client</span><span>Items</span><span class="text-right">Due</span><span class="text-right">Price</span></div>
            {live.slice(0, n).map((o) => <OrderRow key={o.id} o={o} onOpen={setOpen} />)}
            {live.length > n && <button onClick={() => setN(n + PAGE)} class="w-full h-9 border-t border-line text-[13px] font-medium text-c3 hover:bg-c1/60 cursor-pointer">Show {Math.min(PAGE, live.length - n)} more</button>}
          </div>
        </Section>

        <div class="flex flex-col gap-4 min-w-0">
          <Section title="Machine fleet" note={`${busy}/${fleet.length} busy`} action={<a href="/workshop" class="t-meta">All →</a>}>
            <div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-1 gap-2">
              {fleet.map((p) => {
                const j = jobsSig.value.find((x) => x.printer === p.name && x.status === "printing");
                return (
                  <a key={p.id} href="/work/production" class="rounded-[10px] bg-c0 border border-line px-3 py-2 min-w-0 block hover:bg-c1/40">
                    <div class="flex items-center justify-between gap-2">
                      <span class="font-mono text-[12px] font-bold truncate">{p.name}</span>
                      <Status tone={p.status === "printing" ? "active" : p.status === "down" ? "blocked" : "idle"}>{p.status}</Status>
                    </div>
                    <div class="text-[13px] text-c3 truncate mt-0.5">{j ? j.item : p.job ?? p.model}</div>
                    {j && <div class="t-meta mt-0.5 num">{j.orderNo} · {j.hours} h job · {j.grams} g</div>}
                  </a>
                );
              })}
            </div>
          </Section>
          <Section title="Queue" note={String(jobsSig.value.filter((j) => j.status === "queued").length)}>
            <Card class="!py-1">
              {jobsSig.value.filter((j) => j.status !== "done").slice(0, 6).map((j) => <KV key={j.id} label={<span>{j.item} <span class="t-meta">· {j.printer}</span></span>} value={<Status tone={jobTone(j.status)}>{j.status}</Status>} />)}
            </Card>
          </Section>
          <Section title="To-do" note={String(tasks.length)} action={<a href="/todo" class="t-meta">All →</a>}>
            <Card class="!py-1">{tasks.slice(0, 5).map((t) => <KV key={t.id} label={t.title} value={<span class="t-meta">{t.who} · {shortDate(t.due)}</span>} />)}</Card>
          </Section>
        </div>
      </div>
    </WorkShell>
  );
}
