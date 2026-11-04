import { useState } from "preact/hooks";
import { Card, KV, Page, Section, Stat, Status } from "../ui";
import { financeSummary, moneySig, windowFor, attention as attn, batchesSig, inr, logsSig, ordersSig, packSig, spoolsSig, orderCost, orderTotal, shortDate, STAGES , printersSig, tasksSig } from "../data";

export default function Dashboard() {
  const open = ordersSig.value.filter((o) => o.stage !== "archived");
  const paid = open.filter((o) => o.type !== "inhouse");
  const pipeline = paid.reduce((s, o) => s + orderTotal(o), 0);
  const margin = Math.round((1 - paid.reduce((s, o) => s + orderCost(o), 0) / pipeline) * 100);
  const al = attn(ordersSig.value, spoolsSig.value, packSig.value, batchesSig.value);
  const fm = financeSummary(windowFor("mtd", "2026-27"), ordersSig.value);
  const week = Array.from({ length: 7 }, (_, i) => { const d = new Date(Date.now() - (6 - i) * 864e5).toISOString().slice(0, 10); return { l: new Date(d).toLocaleDateString("en-IN", { weekday: "narrow" }), v: moneySig.value.filter((m) => m.date === d && !m.kind.startsWith("transfer")).reduce((s, m) => s + m.amount, 0) }; });
  const todo = tasksSig.value.filter((t) => !t.done);
  const dueSoon = [...open].sort((a, b) => a.due.localeCompare(b.due)).slice(0, 5);
  const all = Object.entries(al).flatMap(([g, list]) => list.map((a) => ({ ...a, g })));
  const SEV = [["danger", "Critical"], ["warn", "Action required"], ["info", "Upcoming"]] as const;
  const [sev, setSev] = useState<"danger" | "warn" | "info">(all.some((x) => x.t === "danger") ? "danger" : "warn");
  const feed = all.filter((x) => x.t === sev);
  const wk = week.reduce((s, d) => s + d.v, 0);
  const mx = Math.max(1, ...week.map((d) => Math.abs(d.v)));
  const spark = week.map((d, i) => `${(i / 6) * 100},${20 - (d.v / mx) * 18}`).join(" ");
  return (
    <Page title="Hi, Studio Nexify" sub={new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })}>
      <div class="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px] items-start">
        <Section title="Action center" note={`${all.length} items`} action={<a href="/alerts" class="t-meta whitespace-nowrap">All →</a>}>
          <div class="rounded-[var(--radius-card)] bg-c0 border border-line overflow-hidden">
            <div class="flex items-center gap-0.5 p-1 m-2 rounded-lg bg-c1 w-fit" role="tablist">
              {SEV.map(([k, l]) => { const c = all.filter((x) => x.t === k).length; return (
                <button key={k} role="tab" aria-selected={sev === k} onClick={() => setSev(k)} class={`h-7 px-3 rounded-md text-xs inline-flex items-center gap-1.5 cursor-pointer ${sev === k ? "bg-c0 text-c4 font-semibold shadow-sm" : "text-c3 font-medium"}`}>
                  {k === "danger" && <span class="w-1.5 h-1.5 rounded-full bg-warn" />}{l}<span class="num text-c2">{c}</span>
                </button>); })}
            </div>
            {feed.length ? feed.slice(0, 8).map((x, i) => (
              <a key={i} href={x.href} class="flex items-center gap-3 h-9 px-3 border-t border-line hover:bg-c1/60 min-w-0">
                <span class={`w-1.5 h-1.5 rounded-full shrink-0 ${x.t === "danger" ? "bg-warn" : x.t === "warn" ? "bg-c4" : "bg-c2"}`} />
                <span class="text-[13px] min-w-0 truncate flex-1">{x.text}</span>
                <span class="t-meta whitespace-nowrap">{x.g}</span>
              </a>
            )) : <p class="t-meta px-3 py-3 border-t border-line">Nothing here.</p>}
            {feed.length > 8 && <a href="/alerts" class="block h-9 leading-9 px-3 border-t border-line t-meta">+{feed.length - 8} more</a>}
          </div>
        </Section>
        <Section title="Money flow" action={<a href="/mauny/finance" class="t-meta">Finance →</a>}>
          <Card>
            <div class="flex items-end justify-between gap-3">
              <div><div class="t-meta">Net this week</div><div class="num text-[22px] font-semibold leading-tight">{inr(wk)}</div></div>
              <svg viewBox="0 0 100 22" class="w-28 h-8 text-c4" preserveAspectRatio="none" aria-hidden="true"><polyline points={spark} fill="none" stroke="currentColor" stroke-width="1.5" vector-effect="non-scaling-stroke" /></svg>
            </div>
            <div class="mt-2">
              <KV label="Earned · month" value={inr(fm.earned)} />
              <KV label="Spent · month" value={inr(fm.spent)} />
              <KV label="Net profit" value={inr(fm.earned - fm.spent)} strong />
              <KV label="Pipeline" value={inr(pipeline)} />
              <KV label="Pipeline margin" value={`${margin}%`} />
            </div>
          </Card>
        </Section>
      </div>

      <Section title="Pipeline" note={`${open.length} open`} action={<a href="/work" class="t-meta">Production →</a>}>
        <div class="grid grid-cols-4 md:grid-cols-8 gap-2">
          {STAGES.map((s) => <Stat key={s.key} value={ordersSig.value.filter((o) => o.stage === s.key).length} label={s.label} />)}
        </div>
      </Section>

      <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-3 items-start">
        <Section title="Due soonest" action={<a href="/work/orders" class="t-meta">All →</a>}>
          <Card class="!py-1">{dueSoon.map((o) => <KV key={o.id} label={<span><span class="font-mono text-[12px] font-bold text-c4 mr-1.5">{o.no}</span>{o.customer}</span>} value={shortDate(o.due)} />)}</Card>
        </Section>
        <Section title="To-do" note={String(todo.length)} action={<a href="/todo" class="t-meta">All →</a>}>
          <Card class="!py-1">{todo.slice(0, 5).map((t) => <KV key={t.id} label={t.title} value={<span class="t-meta">{t.who} · {shortDate(t.due)}</span>} />)}</Card>
        </Section>
        <Section title="Floor" note={`${printersSig.value.filter((p) => p.active !== false && p.status === "printing").length} busy`} action={<a href="/work/production" class="t-meta">Jobs →</a>}>
          <Card class="!py-1">{printersSig.value.filter((p) => p.active !== false).map((p) => <KV key={p.id} label={<span><span class="font-mono text-[12px] font-bold text-c4 mr-1.5">{p.name}</span>{p.job ?? ""}</span>} value={<Status tone={p.status === "printing" ? "active" : p.status === "down" ? "blocked" : "idle"}>{p.status}</Status>} />)}</Card>
        </Section>
      </div>

      <Section title="Recent activity" action={<a href="/logs" class="t-meta">Logs →</a>}>
        <Card class="!py-1">{logsSig.value.slice(0, 5).map((l) => <KV key={l.id} label={<span><b class="text-c4">{l.who}</b> {l.action.toLowerCase()} · {l.target}</span>} value={<span class="t-meta">{l.at.slice(11)}</span>} />)}</Card>
      </Section>
    </Page>
  );
}
