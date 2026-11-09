import { useState } from "preact/hooks";
import type { ComponentChildren } from "preact";
import { Card, Icon, KV, Page, Section, Status, Waterfall } from "../ui";
import { Initials, StageStrip } from "../ui/stage-strip";
import { navigate } from "../router";
import { openOrderSig, segmentOf, SEGMENT_HREF, SEGMENT_LABEL, type Segment } from "../data/inventory";
import { STAGES } from "../data";
import { financeSummary, moneySig, windowFor, attention as attn, batchesSig, inr, logsSig, ordersSig, packSig, spoolsSig, orderCost, orderTotal, shortDate, printersSig, tasksSig, can } from "../data";

export default function Dashboard() {
  const open = ordersSig.value.filter((o) => o.stage !== "archived");
  const paid = open.filter((o) => o.type !== "inhouse");
  const pipeline = paid.reduce((s, o) => s + orderTotal(o), 0);
  const margin = Math.round((1 - paid.reduce((s, o) => s + orderCost(o), 0) / pipeline) * 100);
  const al = attn(ordersSig.value, spoolsSig.value, packSig.value, batchesSig.value);
  const fm = financeSummary(windowFor("mtd", "2026-27"), ordersSig.value);
  const week = Array.from({ length: 7 }, (_, i) => { const d = new Date(Date.now() - (6 - i) * 864e5).toISOString().slice(0, 10); return { l: new Date(d).toLocaleDateString("en-IN", { weekday: "narrow" }), v: moneySig.value.filter((m) => m.date === d && !m.kind.startsWith("transfer")).reduce((s, m) => s + m.amount, 0) }; });
  const money = can("mauny");
  const today = new Date().toISOString().slice(0, 10);
  const late = open.filter((o) => o.due && o.due < today);
  const machines = printersSig.value.filter((p) => p.active !== false);
  const busy = machines.filter((p) => p.status === "printing");
  const down = machines.filter((p) => p.status === "down").length;
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
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
        <Tile href="/work/orders" icon="box" label="Open orders" value={open.length} caption={money ? `${inr(pipeline)} in the pipeline · ${margin}% margin` : `${open.length - paid.length} in-house`} />
        <Tile href="/work/production" icon="printer" label="Printing now" value={busy.length} caption={`${machines.length - busy.length - down} idle · ${down} down · ${machines.length} machines`} live={busy.length > 0} />
        <Tile href="/work/orders" icon="alert" label="Past due" value={late.length} caption={late.length ? `Oldest ${shortDate([...late].sort((a, b) => a.due.localeCompare(b.due))[0].due)}` : "Everything on time"} />
        {money
          ? <Tile href="/mauny/finance" icon="trend" label="Net profit · month" value={inr(fm.earned - fm.spent)} caption="Earned less spent, month to date" />
          : <Tile href="/todo" icon="check" label="To-do" value={todo.length} caption="Open tasks" />}
      </div>

      <Section title="Pipeline" action={<a href="/work" class="t-meta">Production →</a>}>
        <StageStrip orders={ordersSig.value} showValue={can("mauny")} />
      </Section>

      <Section title="Production by segment">
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {(["client", "bulk", "inhouse"] as Segment[]).map((g) => { const l = open.filter((o) => segmentOf(o) === g), lt = l.filter((o) => o.due && o.due < today).length;
            return (
              <a key={g} href={SEGMENT_HREF[g]} class="rounded-[var(--radius-card)] bg-c0 border border-line p-4 hover:ring-1 hover:ring-c2 min-w-0">
                <div class="flex items-center justify-between gap-2"><span class="text-[15px] font-bold text-c4">{SEGMENT_LABEL[g]}</span><span class="t-meta">Open →</span></div>
                <div class="flex items-baseline gap-3 mt-1"><span class="num text-[26px] font-semibold leading-none">{l.length}</span><span class="t-meta">live{lt ? <b class="text-warn"> · {lt} late</b> : ""}</span></div>
                <div class="flex flex-wrap gap-1 mt-2">{STAGES.filter((s) => l.some((o) => o.stage === s.key)).map((s) => <span key={s.key} class="text-[11px] font-medium bg-c1 rounded-full px-2 h-5 leading-5">{s.label} {l.filter((o) => o.stage === s.key).length}</span>)}{!l.length && <span class="t-meta">Nothing in progress</span>}</div>
              </a>); })}
        </div>
      </Section>

      <Waterfall min={360} max={4} items={[
        [2 + Math.min(feed.length, 8) * 0.6, <div key="a"><Section title="Action center" note={`${all.length} items`} action={<a href="/alerts" class="t-meta whitespace-nowrap">All →</a>}>
          <div class="rounded-[var(--radius-card)] bg-c0 border border-line overflow-hidden">
            <div class="flex items-center gap-0.5 p-1 m-2 rounded-lg bg-c1 w-fit" role="tablist">
              {SEV.map(([k, l]) => { const c = all.filter((x) => x.t === k).length; return (
                <button key={k} role="tab" aria-selected={sev === k} onClick={() => setSev(k)} class={`h-7 px-3 rounded-md text-xs inline-flex items-center gap-1.5 cursor-pointer ${sev === k ? "bg-c0 text-c4 font-semibold shadow-sm" : "text-c3 font-medium"}`}>
                  {k === "danger" && <span class="w-1.5 h-1.5 rounded-full bg-warn" />}{l}<span class="num text-c2">{c}</span>
                </button>); })}
            </div>
            {feed.length ? feed.slice(0, 8).map((x, i) => (
              <a key={i} href={x.href} class="flex items-center gap-3 min-h-9 py-1.5 px-3 border-t border-line hover:bg-c1/60 min-w-0">
                <span class={`w-1.5 h-1.5 rounded-full shrink-0 ${x.t === "danger" ? "bg-warn" : x.t === "warn" ? "bg-c4" : "bg-c2"}`} />
                <span class="text-[13px] min-w-0 truncate flex-1">{x.text}</span>
                <span class="t-meta whitespace-nowrap">{x.g}</span>
              </a>
            )) : <p class="t-meta px-3 py-3 border-t border-line">Nothing here.</p>}
            {feed.length > 8 && <a href="/alerts" class="block h-9 leading-9 px-3 border-t border-line t-meta">+{feed.length - 8} more</a>}
          </div>
        </Section></div>],
        [1 + machines.length * 0.7, <div key="m"><Section title="Machines" action={<a href="/workshop/printers" class="t-meta">Printers →</a>}>
          <Card>
            {machines.length ? <div class="flex flex-col gap-3">{machines.map((p) => (
              <a key={p.id} href="/workshop/printers" class="flex items-center gap-3 min-w-0 -mx-2 px-2 py-1 rounded-xl hover:bg-c1">
                <span class={`w-9 h-9 shrink-0 rounded-full flex items-center justify-center ${p.status === "printing" ? "bg-lime text-black" : "bg-c1 text-c2"}`}><Icon name={p.status === "down" ? "wrench" : "printer"} size={16} /></span>
                <div class="min-w-0 flex-1">
                  <div class="flex items-baseline justify-between gap-2"><span class="font-semibold truncate">{p.name}</span><Status tone={p.status === "printing" ? "active" : p.status === "down" ? "blocked" : "idle"}>{p.status}</Status></div>
                  <div class="t-meta truncate num">{p.model}{p.job ? ` · ${p.job}` : ""} · {p.hours}h</div>
                </div>
              </a>))}</div> : <p class="t-meta">No printers yet.</p>}
          </Card>
        </Section></div>],
        [2.5, <div key="f"><Section title="Money flow" action={<a href="/mauny/finance" class="t-meta">Finance →</a>}>
          <Card>
            <div class="flex items-end justify-between gap-3">
              <div><div class="t-meta">Net this week</div><div class="num text-[22px] font-semibold leading-tight">{inr(wk)}</div></div>
              <svg viewBox="0 0 100 22" class="w-28 h-8 text-c4" preserveAspectRatio="none" aria-hidden="true"><polyline points={spark} fill="none" stroke="currentColor" stroke-width="1.5" vector-effect="non-scaling-stroke" /></svg>
            </div>
            <a href="/mauny/finance" class="block mt-2 -mx-2 px-2 rounded-xl hover:bg-c1">
              <KV label={<span class="inline-flex items-center gap-1.5"><Icon name="cash" size={13} />Earned · month</span>} value={inr(fm.earned)} />
              <KV label={<span class="inline-flex items-center gap-1.5"><Icon name="wallet" size={13} />Spent · month</span>} value={inr(fm.spent)} />
            </a>
          </Card>
        </Section></div>],
        [1 + dueSoon.length * 0.7, <div key="d"><Section title="Due soonest" action={<a href="/work/orders" class="t-meta">All →</a>}>
          <Card class="!py-1">{dueSoon.map((o) => <Go key={o.id} onClick={() => goOrder(o.no)}><KV label={<span class="flex items-center gap-2.5 min-w-0"><Initials name={o.customer} /><span class="min-w-0"><span class="block truncate font-semibold text-c4">{o.customer}</span><span class="block font-mono text-[11px] text-c2">{o.no}</span></span></span>} value={shortDate(o.due)} /></Go>)}</Card>
        </Section></div>],
        [1 + Math.max(1, Math.min(todo.length, 5)) * 0.6, <div key="t"><Section title="To-do" note={money ? String(todo.length) : undefined} action={<a href="/todo" class="t-meta">All →</a>}>
          <Card class="!py-1">{!todo.length && <p class="t-meta py-2">No open tasks.</p>}{todo.slice(0, 5).map((t) => <Go key={t.id} href="/todo"><KV label={t.title} value={<span class="t-meta">{t.who}{t.due ? ` · ${shortDate(t.due)}` : ""}</span>} /></Go>)}</Card>
        </Section></div>],
        [1 + Math.max(1, Math.min(logsSig.value.length, 5)) * 0.6, <div key="r"><Section title="Recent activity" action={<a href="/logs" class="t-meta">Logs →</a>}>
        <Card class="!py-1">{!logsSig.value.length && <p class="t-meta py-2">Nothing logged yet.</p>}{logsSig.value.slice(0, 5).map((l) => <Go key={l.id} href="/logs"><KV label={<span><b class="text-c4">{l.who}</b> {l.action.toLowerCase()} · {l.target}</span>} value={<span class="t-meta">{l.at.slice(11)}</span>} /></Go>)}</Card>
      </Section></div>],
      ]} />
    </Page>
  );
}

/** Open an order on its production page. */
const goOrder = (no: string) => { const o = ordersSig.value.find((x) => x.no === no); if (!o) return; openOrderSig.value = no; navigate(SEGMENT_HREF[segmentOf(o)]); };
function Go({ href, onClick, children }: { href?: string; onClick?: () => void; children: ComponentChildren }) {
  return href ? <a href={href} class="block -mx-2 px-2 rounded-lg hover:bg-c1">{children}</a> : <button onClick={onClick} class="block w-[calc(100%+16px)] text-left -mx-2 px-2 rounded-lg hover:bg-c1 cursor-pointer !min-h-0">{children}</button>;
}

function Tile({ href, icon, label, value, caption, live }: { href: string; icon: string; label: string; value: ComponentChildren; caption: string; live?: boolean }) {
  return (
    <a href={href} class="flex flex-col justify-between gap-4 rounded-[var(--radius-card)] bg-c0 p-3 md:p-4 min-w-0 hover:ring-1 hover:ring-line">
      <span class="inline-flex w-max max-w-full items-center gap-2 rounded-full bg-c1 py-1 pl-1 pr-3 text-[12px] font-semibold text-c3">
        <span class="w-6 h-6 shrink-0 rounded-full bg-black text-lime flex items-center justify-center"><Icon name={icon} size={13} /></span>
        {live && <span aria-hidden="true" class="w-2 h-2 shrink-0 rounded-full bg-lime animate-pulse" />}
        <span class="truncate">{label}</span>
      </span>
      <span>
        <span class="num block text-[26px] md:text-[32px] leading-none font-semibold tracking-[-0.03em]">{value}</span>
        <span class="num t-meta block mt-1.5 truncate">{caption}</span>
      </span>
    </a>
  );
}
