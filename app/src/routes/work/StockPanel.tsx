/** Filament stock drawer for the production screens: free stock per colour, need vs available for the open order, and what can be printed now. */
import { useState } from "preact/hooks";
import { shortDate, ordersSig, batchesSig, jobsSig, spoolsSig, printersSig, filMasterSig, jobSpool, lineProgress, patchOrder, vOrders, type Order } from "../../data";
import { colourHex } from "../../data/floor";
import { allocate, buildDemand, freeMap, orderNeed, pickSpools, printerPlans, spoolNo, stockFor, type Demand, type GSrc, type Mode, type PlanRow } from "../../data/stockPlan";

const Sq = ({ colour }: { colour: string }) => <span class="w-3.5 h-3.5 shrink-0 inline-block rounded-[4px] shadow-[inset_0_0_0_1px_rgb(128_128_128/0.7)]" style={{ background: colourHex(colour) || "repeating-linear-gradient(45deg,var(--c-2) 0 3px,var(--c-1) 3px 6px)" }} />;
const g = (n: number) => (Math.abs(n) >= 1000 ? `${(n / 1000).toFixed(2)} kg` : `${Math.round(n)} g`);
const SRC: Record<GSrc, string> = { sliced: "", logged: "from logged use", rough: "rough", past: "from past print", similar: "from similar size", unknown: "no grams" };
const chip = "inline-flex items-center rounded-full px-2 h-5 text-[11px] font-semibold whitespace-nowrap";
const STATE: Record<string, string> = { free: "In store", loaded: "On machine", plate: "On a plate", weigh: "Weigh pending" };
const prog = (o: Order, i: Order["items"][number], b: Parameters<typeof lineProgress>[2]) => { const p = lineProgress(o, i, b); return { printed: p.printed, printing: p.printing }; };

export function StockPanel({ order, onClose }: { order?: Order; onClose?: () => void }) {
  const [mat, setMat] = useState(""), [mode, setMode] = useState<Mode>("deadline"), [q, setQ] = useState("");
  const [secs, setSecs] = useState<Set<string>>(new Set(["next"])), [cols, setCols] = useState<Set<string>>(new Set()), [rowsOpen, setRowsOpen] = useState<Set<string>>(new Set());
  const flip = (set: Set<string>, put: (s: Set<string>) => void, k: string) => { const n = new Set(set); n.has(k) ? n.delete(k) : n.add(k); put(n); };
  const orders = ordersSig.value, batches = batchesSig.value, jobs = jobsSig.value, spools = spoolsSig.value;
  const mats = [...new Set(spools.filter((s) => s.active !== false && s.status !== "empty" && s.grams > 0).map((s) => s.material))].sort();
  const stock = stockFor(spools, batches, jobs, jobSpool, mat), free = freeMap(stock);
  /* With an order open, everything below is about that order only. Without one (no order open), it is the cross-order planner. */
  const all = buildDemand(orders, batches, jobs, prog, jobSpool, order?.no);
  const demands = order ? all.filter((d) => d.orderId === order.id) : all;
  const rows = allocate(demands, free, mode);
  const seen = new Set(vOrders().map((o) => o.id));
  const nm = (d: Demand) => order ? "" : `${d.orderNo} · ${d.customer || "In-house"}`;
  const need = order ? orderNeed(order, demands, free) : [], unk = order ? demands.filter((d) => d.unknown) : [];
  const needed = need.filter((n) => n.need > 0 || n.short > 0), shortC = needed.filter((n) => n.short > 0);
  const reorder = filMasterSig.value.reorderG || 1000;
  /* Alpha / Beta is a view filter: in the cross-order view, orders outside it use stock but are only counted, never named. */
  const vis = (r: PlanRow) => !!order || seen.has(r.d.orderId), pick = (f: (r: PlanRow) => boolean) => rows.filter((r) => vis(r) && f(r));
  const doable = pick((r) => r.status === "ready" || r.status === "partial"), blocked = pick((r) => r.status === "blocked"), unknown = pick((r) => r.status === "unknown"), held = pick((r) => r.status === "held");
  const hidden = order ? 0 : rows.filter((r) => !vis(r)).length;
  const setRough = (d: Demand, v: string) => { const o = ordersSig.value.find((x) => x.id === d.orderId); if (!o) return; const n = Math.max(0, Number(v) || 0); patchOrder(o, { items: o.items.map((x, j) => (j === d.k ? { ...x, roughG: n || undefined } : x)) }); };
  const plans = printerPlans(spools, printersSig.value.filter((p) => p.active !== false).map((p) => p.name), demands, batches).map((p) => ({ ...p, picks: p.picks.filter((x) => vis({ d: x.d } as PlanRow)) })).filter((p) => p.picks.length > 0 || p.loaded.length > 0);
  const find = q.trim().toLowerCase(), list = stock.filter((c) => !find || c.colour.toLowerCase().includes(find));

  /* Which spool to pick for `g` grams of a colour: the smallest free spool that holds it, else the fullest ones until covered. */
  const spoolFor = (colour: string, grams: number) => { const row = stock.find((c) => c.colour.toLowerCase() === colour.trim().toLowerCase()); return pickSpools(row?.spools ?? [], grams); };
  const Pick = (colour: string, grams: number) => { if (grams <= 0) return null; const { picks, covered } = spoolFor(colour, grams);
    return picks.length ? <span class="t-meta">{picks.slice(0, 3).map((x, n) => <b key={x.s.id} class="text-c4 font-semibold">{n ? ", " : ""}#{spoolNo(x.s)}<span class="text-c3 font-normal"> ({g(x.s.grams)})</span></b>)}{picks.length > 3 ? ` +${picks.length - 3} more` : ""}{covered ? "" : " · not enough"}</span> : <span class="t-meta text-red">no free spool</span>; };

  /* Collapsible section: one line when closed (title, a short summary, a count), content only on demand. */
  const Sec = (id: string, title: string, sum: preact.ComponentChildren, body: preact.ComponentChildren, tone = "") => { const on = secs.has(id);
    return <section key={id} class="rounded-xl border border-line bg-c0">
      <button type="button" aria-expanded={on} onClick={() => flip(secs, setSecs, id)} class="w-full flex items-center gap-2 px-3 py-2.5 text-left !min-h-0 cursor-pointer">
        <span class="text-[13px] font-semibold">{title}</span><span class={`text-[12px] min-w-0 flex-1 truncate ${tone || "text-c3"}`}>{sum}</span><span class="text-c3 text-[11px]">{on ? "▴" : "▾"}</span></button>
      {on && <div class="border-t border-line px-3 py-2.5">{body}</div>}</section>; };

  const Row = (r: PlanRow) => { const d = r.d, on = rowsOpen.has(d.id), warn = r.status !== "ready" && r.short.length > 0;
    return <li key={d.id} class="rounded-lg bg-c1/60">
      <button type="button" aria-expanded={on} onClick={() => flip(rowsOpen, setRowsOpen, d.id)} class="w-full flex items-start gap-2 px-2.5 py-2 text-left !min-h-0 cursor-pointer">
        <span class="min-w-0 flex-1"><b class="block text-[13px] break-words">{d.name}</b><span class="t-meta block break-words">{nm(d) && `${nm(d)} · `}{d.pending} pcs · due {d.due ? shortDate(d.due) : "—"}</span></span>
        {r.status === "ready" && <span class={`${chip} bg-grn-bg text-grn`}>Can finish</span>}
        {r.status === "partial" && <span class={`${chip} bg-amb-bg text-amb`}>{r.can} of {d.pending}</span>}
        {r.status === "blocked" && <span class={`${chip} bg-red-bg text-red`}>Blocked</span>}</button>
      {on && <div class="px-2.5 pb-2.5 grid gap-1.5">
        <div class="flex flex-wrap gap-1">{d.pcs.map((x) => <span key={x.colour} class="rounded-lg bg-c0 border border-line px-2 py-1 text-[11.5px] max-w-full"><span class="inline-flex items-center gap-1.5"><Sq colour={x.colour} />{x.colour} {x.src !== "sliced" && x.src !== "logged" ? "~" : ""}{Math.round(x.g * d.pending)} g</span><span class="block">Pick {Pick(x.colour, x.g * d.pending)}</span></span>)}</div>
        {warn && <div class="text-[12px] text-red">Short: {r.short.map((x) => `${x.colour} ${g(x.g)}`).join(" · ")}{r.missing.length ? ` · cannot start without ${r.missing.join(", ")}` : ""}</div>}
        {d.estimated && <div class="t-meta flex items-center gap-2">~ estimated ({[...new Set(d.pcs.filter((x) => x.src !== "sliced" && x.src !== "logged").map((x) => SRC[x.src]))].join(", ")})
          {d.pcs.some((x) => x.src === "rough") && <label class="ml-auto inline-flex items-center gap-1">g/pc<input type="number" min={0} aria-label={`Rough grams per piece for ${d.name}`} value={Math.round(d.pcs.reduce((a, x) => a + x.g, 0))} onChange={(e) => setRough(d, (e.target as HTMLInputElement).value)} class="h-7 w-14 px-1 rounded-md border border-line bg-c0 text-right num" /></label>}</div>}</div>}
    </li>; };

  const toggle = <div class="inline-flex rounded-full bg-c1 p-0.5 mb-2">{([["deadline", "Deadline first"], ["max", "Most pieces"]] as const).map(([v, l]) => <button key={v} type="button" aria-pressed={mode === v} onClick={() => setMode(v)} class={`h-7 px-2.5 !min-h-0 rounded-full text-[11.5px] cursor-pointer ${mode === v ? "bg-c4 text-c0 font-semibold" : "text-c3"}`}>{l}</button>)}</div>;
  const verdict = !order ? null : !needed.length ? { t: unk.length ? "Can't check yet" : "Nothing pending", s: unk.length ? `${unk.length} design${unk.length > 1 ? "s have" : " has"} no grams. Add rough grams per piece.` : "Every piece of this order is printed or in progress.", c: "text-amb", bg: "bg-amb-bg" }
    : shortC.length ? { t: `Short on ${shortC.length} of ${needed.length} colour${needed.length > 1 ? "s" : ""}`, s: "Not enough free filament to print everything pending.", c: "text-red", bg: "bg-red-bg" }
    : { t: "Free stock covers this order", s: `All ${needed.length} colour${needed.length > 1 ? "s are" : " is"} covered for the pending pieces.`, c: "text-grn", bg: "bg-grn-bg" };

  return <aside aria-label="Filament stock" class="h-full min-h-0 flex flex-col bg-c0 text-c4">
    <div class={`shrink-0 flex items-center gap-2 py-2.5 border-b border-line pl-3 ${onClose ? "pr-3" : "pr-14"}`}>
      <h3 class="text-[15px] font-semibold mr-auto min-w-0 truncate">Filament{order ? ` · ${order.no}` : " stock · all live orders"}</h3>
      <select value={mat} aria-label="Material" onChange={(e) => setMat((e.target as HTMLSelectElement).value)} class="h-8 px-2 rounded-lg border border-line bg-c0 text-[12px] cursor-pointer max-w-[9rem]"><option value="">All materials</option>{mats.map((m) => <option key={m} value={m}>{m}</option>)}</select>
      {onClose && <button type="button" aria-label="Close stock panel" onClick={onClose} class="w-8 h-8 !min-h-0 rounded-full hover:bg-c1 cursor-pointer text-[16px] leading-none">✕</button>}
    </div>
    <div class="flex-1 min-h-0 overflow-y-auto overscroll-contain px-3 py-3 max-md:pb-24 grid gap-2 content-start">
      {verdict && <div class={`rounded-xl px-3 py-2.5 ${verdict.bg}`}>
        <div class={`text-[14px] font-semibold ${verdict.c}`}>{verdict.t}</div><div class="text-[12px] text-c4 mt-0.5">{verdict.s}</div>
        {unk.length > 0 && needed.length > 0 && <button type="button" onClick={() => setSecs(new Set([...secs, "unk"]))} class="mt-1 text-[12px] underline cursor-pointer !min-h-0 text-c4">{unk.length} design{unk.length > 1 ? "s" : ""} without grams, so this may be understated</button>}
        {shortC.length > 0 && <ul class="mt-2 grid gap-1">{shortC.map((n) => <li key={n.colour} class="flex items-center gap-2 text-[12.5px]"><Sq colour={n.colour} /><span class="min-w-0 flex-1 break-words">{n.colour}</span><span class="num text-c3">need {g(n.need)}</span><span class="num font-semibold text-red">short {g(n.short)}</span></li>)}</ul>}</div>}
      {order && needed.length > 0 && Sec("need", "Colours needed", `${needed.length} colour${needed.length > 1 ? "s" : ""}${shortC.length ? ` · ${shortC.length} short` : " · all covered"}`,
        <ul class="grid gap-1.5">{needed.map((n) => <li key={n.colour} class="flex items-center gap-2 text-[12.5px]"><Sq colour={n.colour} /><span class="min-w-0 flex-1 break-words">{n.colour}<span class="block">{Pick(n.colour, n.need)}</span></span>
          <span class="num text-c3">{g(n.need)} of {g(n.free)}</span><span class={`${chip} w-12 justify-center ${n.short ? "bg-red-bg text-red" : "bg-grn-bg text-grn"}`}>{n.short ? "Short" : "OK"}</span></li>)}</ul>, shortC.length ? "text-red" : "text-grn")}

      {Sec("next", "What to print next", doable.length ? `${doable.length} design${doable.length > 1 ? "s" : ""} can be printed` : "Nothing fits the free stock", <>{toggle}
        <p class="t-meta mb-2">{mode === "deadline" ? (order ? "Earliest due first." : "Earliest due claims stock first across live orders, so the same grams are never promised twice.") : "Lightest designs first. A quick heuristic for more pieces, not a guaranteed maximum."}</p>
        {doable.length ? <ul class="grid gap-1.5">{doable.map(Row)}</ul> : <p class="t-meta">Nothing can be finished with the free stock right now.</p>}</>, doable.length ? "text-c3" : "text-red")}
      {blocked.length > 0 && Sec("blocked", "Blocked by stock", `${blocked.length} design${blocked.length > 1 ? "s" : ""}`, <ul class="grid gap-1.5">{blocked.map(Row)}</ul>, "text-red")}
      {held.length > 0 && Sec("held", "Held by a queued job", `${held.length} design${held.length > 1 ? "s" : ""}`, <><p class="t-meta mb-2">Already assigned to a spool through the job queue, so not planned again.</p>
        <ul class="grid gap-1.5">{held.map(({ d }) => <li key={d.id} class="rounded-lg bg-c1/60 px-2.5 py-2 text-[12.5px]"><b class="block break-words">{d.name}</b><span class="t-meta block break-words">{nm(d) && `${nm(d)} · `}{d.pending} pcs</span></li>)}</ul></>)}
      {unknown.length > 0 && Sec("unk", "Grams missing", `${unknown.length} design${unknown.length > 1 ? "s" : ""} not ranked`, <><p class="t-meta mb-2">No sliced grams, rough grams, past print or similar-size design. Enter rough grams per piece:</p>
        <ul class="grid gap-1.5">{unknown.map(({ d }) => <li key={d.id} class="flex items-center gap-2 rounded-lg bg-c1/60 px-2.5 py-2 text-[12.5px]"><span class="min-w-0 flex-1"><b class="block break-words">{d.name}</b><span class="t-meta block break-words">{nm(d) && `${nm(d)} · `}{d.pending} pcs{d.pcs.length ? "" : " · no colours set"}</span></span>
          <input type="number" min={0} placeholder="g/pc" aria-label={`Rough grams per piece for ${d.name}`} onChange={(e) => setRough(d, (e.target as HTMLInputElement).value)} class="h-8 w-16 px-1.5 rounded-md border border-line bg-c0 text-right num" /></li>)}</ul></>, "text-amb")}
      {plans.length > 0 && Sec("print", "By printer", "fewest spool swaps", <><p class="t-meta mb-2">Loaded spools count only for their own printer.</p>
        <ul class="grid gap-2">{plans.map((p) => <li key={p.printer} class="text-[12.5px]">
          <div class="flex flex-wrap items-baseline gap-x-2"><b>{p.printer}</b><span class="t-meta break-words">{p.loaded.length ? p.loaded.map((l) => `${l.colour} ${g(l.g)}`).join(" · ") : "nothing loaded"}</span></div>
          {p.picks.length ? <ol class="mt-1 grid gap-1">{p.picks.map((x, n) => <li key={x.d.id} class="flex items-start gap-2"><span class="text-c3 w-4 shrink-0">{n + 1}.</span><span class="min-w-0 flex-1 break-words">{x.d.name}{nm(x.d) && <span class="t-meta"> · {nm(x.d)}</span>}</span>
            <span class={`${chip} ${x.swaps.length ? "bg-amb-bg text-amb" : x.enough ? "bg-grn-bg text-grn" : "bg-c1 text-c3"}`}>{x.swaps.length ? `swap in ${x.swaps[0]}` : x.enough ? "no swap" : "low on spool"}</span></li>)}</ol> : <p class="t-meta mt-0.5">Nothing pending matches what is loaded.</p>}
        </li>)}</ul></>)}

      {Sec("store", "Store stock", `${stock.length} colour${stock.length === 1 ? "" : "s"}${mat ? ` · ${mat}` : ""}`, <>
        <input type="search" value={q} placeholder="Find a colour" aria-label="Find a colour" onInput={(e) => setQ((e.target as HTMLInputElement).value)} class="h-8 w-full px-2.5 mb-2 rounded-lg border border-line bg-c0 text-[12.5px]" />
        <p class="t-meta mb-2">Free = in store, not loaded and not on a plate. Net filament grams, spool weight excluded.</p>
        <ul class="grid gap-1">{list.map((c) => { const on = cols.has(c.colour), left = Math.max(0, c.free - c.reserved); return <li key={c.colour} class="rounded-lg bg-c1/60">
          <button type="button" onClick={() => flip(cols, setCols, c.colour)} aria-expanded={on} class="w-full flex items-center gap-2 px-2.5 py-2 text-left !min-h-0 cursor-pointer text-[12.5px]">
            <Sq colour={c.colour} /><b class="min-w-0 flex-1 break-words font-medium">{c.colour}</b>
            {left <= 0 ? <span class={`${chip} bg-red-bg text-red`}>None free</span> : left <= reorder ? <span class={`${chip} bg-amb-bg text-amb`}>Low</span> : null}
            <span class="num font-semibold">{g(left)}</span><span class="text-c3 text-[11px]">{on ? "▴" : "▾"}</span></button>
          {on && <div class="px-2.5 pb-2 grid gap-1 text-[12px]">
            <div class="t-meta">{c.spools.length} spool{c.spools.length > 1 ? "s" : ""}{c.busy > 0 ? ` · ${g(c.busy)} on a machine or plate` : ""}{c.reserved > 0 ? ` · ${g(c.reserved)} held by queued jobs` : ""}</div>
            {c.spools.map(({ s, state }) => <div key={s.id} class="flex items-center gap-2"><span class="min-w-0 flex-1 break-words">#{s.slot ?? s.spoolNo} · {s.material} · {s.brand}</span>
              <span class={`${chip} ${state === "free" ? "bg-c0 text-c3" : "bg-amb-bg text-amb"}`}>{STATE[state]}{state === "loaded" && s.printer ? ` · ${s.printer}` : ""}</span><span class="num font-semibold w-14 text-right">{g(s.grams)}</span></div>)}</div>}
        </li>; })}</ul>
        {!list.length && <p class="t-meta">{stock.length ? "No colour matches." : `No filament in store${mat ? ` for ${mat}` : ""}.`}</p>}</>)}
      {hidden > 0 && <p class="t-meta">{hidden} more design{hidden > 1 ? "s" : ""} from orders outside the current Alpha / Beta view also use this stock.</p>}
    </div>
  </aside>;
}
