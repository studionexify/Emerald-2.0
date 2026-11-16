/** Filament stock drawer for the production screens: free stock per colour, need vs available for the open order, and what can be printed now. */
import { useState } from "preact/hooks";
import { shortDate, ordersSig, batchesSig, jobsSig, spoolsSig, printersSig, filMasterSig, jobSpool, lineProgress, patchOrder, vOrders, type Order } from "../../data";
import { colourHex } from "../../data/floor";
import { allocate, buildDemand, freeMap, orderNeed, printerPlans, stockFor, type Demand, type GSrc, type Mode, type PlanRow } from "../../data/stockPlan";

const Sq = ({ colour }: { colour: string }) => <span class="w-3.5 h-3.5 shrink-0 inline-block rounded-[4px] shadow-[inset_0_0_0_1px_rgb(128_128_128/0.7)]" style={{ background: colourHex(colour) || "repeating-linear-gradient(45deg,var(--c-2) 0 3px,var(--c-1) 3px 6px)" }} />;
const g = (n: number) => (Math.abs(n) >= 1000 ? `${(n / 1000).toFixed(2)} kg` : `${Math.round(n)} g`);
const SRC: Record<GSrc, string> = { sliced: "", rough: "rough", past: "from past print", similar: "from similar size", unknown: "no grams" };
const chip = "inline-flex items-center rounded-full px-2 h-5 text-[10.5px] font-semibold whitespace-nowrap";
const STATE: Record<string, string> = { free: "In store", loaded: "On machine", plate: "On a plate", weigh: "Weigh pending" };
const prog = (o: Order, i: Order["items"][number], b: Parameters<typeof lineProgress>[2]) => { const p = lineProgress(o, i, b); return { printed: p.printed, printing: p.printing }; };

export function StockPanel({ order, onClose }: { order?: Order; onClose?: () => void }) {
  const [mat, setMat] = useState(""), [mode, setMode] = useState<Mode>("deadline"), [open, setOpen] = useState<string | null>(null);
  const orders = ordersSig.value, batches = batchesSig.value, jobs = jobsSig.value, spools = spoolsSig.value;
  const mats = [...new Set(spools.filter((s) => s.active !== false && s.status !== "empty" && s.grams > 0).map((s) => s.material))].sort();
  const stock = stockFor(spools, batches, jobs, jobSpool, mat), free = freeMap(stock);
  const demands = buildDemand(orders, batches, jobs, prog, jobSpool, order?.no);
  const rows = allocate(demands, free, mode);
  const seen = new Set(vOrders().map((o) => o.id));
  const nm = (d: Demand) => `${d.orderNo} · ${d.customer || "In-house"}`;
  const need = order ? orderNeed(order, demands, free) : [], unk = order ? demands.filter((d) => d.orderNo === order.no && d.unknown) : [];
  const reorder = filMasterSig.value.reorderG || 1000;
  /* Alpha / Beta is a view filter: orders outside the current view still use stock, but are only counted, never named or editable here. */
  const vis = (r: PlanRow) => seen.has(r.d.orderId), pick = (f: (r: PlanRow) => boolean) => rows.filter(f);
  const doable = pick((r) => (r.status === "ready" || r.status === "partial") && vis(r)), blocked = pick((r) => r.status === "blocked" && vis(r)), unknown = pick((r) => r.status === "unknown" && vis(r)), held = pick((r) => r.status === "held" && vis(r));
  const hidden = rows.filter((r) => !vis(r)).length;
  const setRough = (d: Demand, v: string) => { const o = ordersSig.value.find((x) => x.id === d.orderId); if (!o) return; const n = Math.max(0, Number(v) || 0); patchOrder(o, { items: o.items.map((x, j) => (j === d.k ? { ...x, roughG: n || undefined } : x)) }); };
  const plans = printerPlans(spools, printersSig.value.filter((p) => p.active !== false).map((p) => p.name), demands, batches).map((p) => ({ ...p, picks: p.picks.filter((x) => seen.has(x.d.orderId)) }));
  const H = (t: string, extra?: preact.ComponentChildren) => <div class="flex items-center gap-2 mt-4 mb-1.5"><div class="text-[10.5px] font-bold tracking-wide text-c2 uppercase">{t}</div>{extra}</div>;
  const Row = ({ r }: { r: PlanRow }) => { const d = r.d; return <li class="rounded-lg border border-line px-2.5 py-2 text-[12.5px]">
    <div class="flex items-start gap-2"><div class="min-w-0 flex-1"><b class="block break-words">{d.name}</b><span class="t-meta block break-words">{nm(d)} · due {d.due ? shortDate(d.due) : "—"}</span></div>
      {r.status === "ready" && <span class={`${chip} bg-grn-bg text-grn`}>Can finish · {d.pending}</span>}
      {r.status === "partial" && <span class={`${chip} bg-amb-bg text-amb`}>{r.can} of {d.pending}</span>}
      {r.status === "blocked" && <span class={`${chip} bg-red-bg text-red`}>Blocked</span>}</div>
    <div class="flex flex-wrap gap-1 mt-1.5">{d.pcs.map((x) => <span key={x.colour} class="inline-flex items-center gap-1 rounded-full bg-c1 px-1.5 py-0.5 text-[11px]"><Sq colour={x.colour} />{x.colour} {x.src !== "sliced" ? "~" : ""}{Math.round(x.g * d.pending)} g</span>)}</div>
    {d.estimated && <div class="t-meta mt-1 flex items-center gap-2">~ estimated grams ({[...new Set(d.pcs.filter((x) => x.src !== "sliced").map((x) => SRC[x.src]))].join(", ")})
      {d.pcs.some((x) => x.src === "rough") && <label class="ml-auto inline-flex items-center gap-1">rough g/pc<input type="number" min={0} aria-label={`Rough grams per piece for ${d.name}`} value={Math.round(d.pcs.reduce((a, x) => a + x.g, 0))} onChange={(e) => setRough(d, (e.target as HTMLInputElement).value)} class="h-7 w-14 px-1 rounded-md border border-line bg-c0 text-right num" /></label>}</div>}
    {r.status !== "ready" && r.short.length > 0 && <div class="text-[11.5px] text-red mt-1">Short: {r.short.map((x) => `${x.colour} ${g(x.g)}`).join(" · ")}{r.missing.length ? ` · cannot start without ${r.missing.join(", ")}` : ""}</div>}
  </li>; };

  return <aside aria-label="Filament stock" class="h-full min-h-0 flex flex-col bg-c0 text-c4">
    <div class="shrink-0 flex items-center gap-2 px-3 pt-3 pb-2 border-b border-line">
      <h3 class="text-[15px] font-semibold mr-auto">Filament stock{order ? ` · ${order.no}` : ""}</h3>
      {onClose && <button type="button" aria-label="Close stock panel" onClick={onClose} class="w-8 h-8 !min-h-0 rounded-full hover:bg-c1 cursor-pointer text-[16px] leading-none">✕</button>}
    </div>
    <div class="flex-1 min-h-0 overflow-y-auto overscroll-contain px-3 pb-6 max-md:pb-24">
      <div class="flex flex-wrap gap-1.5 mt-3">{[["", "All materials"], ...mats.map((m) => [m, m])].map(([v, l]) => <button key={v} type="button" aria-pressed={mat === v} onClick={() => setMat(v)} class={`h-7 px-2.5 !min-h-0 rounded-full text-[11px] cursor-pointer border ${mat === v ? "bg-grn-bg border-grn/40 text-grn font-semibold" : "border-line text-c3"}`}>{l}</button>)}</div>
      <p class="t-meta mt-1.5">Free = in store, not loaded on a machine and not on a plate. Net filament grams, spool weight excluded.</p>

      {order && <>{H("This order · need vs free")}
        {need.length ? <div class="grid grid-cols-[minmax(0,1fr)_auto_auto_auto] gap-x-3 gap-y-1 text-[12px] items-center num">
          <span class="text-c3 font-sans">Colour</span><span class="text-c3 text-right">Need</span><span class="text-c3 text-right">Free</span><span class="text-c3 text-right">Short</span>
          {need.map((n) => <>
            <span key={n.colour} class="font-sans inline-flex items-center gap-1.5 min-w-0"><Sq colour={n.colour} /><span class="truncate">{n.colour}</span></span>
            <span class="text-right">{n.need ? g(n.need) : "—"}</span><span class="text-right">{g(n.free)}</span><span class={`text-right font-semibold ${n.short ? "text-red" : n.need ? "text-grn" : "text-c3"}`}>{n.short ? g(n.short) : n.need ? "OK" : "—"}</span></>)}
        </div> : <p class="t-meta">Nothing pending on this order, or its grams are not entered yet.</p>}
        {unk.length > 0 && <p class="text-[12px] text-amb mt-2">{unk.length} design{unk.length > 1 ? "s" : ""} have no grams, so the totals above are incomplete. Add rough grams in Edit line items.</p>}</>}

      {H("In store by colour")}
      <ul class="grid gap-1">{stock.map((c) => { const on = open === c.colour, left = Math.max(0, c.free - c.reserved); return <li key={c.colour} class="rounded-lg border border-line">
        <button type="button" onClick={() => setOpen(on ? null : c.colour)} aria-expanded={on} class="w-full flex items-center gap-2 px-2.5 py-2 text-left !min-h-0 cursor-pointer text-[12.5px]">
          <Sq colour={c.colour} /><b class="min-w-0 flex-1 break-words">{c.colour}</b>
          {left <= 0 ? <span class={`${chip} bg-red-bg text-red`}>None free</span> : left <= reorder ? <span class={`${chip} bg-amb-bg text-amb`}>Reorder</span> : null}
          <span class="num font-semibold">{g(left)}</span><span class="text-c3 text-[11px]">{on ? "▴" : "▾"}</span></button>
        <div class="px-2.5 pb-1.5 -mt-1 t-meta flex flex-wrap gap-x-3">{c.spools.length} spool{c.spools.length > 1 ? "s" : ""}{c.busy > 0 && <span>{g(c.busy)} on machine or plate</span>}{c.reserved > 0 && <span>{g(c.reserved)} held by queued jobs</span>}</div>
        {on && <ul class="border-t border-line px-2.5 py-1.5 grid gap-1">{c.spools.map(({ s, state }) => <li key={s.id} class="flex items-center gap-2 text-[12px]"><span class="min-w-0 flex-1 break-words">#{s.slot ?? s.spoolNo} · {s.material} · {s.brand}</span>
          <span class={`${chip} ${state === "free" ? "bg-c1 text-c3" : "bg-amb-bg text-amb"}`}>{STATE[state]}{state === "loaded" && s.printer ? ` · ${s.printer}` : ""}</span><span class="num font-semibold">{g(s.grams)}</span></li>)}</ul>}
      </li>; })}</ul>
      {!stock.length && <p class="t-meta">No filament in store{mat ? ` for ${mat}` : ""}.</p>}

      {H("What can be printed now", <div class="ml-auto inline-flex rounded-full bg-c1 p-0.5">{([["deadline", "Deadline first"], ["max", "Most pieces"]] as const).map(([v, l]) => <button key={v} type="button" aria-pressed={mode === v} onClick={() => setMode(v)} class={`h-6 px-2 !min-h-0 rounded-full text-[11px] cursor-pointer ${mode === v ? "bg-c4 text-c0 font-semibold" : "text-c3"}`}>{l}</button>)}</div>)}
      <p class="t-meta mb-1.5">{mode === "deadline" ? "Earliest due claims stock first, across all live orders, so the same grams are never promised twice." : "Lightest designs first. A quick heuristic for more pieces, not a guaranteed maximum."}</p>
      {doable.length ? <ul class="grid gap-1.5">{doable.map((r) => <Row key={r.d.id} r={r} />)}</ul> : <p class="t-meta">Nothing can be finished with the free stock right now.</p>}
      {blocked.length > 0 && <>{H("Blocked by stock")}<ul class="grid gap-1.5">{blocked.map((r) => <Row key={r.d.id} r={r} />)}</ul></>}
      {held.length > 0 && <>{H("Held by a queued job")}<p class="t-meta mb-1.5">Already assigned to a spool through the job queue, so not planned again.</p>
        <ul class="grid gap-1">{held.map(({ d }) => <li key={d.id} class="rounded-lg border border-line px-2.5 py-1.5 text-[12.5px]"><b class="block break-words">{d.name}</b><span class="t-meta block break-words">{nm(d)} · {d.pending} pcs</span></li>)}</ul></>}
      {hidden > 0 && <p class="t-meta mt-3">{hidden} more design{hidden > 1 ? "s" : ""} from orders outside the current Alpha / Beta view also use this stock.</p>}
      {unknown.length > 0 && <>{H("Grams unknown")}<p class="t-meta mb-1.5">Not ranked, because no sliced grams, rough grams, past print or similar-size design exists. Enter rough grams per piece:</p>
        <ul class="grid gap-1">{unknown.map(({ d }) => <li key={d.id} class="flex items-center gap-2 rounded-lg border border-line px-2.5 py-1.5 text-[12.5px]"><span class="min-w-0 flex-1"><b class="block break-words">{d.name}</b><span class="t-meta block break-words">{nm(d)} · {d.pending} pcs{d.pcs.length ? "" : " · no colours set"}</span></span>
          <input type="number" min={0} placeholder="g/pc" aria-label={`Rough grams per piece for ${d.name}`} onChange={(e) => setRough(d, (e.target as HTMLInputElement).value)} class="h-8 w-16 px-1.5 rounded-md border border-line bg-c0 text-right num" /></li>)}</ul></>}

      {plans.length > 0 && <>{H("By printer · fewest spool swaps")}<p class="t-meta mb-1.5">Loaded spools count only for their own printer.</p>
        <ul class="grid gap-1.5">{plans.map((p) => <li key={p.printer} class="rounded-lg border border-line px-2.5 py-2 text-[12.5px]">
          <div class="flex items-center gap-2"><b>{p.printer}</b><span class="t-meta break-words">{p.loaded.map((l) => `${l.colour} ${g(l.g)}`).join(" · ")}</span></div>
          {p.picks.length ? <ol class="mt-1 grid gap-0.5">{p.picks.map((x, n) => <li key={x.d.id} class="flex items-center gap-2"><span class="text-c3 w-4">{n + 1}.</span><span class="min-w-0 flex-1 break-words">{x.d.name} <span class="t-meta">· {nm(x.d)}</span></span>
            <span class={`${chip} ${x.swaps.length ? "bg-amb-bg text-amb" : x.enough ? "bg-grn-bg text-grn" : "bg-c1 text-c3"}`}>{x.swaps.length ? `swap in ${x.swaps[0]}` : x.enough ? "no swap" : "no swap · low on spool"}</span></li>)}</ol> : <p class="t-meta mt-1">Nothing pending matches what is loaded.</p>}
        </li>)}</ul></>}
    </div>
  </aside>;
}
