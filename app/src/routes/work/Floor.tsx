import { sortAbc } from "../../mock/types";
/** Floor: the internal bulk work sheet. Opens at 95% of the screen from an order's FLOOR button. */
import { Fragment } from "preact";
import { useEffect, useMemo, useState } from "preact/hooks";
import { Thumb } from "../../ui/media";
import { Button, Sheet } from "../../ui";
import { ordersSig, printersSig, filMasterSig, spoolsSig, batchesSig, shortDate, shrinkImage, storeMedia, patchOrder, type Order, type LineItem, type Spool, type Batch, spoolGross, runHours } from "../../data";
import { StockPanel } from "./StockPanel";
import { PartsButton } from "./Parts";
import { pieceGrams, loggedPc } from "../../data/stockPlan";
import { onParts } from "../../data";
import { cancelRun, colourHex, sameFamily, runTotals, colourStore, finishPlates, floorColumns, floorLine, gramsFor, lineColours, logPlates, pendingOn, pendingWeigh, returnGrams, saveFloorLines, startPlates } from "../../data/floor";

const eq = (a?: string, b?: string) => (a ?? "").trim().toLowerCase() === (b ?? "").trim().toLowerCase();
const n0 = (v: string) => Math.max(0, Math.floor(Number(v) || 0));
const Sq = ({ hex, size = "w-6 h-6" }: { hex?: string; size?: string }) => <span class={`${size} inline-block rounded-[5px] shadow-[inset_0_0_0_1px_rgb(128_128_128/0.7)] align-middle`} style={{ background: hex || "repeating-linear-gradient(45deg,#9a9a9a 0 3px,#d8d8d8 3px 6px)" }} />;

function Toggle({ paid, onChange }: { paid: boolean; onChange: (v: boolean) => void }) {
  const b = (on: boolean, l: string, tone: string) => <button type="button" onClick={(e) => { e.stopPropagation(); onChange(l === "Paid"); }} class={`h-6 px-2 rounded-full text-[11px] font-semibold !min-h-0 cursor-pointer ${on ? tone : "text-c2"}`}>{l}</button>;
  return <span class="inline-flex rounded-full bg-c1 p-0.5">{b(!paid, "Free", "bg-grn text-c0")}{b(paid, "Paid", "bg-red text-c0")}</span>;
}
function MachineSelect({ value, onChange, cls = "" }: { value?: string; onChange: (v: string) => void; cls?: string }) {
  const names = sortAbc(printersSig.value.filter((p) => p.active !== false).map((p) => p.name));
  return <select value={value ?? ""} onChange={(e) => onChange((e.target as HTMLSelectElement).value)} onClick={(e) => e.stopPropagation()} class={`h-7 px-1.5 rounded-md bg-c1 text-[12px] cursor-pointer max-w-[120px] ${cls}`}>
    <option value="">— Any</option>{names.map((m) => <option key={m}>{m}</option>)}{value && !names.includes(value) && <option>{value}</option>}
  </select>;
}

type SortKey = "sr" | "name" | "qty" | "printed" | "wasted" | "remaining" | "extra" | "model" | "machine" | `c:${string}`;

export function Floor({ order, onClose }: { order: Order; onClose: () => void }) {
  const o = ordersSig.value.find((x) => x.id === order.id) ?? order;
  const [sort, setSort] = useState<{ k: SortKey; up: boolean }>({ k: "sr", up: true });
  const open = (k: number, run = "", part = "", group?: string[]) => { setLogRun(run); setLogPart(part); setLogGroup(group); setLogK(k); }, close = () => { setLogK(null); setLogRun(""); setLogPart(""); setLogGroup(undefined); };
  const [logK, setLogK] = useState<number | null>(null), [logRun, setLogRun] = useState(""), [logPart, setLogPart] = useState(""), [logGroup, setLogGroup] = useState<string[] | undefined>(), [tick, setTick] = useState<Record<number, string[]>>({}), [cols, setCols] = useState(false), [hist, setHist] = useState<number | null>(null), [lines, setLines] = useState(false);
  /* Filament stock beside the table: both panes live, draggable divider. Open state and width are remembered on this device. */
  const [stock, setStock] = useState(() => { try { return localStorage.getItem("emerald:floor:stock") === "1"; } catch { return false; } });
  const [pw, setPw] = useState(() => { try { return Math.min(640, Math.max(300, Number(localStorage.getItem("emerald:floor:stockW")) || 380)); } catch { return 380; } });
  const toggleStock = () => { const v = !stock; setStock(v); try { localStorage.setItem("emerald:floor:stock", v ? "1" : "0"); } catch {} };
  const saveW = (w: number) => { setPw(w); try { localStorage.setItem("emerald:floor:stockW", String(w)); } catch {} };
  const drag = (e: PointerEvent) => { e.preventDefault(); const x0 = e.clientX, w0 = pw; const mv = (ev: PointerEvent) => setPw(Math.min(640, Math.max(300, w0 - (ev.clientX - x0)))); const up = (ev: PointerEvent) => { removeEventListener("pointermove", mv); removeEventListener("pointerup", up); saveW(Math.min(640, Math.max(300, w0 - (ev.clientX - x0)))); }; addEventListener("pointermove", mv); addEventListener("pointerup", up); };
  useEffect(() => { const k = (e: KeyboardEvent) => e.key === "Escape" && logK === null && hist === null && !cols && !lines && onClose(); addEventListener("keydown", k); return () => removeEventListener("keydown", k); }, [logK, hist, cols, lines]);

  const flipTick = (k: number, name: string) => setTick((t) => ({ ...t, [k]: (t[k] ?? []).includes(name) ? t[k].filter((x) => x !== name) : [...(t[k] ?? []), name] }));
  /** A cut line shows one row per printer (all its parts together) and one row per part that has no printer yet. */
  const partRows = (i: LineItem, k: number, card?: boolean) => { const seen = new Set<string>(); return i.parts!.map((p, j) => { const m = p.printer?.trim(); if (m) { if (seen.has(m)) return null; seen.add(m); return <MachineRow key={`m-${m}`} o={o} i={i} k={k} m={m} open={open} card={card} />; } return <PartRow key={p.id} o={o} i={i} k={k} j={j} open={open} card={card} ticked={(tick[k] ?? []).includes(p.name)} onTick={() => flipTick(k, p.name)} />; }); };
  const columns = floorColumns(o);
  const store = Object.fromEntries(columns.map((c) => [c, colourStore(c)]));
  const rows = o.items.map((i, k) => ({ i, k, f: floorLine(o, i) })).filter((r) => !r.i.offFloor);
  const val = (r: (typeof rows)[number], k: SortKey): number | string => k === "sr" ? r.k : k === "name" ? r.i.name.toLowerCase() : k === "qty" ? r.i.qty : k === "printed" ? r.f.printed : k === "wasted" ? r.f.wasted : k === "remaining" ? r.f.remaining : k === "extra" ? r.f.extra : k === "model" ? Number(!!r.i.paid) : k === "machine" ? (r.i.machine ?? "") : Number(lineColours(r.i).some((c) => eq(c, k.slice(2))));
  const sorted = [...rows].sort((a, b) => { const x = val(a, sort.k), y = val(b, sort.k); return (x < y ? -1 : x > y ? 1 : a.k - b.k) * (sort.up ? 1 : -1); });
  /* Completed lines are hidden by default, like hidden rows in Excel: Sr numbers and totals don't change. Choice is remembered on this device. */
  const [showDone, setShowDone] = useState(() => { try { return localStorage.getItem("emerald:floor:showDone") === "1"; } catch { return false; } });
  const toggleDone = () => { const v = !showDone; setShowDone(v); try { localStorage.setItem("emerald:floor:showDone", v ? "1" : "0"); } catch {} };
  const shown = showDone ? sorted : sorted.filter((r) => r.f.remaining);
  /* Grams per piece: sliced first, then rough / past print / similar size (marked ~). Unknown stays 0, never guessed. */
  const pool = ordersSig.value.flatMap((x) => x.items), pg = new Map(rows.map((r) => [r.k, pieceGrams(r.i, pool, loggedPc(o, r.i, batchesSig.value))]));
  const gOf = (k: number, c: string) => pg.get(k)?.find((x) => eq(x.colour, c));
  const est: Record<string, boolean> = {};
  const need = Object.fromEntries(columns.map((c) => [c, Math.round(rows.reduce((a, r) => { const x = gOf(r.k, c); if (!x?.g || !r.f.remaining) return a; if (x.src !== "sliced" && x.src !== "logged") est[c] = true; return a + r.f.remaining * x.g; }, 0))]));
  const tot = rows.reduce((a, r) => ({ q: a.q + r.i.qty, p: a.p + r.f.printed, w: a.w + r.f.wasted, r: a.r + r.f.remaining, e: a.e + r.f.extra }), { q: 0, p: 0, w: 0, r: 0, e: 0 });
  const done = rows.filter((r) => !r.f.remaining).length, kg = Object.values(need).reduce((a, x) => a + x, 0) / 1000;
  const put = (k: number, p: Partial<LineItem>) => patchOrder(o, { items: o.items.map((x, j) => (j === k ? { ...x, ...p } : x)) });
  const attach = async (k: number, file?: File | null) => { if (!file?.type.startsWith("image/")) return; const [full, thumb] = await Promise.all([shrinkImage(file, 1920, 0.72), shrinkImage(file, 160, 0.6)]); put(k, { img: storeMedia(full, `${o.no} ${o.items[k].name}`), thumb }); };

  const th = "px-2 py-2.5 text-[11.5px] font-bold uppercase tracking-wide !text-c0 whitespace-nowrap select-none cursor-pointer hover:opacity-75 align-bottom";
  const H = ({ k, children, left }: { k: SortKey; children: preact.ComponentChildren; left?: boolean }) =>
    <th class={`${th} ${left ? "text-left" : "text-center"}`} onClick={() => setSort({ k, up: sort.k === k ? !sort.up : true })} aria-sort={sort.k === k ? (sort.up ? "ascending" : "descending") : "none"}>
      {children}<span class={`ml-0.5 text-[9px] max-[1100px]:hidden ${sort.k === k ? "text-grn-bg" : "opacity-50"}`}>{sort.k === k ? (sort.up ? "▲" : "▼") : "⇅"}</span></th>;
  const td = "px-2 py-2 text-center";
  const kpi = (l: string, v: string | number, c = "") => <div><div class="text-[11px] text-c2">{l}</div><div class={`num text-[22px] font-semibold leading-tight ${c}`}>{v}</div></div>;

  return <div class="fixed inset-0 z-40 bg-black/50 pop-in" onClick={(e) => e.target === e.currentTarget && onClose()}>
    <div role="dialog" aria-modal="true" aria-label={`Floor · ${o.no}`} onClick={(e) => e.stopPropagation()} class={`absolute top-[2.5dvh] bottom-[2.5dvh] left-1/2 -translate-x-1/2 ${stock ? "w-[95vw]" : "w-max min-w-[min(900px,95vw)] max-w-[95vw]"} bg-c0 rounded-2xl shadow-2xl flex flex-col max-[640px]:inset-0 max-[640px]:translate-x-0 max-[640px]:left-0 max-[640px]:w-full max-[640px]:min-w-0 max-[640px]:max-w-none max-[640px]:rounded-none`}>
      <button type="button" aria-label="Close Floor" onClick={onClose} class="absolute -top-3 -right-3 max-[640px]:top-2 max-[640px]:right-2 max-[640px]:w-11 max-[640px]:h-11 max-[640px]:text-[20px] z-20 w-13 h-13 ring-4 ring-c0 !min-h-0 rounded-full bg-c4 text-c0 grid place-items-center text-[26px] leading-none cursor-pointer shadow-lg">✕</button>
      <div class={`flex-1 min-h-0 flex rounded-2xl max-[640px]:rounded-none overflow-hidden ${stock ? "max-[900px]:flex-col" : ""}`}>
      <div class={`flex-1 min-h-0 min-w-0 overflow-y-auto ${stock ? "overflow-x-auto" : "overflow-x-hidden"} overscroll-contain`}><div class="px-[clamp(12px,2vw,28px)] pt-6 pb-8 max-[640px]:pt-4 max-[640px]:pb-6">
        <div class="flex flex-wrap items-start gap-3 pr-16">
          <div class="mr-auto min-w-0"><h2 class="text-[20px] font-semibold leading-tight">{o.no} · {o.customer}</h2>
            <div class="t-meta mt-1">Due {shortDate(o.due)} · {rows.length} designs · {tot.q} pcs</div></div>
          {done > 0 && <label class="h-9 inline-flex items-center gap-2 px-3 rounded-full border border-line text-[13px] font-semibold cursor-pointer select-none">
            <input type="checkbox" checked={showDone} onChange={toggleDone} class="accent-grn w-4 h-4 !min-h-0 cursor-pointer" />Show completed ({done})</label>}
          <Button variant="outline" onClick={() => setLines(true)}>✎ Edit line items</Button>
          <Button variant="outline" onClick={() => setCols(true)}>✎ Edit colours</Button>
          <Button variant="outline" onClick={toggleStock}>{stock ? "Hide stock" : "▥ Filament stock"}</Button>
        </div>
        <div class="grid grid-cols-[repeat(auto-fill,minmax(110px,1fr))] sm:flex sm:flex-wrap gap-x-9 gap-y-3 mt-5 mb-5">
          {kpi("Ordered", tot.q)}{kpi("Printed", tot.p)}{kpi("Wasted", tot.w, tot.w ? "text-red" : "")}{kpi("Pending", tot.r)}{kpi("Extra (showcase)", `+${tot.e}`)}{kpi("Designs done", `${done}/${rows.length}`)}{kpi("Filament needed", `${Object.keys(est).length ? "~" : ""}${kg.toFixed(2)} kg`)}
        </div>
        {shown.filter((r) => (r.i.parts ?? []).filter((p) => !p.printer?.trim()).length > 1).map(({ i, k }) => { const loose = i.parts!.filter((p) => !p.printer?.trim()), t = (tick[k] ?? []).filter((n) => loose.some((p) => p.name === n)), names = loose.map((p) => p.name), open2 = loose.filter((p) => runTotals(o, i, p.name).good < i.qty);
          return <div key={k} class="mb-4 flex flex-wrap items-center gap-2 rounded-2xl bg-c1 px-3.5 py-2.5" role="group" aria-label={`Print parts of ${i.name} together`}>
            <b class="text-[13px]">{i.name}</b><span class="t-meta min-w-0 flex-1">{t.length ? `${t.length} of ${names.length} parts ticked` : "These parts have no printer yet. Tick some to print them together, or allot them to a printer in Parts."}</span>
            <button type="button" onClick={() => setTick((x) => ({ ...x, [k]: open2.map((p) => p.name) }))} class="text-[12px] underline text-c3 cursor-pointer !min-h-0">Tick all not printed</button>
            {t.length > 0 && <button type="button" onClick={() => setTick((x) => ({ ...x, [k]: [] }))} class="text-[12px] underline text-c3 cursor-pointer !min-h-0">Clear</button>}
            <button type="button" disabled={t.length < 2} onClick={() => open(k, "", "", names.filter((n) => t.includes(n)))} class="h-9 px-4 !min-h-0 rounded-full bg-grn-bg text-grn text-[13px] font-semibold cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed">▶ Print {t.length >= 2 ? t.length : "several"} parts together on one machine</button></div>; })}
        <div class={stock ? "max-[1799px]:hidden" : "max-[1099px]:hidden"}><table class="w-full border-collapse text-[14px] num">
          <thead class="sticky top-0 z-[5] bg-c4 text-c0"><tr>
            <H k="sr">Sr</H><th class={`${th} !cursor-default`}>Print</th><th class={`${th} !cursor-default`}>Img</th><H k="name" left>Name</H><H k="qty">Qty</H><H k="printed">Printed</H><H k="wasted">Wasted</H><H k="remaining">Remaining</H><H k="extra">Extra</H><H k="model">Model</H><H k="machine">Machine</H>
            {columns.map((c) => { const empty = !store[c]; return <th key={c} class={`${th} !align-bottom !px-0.5 w-6 min-w-0 ${empty ? "floor-empty text-red" : ""}`} onClick={() => setSort({ k: `c:${c}`, up: sort.k === `c:${c}` ? !sort.up : false })}>
              <div class="flex flex-col items-center justify-end gap-1.5">
                <span class="text-[11px] font-semibold leading-none normal-case tracking-normal whitespace-nowrap [writing-mode:vertical-rl] rotate-180 bg-c4 rounded py-1 px-0.5" title={c}>{c}</span><Sq hex={colourHex(c)} size="w-4 h-4 ring-1 ring-white/70" /></div></th>; })}
          </tr></thead>
          <tbody>
            {shown.map(({ i, k, f }) => { const fin = !f.remaining, cs = lineColours(i); return (
              <Fragment key={k}><tr class={`border-b border-line ${fin ? "bg-c1 text-c2 [&>td]:grayscale [&>td]:opacity-60" : ""}`}>
                <td class={td}>{k + 1}</td>
                <td class={td}><div class="flex flex-col items-center gap-1">{lineRuns(o, i).map((run) => <button key={run.id} type="button" onClick={() => open(k, run.id)} class="!min-h-0 rounded-full bg-amb-bg text-amb px-2.5 py-1 text-[12px] font-semibold whitespace-nowrap cursor-pointer leading-tight">■ Finish<span class="block text-[9.5px] font-medium">{run.printer || "on plate"} · {run.units} pcs{run.part ? ` · ${run.part}` : ""}</span></button>)}
                  {i.parts?.length ? <span class="t-meta whitespace-nowrap">{i.parts.length} parts ↓</span> : <button type="button" onClick={() => open(k)} class="h-7 px-2.5 !min-h-0 rounded-full bg-grn-bg text-grn text-[12px] font-semibold whitespace-nowrap cursor-pointer">{runsOf(o, i).length ? "+ Machine" : "▶ Start"}</button>}</div></td>
                <td class={td}><div class="inline-block align-middle"><Thumb thumb={i.thumb} full={i.img} alt={i.name} class="w-12 h-12 max-[1100px]:w-9 max-[1100px]:h-9" onAdd={(fl) => attach(k, fl)} /></div></td>
                <td class="px-2.5 py-2 text-left font-sans font-semibold leading-snug min-w-[8rem]">{i.name}<div class="mt-1 font-normal flex flex-wrap items-center gap-1"><PartsButton o={o} k={k} compact />{hasHistory(o, i) && <button type="button" onClick={() => setHist(k)} class="ml-1 h-6 px-2 !min-h-0 rounded-full border border-line text-[11.5px] font-semibold text-c3 cursor-pointer whitespace-nowrap">🕘 History</button>}</div></td>
                <td class={td}>{i.qty}</td>
                <td class={`${td} font-semibold`}>{f.printed}</td>
                <td class={`${td} ${f.wasted ? "text-red" : ""}`}>{f.wasted}</td>
                <td class={`${td} font-semibold ${fin ? "text-grn" : ""}`}>{fin ? "✓ 0" : f.remaining}</td>
                <td class={`${td} text-acc font-semibold`}>{f.extra ? `+${f.extra}` : ""}</td>
                <td class={td}><Toggle paid={!!i.paid} onChange={(v) => put(k, { paid: v })} /></td>
                <td class={td}><MachineSelect value={i.machine} onChange={(v) => put(k, { machine: v || undefined })} /></td>
                {columns.map((c) => <td key={c} class={`${td} !px-0.5 ${store[c] ? "" : "floor-empty"}`}>{cs.some((x) => eq(x, c)) && <Sq hex={colourHex(c)} size="w-6 h-6 max-[1100px]:w-[18px] max-[1100px]:h-[18px]" />}</td>)}
              </tr>{i.parts?.length ? partRows(i, k) : null}</Fragment>); })}
          </tbody>
          <tfoot class="text-[12px] text-c3">
            <tr class="border-t-2 border-line"><td colSpan={4} class="px-1 py-1.5 font-semibold text-c4">Total</td><td class={td}>{tot.q}</td><td class={td}>{tot.p}</td><td class={td}>{tot.w}</td><td class={td}>{tot.r}</td><td class={`${td} text-acc`}>+{tot.e}</td><td colSpan={2} class="px-1 text-right whitespace-nowrap">In store (g)</td>
              {columns.map((c) => <td key={c} class={`${td} ${store[c] ? "" : "floor-empty text-red font-semibold"}`}>{store[c]}</td>)}</tr>
            <tr><td colSpan={11} class="px-1 py-1.5 text-right">Needed for pending (g)</td>{columns.map((c) => <td key={c} class={`${td} ${store[c] ? "" : "floor-empty"}`} title={est[c] ? "Includes estimated grams" : undefined}>{need[c] ? `${est[c] ? "~" : ""}${need[c]}` : "—"}</td>)}</tr>
            <tr><td colSpan={11} class="px-1 py-1.5 text-right">Balance after job (g)</td>{columns.map((c) => { const b = store[c] - need[c]; return <td key={c} class={`${td} font-semibold ${b < 0 ? "text-red" : "text-grn"} ${store[c] ? "" : "floor-empty"}`}>{b > 0 ? "+" : ""}{b}</td>; })}</tr>
          </tfoot>
        </table></div>
        <div class={`${stock ? "min-[1800px]:hidden" : "min-[1100px]:hidden"} grid gap-2`}>
          {shown.map(({ i, k, f }) => { const fin = !f.remaining, cs = lineColours(i); return (
            <div key={k} class={`rounded-xl border border-line p-3 ${fin ? "bg-c1 text-c2 grayscale opacity-70" : "bg-c0"}`}>
              <div class="flex items-center gap-3">
                <Thumb thumb={i.thumb} full={i.img} alt={i.name} class="w-11 h-11 shrink-0" onAdd={(fl) => attach(k, fl)} />
                <div class="min-w-0 flex-1"><div class="font-semibold text-[14px] leading-snug">{k + 1}. {i.name}</div>
                  <div class="t-meta">Qty {i.qty} · {f.printed} printed · {f.remaining} left{f.wasted ? <span class="text-red"> · {f.wasted} wasted</span> : null}{f.extra ? ` · +${f.extra} extra` : ""}</div><div class="mt-1 flex flex-wrap items-center gap-1"><PartsButton o={o} k={k} compact />{hasHistory(o, i) && <button type="button" onClick={() => setHist(k)} class="ml-1 h-6 px-2 !min-h-0 rounded-full border border-line text-[11.5px] font-semibold text-c3 cursor-pointer whitespace-nowrap">🕘 History</button>}</div></div>
                <div class="flex flex-col items-end gap-1 shrink-0">{lineRuns(o, i).map((run) => <button key={run.id} type="button" onClick={() => open(k, run.id)} class="!min-h-0 rounded-full bg-amb-bg text-amb px-3 py-1.5 text-[12px] font-semibold cursor-pointer leading-tight">■ Finish<span class="block text-[10px] font-medium">{run.printer || "on plate"} · {run.units} pcs{run.part ? ` · ${run.part}` : ""}</span></button>)}
                  {i.parts?.length ? <span class="t-meta whitespace-nowrap">{i.parts.length} parts ↓</span> : <button type="button" onClick={() => open(k)} class="h-8 px-3 !min-h-0 rounded-full bg-grn-bg text-grn text-[12px] font-semibold cursor-pointer">{runsOf(o, i).length ? "+ Machine" : "▶ Start"}</button>}</div>
              </div>
              <div class="flex flex-wrap items-center gap-2 mt-2"><Toggle paid={!!i.paid} onChange={(v) => put(k, { paid: v })} /><MachineSelect value={i.machine} onChange={(v) => put(k, { machine: v || undefined })} /></div>
              {i.parts?.length ? <div class="grid gap-1.5 mt-2">{partRows(i, k, true)}</div> : null}
              {cs.length > 0 && <div class="flex flex-wrap gap-1.5 mt-2">{cs.map((c) => <span key={c} class="inline-flex items-center gap-1.5 rounded-full bg-c1 px-2 py-0.5 text-[12px]"><Sq hex={colourHex(c)} size="w-3.5 h-3.5" />{c}</span>)}</div>}
            </div>); })}
          {columns.length > 0 && <div class="rounded-xl border border-line p-3">
            <div class="grid grid-cols-[16px_minmax(0,1fr)_auto_auto_auto] gap-x-3 gap-y-1.5 text-[12px] items-center num">
              <span /><b class="font-sans">Colour (g)</b><span class="text-c3 text-right">Store</span><span class="text-c3 text-right">Need</span><span class="text-c3 text-right">Balance</span>
              {columns.map((c) => { const b = store[c] - need[c]; return <>
                <Sq hex={colourHex(c)} size="w-4 h-4" /><span class={`font-sans truncate ${store[c] ? "" : "text-red"}`}>{c}</span><span class="text-right">{store[c]}</span><span class="text-right">{need[c] || "—"}</span><span class={`text-right font-semibold ${b < 0 ? "text-red" : "text-grn"}`}>{b > 0 ? "+" : ""}{b}</span></>; })}
            </div></div>}
        </div>
        {!rows.length && <p class="t-meta py-6 text-center">No line items on the sheet. Use Edit line items to add one.</p>}
      </div></div>
      {stock && <>
        <div role="separator" aria-orientation="vertical" aria-label="Resize stock panel" tabIndex={0} onPointerDown={drag} onKeyDown={(e) => { if (e.key === "ArrowLeft") saveW(Math.min(640, pw + 24)); if (e.key === "ArrowRight") saveW(Math.max(300, pw - 24)); }} class="w-1.5 shrink-0 cursor-col-resize bg-line hover:bg-grn/40 focus-visible:bg-grn/40 max-[900px]:hidden" />
        <div style={{ width: `${pw}px` }} class="shrink-0 min-h-0 border-l border-line max-[900px]:!w-full max-[900px]:h-[45%] max-[900px]:border-l-0 max-[900px]:border-t"><StockPanel order={o} /></div></>}
      </div>
    </div>
    {hist !== null && <PrintHistory o={o} k={hist} onClose={() => setHist(null)} />}
    {logK !== null && (() => { const run = logRun ? batchesSig.value.find((b) => b.id === logRun && b.running) : undefined; return run ? <FinishPrint o={o} k={logK} run={run} onClose={close} /> : <StartPrint o={o} k={logK} part={logPart || undefined} group={logGroup} onClose={() => { close(); setTick({}); }} />; })()}
    {cols && <EditColours o={o} onClose={() => setCols(false)} />}
    {lines && <EditLines o={o} onClose={() => setLines(false)} />}
  </div>;
}

/** Spool search: matches for the colour first, every other spool in store below in grey. */
/** The unfinished run a spool is on (it stays locked until that run is completed or cancelled). */
const spoolBusy = (id: string, self?: string) => batchesSig.value.find((b) => b.running && b.id !== self && b.spoolIds?.includes(id));
function SpoolPicker({ colour, machine, value, onPick, self, picked, taken }: { colour: string; machine?: string; value?: string; onPick: (id: string) => void; self?: string; picked?: string[]; /** spools already chosen for another machine in the same start */ taken?: string[] }) {
  const [q, setQ] = useState(""), [mat, setMat] = useState(""), [brand, setBrand] = useState("");
  const all = spoolsSig.value.filter((s) => s.active !== false && s.status !== "empty" && s.grams > 0);
  const mats = [...new Set(all.map((s) => s.material))].sort(), brands = [...new Set(all.map((s) => s.brand).filter(Boolean))].sort();
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const hit = (s: Spool) => (!mat || s.material === mat) && (!brand || s.brand === brand) && words.every((w) => `${s.material} ${s.colour} ${s.brand} ${spoolNum(s)}`.toLowerCase().includes(w));
  const loaded = (s: Spool) => s.status === "loaded" && !!machine && machine.split(" + ").some((m) => eq(s.printer, m));
  const rank = (a: Spool, b: Spool) => Number(loaded(b)) - Number(loaded(a)) || b.grams - a.grams;
  const close = (s: Spool) => Number(eq(b0(s), colour)), b0 = (s: Spool) => s.colour;
  const match = all.filter((s) => sameFamily(s.colour, colour) && hit(s)).sort((a, b) => close(b) - close(a) || rank(a, b)), other = all.filter((s) => !sameFamily(s.colour, colour) && hit(s)).sort((a, b) => a.colour.localeCompare(b.colour) || b.grams - a.grams);
  const Row = ({ s, dim }: { s: Spool; dim?: boolean }) => { const on = picked ? picked.includes(s.id) : value === s.id, other = !!taken?.includes(s.id), busy = spoolBusy(s.id, self) ?? (other ? ({ orderNo: "this start", name: "another machine", printer: "" } as unknown as Batch) : undefined); return (
    <button type="button" disabled={!!busy} onClick={() => !busy && onPick(s.id)} aria-pressed={on} title={busy ? "In use until that print is completed" : undefined} class={`w-full grid grid-cols-[16px_minmax(0,1fr)_auto_auto] items-center gap-2.5 px-2.5 py-2 mb-1 rounded-lg text-left !min-h-0 ${busy ? "cursor-not-allowed border border-dashed border-red/50 bg-red-bg/40" : "cursor-pointer"} ${on ? "border-2 border-grn bg-grn-bg" : busy ? "" : "border border-line hover:bg-c1"} ${(dim || busy) && !on ? "opacity-60" : ""}`}>
      <Sq hex={s.hex ?? colourHex(s.colour)} size="w-4 h-4" />
      <span class="min-w-0"><b class="block text-[13px] truncate">{s.material} · {s.colour} · #{spoolNum(s)}</b><span class="block text-[11px] text-c2 truncate">{s.brand}</span>{busy && <span class="block text-[11px] font-semibold text-red truncate">In use · {busy.orderNo} · {busy.name}{busy.printer ? ` · ${busy.printer}` : ""}</span>}</span>
      {busy ? <span class="text-[10px] font-bold text-red bg-red-bg rounded px-1.5 py-0.5 whitespace-nowrap">IN USE</span> : loaded(s) ? <span class="text-[10px] font-bold text-grn bg-grn-bg rounded px-1.5 py-0.5 whitespace-nowrap">LOADED</span> : <span />}
      <span class={`num text-[13px] font-semibold ${s.grams < 200 ? "text-red" : ""}`}>{spoolGross(s)} g</span></button>); };
  const chip = (on: boolean, l: string, f: () => void) => <button type="button" onClick={f} class={`h-7 px-2.5 !min-h-0 rounded-full text-[11px] cursor-pointer border ${on ? "bg-grn-bg border-grn/40 text-grn font-semibold" : "border-line text-c3"}`}>{l}</button>;
  return <div>
    <input type="search" value={q} onInput={(e) => setQ((e.target as HTMLInputElement).value)} placeholder="Search colour, material, brand or spool no. — e.g. “white petg”, “esun”, “12”" class="w-full h-9 px-3 rounded-lg border border-line bg-c0 text-[13px] mb-2" />
    <div class="flex flex-wrap gap-1.5 mb-2">{chip(!mat, "All materials", () => setMat(""))}{mats.map((m) => chip(mat === m, m, () => setMat(mat === m ? "" : m)))}
      <select value={brand} onChange={(e) => setBrand((e.target as HTMLSelectElement).value)} class="h-7 px-2 rounded-full border border-line text-[11px] bg-c0 cursor-pointer"><option value="">Brand ▾</option>{brands.map((b) => <option key={b}>{b}</option>)}</select></div>
    <div class="max-h-[38vh] overflow-y-auto pr-1">
      {!picked && <><div class="text-[10.5px] font-bold tracking-wide text-c2 uppercase my-1">{colour} family · any material (PLA, Silk, Matte, PETG…)</div>
      {match.length ? match.map((s) => <Row key={s.id} s={s} />) : <p class="t-meta mb-2">No {colour} spool in store{q || mat || brand ? " for this search" : ""}.</p>}
      {other.length > 0 && <div class="text-[10.5px] font-bold tracking-wide text-c2 uppercase mt-3 mb-1">Any other spool · the colour above is only a reference</div>}</>}
      {picked ? [...match, ...other].map((s) => <Row key={s.id} s={s} />) : other.map((s) => <Row key={s.id} s={s} />)}
    </div>
  </div>;
}
/** The number written on the spool in the store (its slot), never the internal id. */
const spoolNum = (s: Spool) => String(s.slot ?? s.spoolNo);
const spoolName = (id?: string) => { const s = spoolsSig.value.find((x) => x.id === id); return s ? { s, t: `${s.material} · ${s.colour} · #${spoolNum(s)}` } : null; };
/** Fullest spool of a colour, preferring the one loaded on this machine. */
const bestSpool = (colour: string, machine?: string, skip: string[] = []) => spoolsSig.value.filter((s) => s.active !== false && s.status !== "empty" && s.grams > 0 && sameFamily(s.colour, colour) && !spoolBusy(s.id) && !skip.includes(s.id)).sort((a, b) => Number(eq(b.colour, colour)) - Number(eq(a.colour, colour)) || Number(b.status === "loaded" && eq(b.printer, machine)) - Number(a.status === "loaded" && eq(a.printer, machine)) || b.grams - a.grams)[0]?.id;

function Head({ i, k, f, children }: { i: LineItem; k: number; f: ReturnType<typeof floorLine>; children?: preact.ComponentChildren }) {
  return <div class="flex gap-4 mb-4"><Thumb thumb={i.thumb} full={i.img} alt={i.name} class="w-24 h-24 !rounded-xl" />
    <div class="min-w-0 text-[13px] leading-relaxed">{children}<div class="text-c3">Sr {k + 1} · Qty {i.qty} · <b class="text-c4">{f.printed} printed · {f.remaining} pending</b>{f.wasted ? <span class="text-red"> · {f.wasted} wasted</span> : null}</div>
      <div class="flex flex-wrap items-center gap-1 mt-1">{lineColours(i).map((c) => <Sq key={c} hex={colourHex(c)} size="w-3.5 h-3.5" />)}<span class="text-c3 ml-1">{lineColours(i).join(" · ") || "No colours set — use Edit colours"}</span></div></div></div>;
}
const inp = "h-9 w-16 px-2 rounded-lg border border-line bg-c0 text-[15px] num";

/** Every run of a line that is on a plate right now (one per machine). */
const runsOf = (o: Order, i: LineItem) => batchesSig.value.filter((b) => b.orderNo === o.no && b.name === i.name && b.running);
/** Runs of the whole piece; a cut line's part runs show on their own part rows. */
const lineRuns = (o: Order, i: LineItem) => runsOf(o, i).filter((r) => !i.parts?.length || !r.part);

/** All the parts of a cut line that are allotted to one printer, as ONE line of the Floor: one Start, one Finish, one count of material. */
function MachineRow({ o, i, k, m, open, card }: { o: Order; i: LineItem; k: number; m: string; open: (k: number, run?: string, part?: string, group?: string[]) => void; card?: boolean }) {
  const td = "px-2 py-2 text-center", ps = i.parts!.filter((p) => p.printer?.trim() === m), names = ps.map((p) => p.name);
  const per = ps.map((p) => runTotals(o, i, p.name)), good = Math.min(...per.map((t) => t.good)), failed = Math.max(...per.map((t) => t.failed)), left = Math.max(0, i.qty - good);
  const runs = runsOf(o, i).filter((r) => onParts(r).some((n) => names.includes(n)));
  const todo = ps.filter((p, x) => per[x].good < i.qty && !runs.some((r) => onParts(r).includes(p.name))).map((p) => p.name);
  const g = ps.reduce((a, p) => a + (p.g ?? 0), 0), min = ps.reduce((a, p) => a + (p.min ?? 0), 0), cols = [...new Set(ps.map((p) => p.colour).filter(Boolean))];
  const start = () => (todo.length > 1 ? open(k, "", "", todo) : open(k, "", todo[0]));
  const hrs = (n: number) => (n >= 60 ? `${Math.floor(n / 60)} h ${n % 60} min` : `${n} min`);
  const btns = <div class="flex flex-col items-center gap-1">{runs.map((run) => <button key={run.id} type="button" onClick={() => open(k, run.id)} class="!min-h-0 rounded-full bg-amb-bg text-amb px-3 py-1.5 text-[12px] font-semibold whitespace-nowrap cursor-pointer leading-tight">■ Finish<span class="block text-[9.5px] font-medium">{run.printer || m} · {run.partsOn ? `${run.partsOn.length} parts` : run.part} on plate</span></button>)}
    {todo.length > 0 ? <button type="button" onClick={start} class="h-7 px-3 !min-h-0 rounded-full bg-grn-bg text-grn text-[12px] font-semibold whitespace-nowrap cursor-pointer">{runs.length ? `▶ Start the other ${todo.length}` : todo.length > 1 ? `▶ Start all ${todo.length}` : "▶ Start"}</button> : !runs.length && <span class="text-grn text-[12px] font-semibold">✓ done</span>}</div>;
  const head = <div class="grid gap-1 min-w-0"><div class="flex items-center gap-2 flex-wrap"><b class="font-sans text-[13px]">🖨 {m}</b><span class="t-meta font-sans">{ps.length} part{ps.length > 1 ? "s" : ""} on one plate{cols.length ? ` · ${cols.join(" + ")}` : ""}{g ? ` · ${g} g` : ""}{min ? ` · ${hrs(min)}` : ""}</span></div>
    <div class="flex flex-wrap gap-1">{ps.map((p, x) => <span key={p.id} class={`inline-flex items-center rounded-full px-2 h-5 text-[11px] font-semibold font-sans ${per[x].good >= i.qty ? "bg-grn-bg text-grn" : "bg-c0 border border-line text-c4"}`}>{per[x].good >= i.qty ? "✓ " : ""}{p.name}</span>)}</div></div>;
  if (card) return <div class="rounded-lg bg-c1/70 p-2.5 grid gap-1.5"><div class="flex items-start gap-2"><div class="min-w-0 flex-1 grid gap-1">{head}<span class="t-meta">{good} good · {failed} failed · {left} left</span></div>{btns}</div></div>;
  return <tr class="border-b border-line bg-c1/50"><td class={td}>{k + 1}</td><td class={td}>{btns}</td><td /><td class="px-2.5 py-2 text-left font-sans">{head}</td>
    <td class={td}>{i.qty}</td><td class={`${td} font-semibold`}>{good}</td><td class={`${td} ${failed ? "text-red" : ""}`}>{failed}</td><td class={`${td} font-semibold`}>{left}</td><td /><td /><td class={td}>{m}</td></tr>;
}

/** One part of a cut line, shown as its own line of the Floor: name it, see its printer, colour, grams and time, start and finish it. */
function PartRow({ o, i, k, j, open, card, ticked, onTick }: { o: Order; i: LineItem; k: number; j: number; open: (k: number, run?: string, part?: string) => void; card?: boolean; ticked: boolean; onTick: () => void }) {
  const td = "px-2 py-2 text-center", p = i.parts![j], t = runTotals(o, i, p.name), runs = runsOf(o, i).filter((r) => onParts(r).includes(p.name)), left = Math.max(0, i.qty - t.good);
  const rename = (name: string) => patchOrder(o, { items: o.items.map((x, n) => (n === k ? { ...x, parts: x.parts!.map((y) => (y.id === p.id ? { ...y, name } : y)) } : x)) });
  const name = t.runs ? <b class="font-sans font-semibold text-[13px]">{p.name}</b> : <input value={p.name} aria-label={`Name of part ${j + 1}`} onInput={(e) => rename((e.target as HTMLInputElement).value)} class="h-7 px-2 rounded-md border border-line bg-c0 text-[13px] font-sans font-semibold w-full min-w-[7rem]" />;
  const spec = <span class="t-meta font-sans inline-flex items-center gap-1.5 flex-wrap"><Sq hex={colourHex(p.colour)} size="w-3 h-3" />{p.material} · {p.colour}{p.printer ? ` · ${p.printer}` : " · any printer"}{p.g ? ` · ${p.g} g` : ""}{p.min ? ` · ${p.min >= 60 ? `${Math.floor(p.min / 60)} h ${p.min % 60} min` : `${p.min} min`}` : ""}</span>;
  const tickBox = <input type="checkbox" checked={ticked} onChange={onTick} aria-label={`Tick ${p.name} to print together`} title="Tick several parts to print them together on one machine" class="w-4 h-4 !min-h-0 accent-grn cursor-pointer" />;
  const btns = <div class="flex flex-col items-center gap-1">{runs.map((run) => <button key={run.id} type="button" onClick={() => open(k, run.id)} class="!min-h-0 rounded-full bg-amb-bg text-amb px-2.5 py-1 text-[12px] font-semibold whitespace-nowrap cursor-pointer leading-tight">■ Finish<span class="block text-[9.5px] font-medium">{run.printer || "on plate"} · {run.units} pcs{run.partsOn ? ` · ${run.partsOn.length} together` : ""}</span></button>)}
    {left > 0 ? <button type="button" onClick={() => open(k, "", p.name)} class="h-7 px-2.5 !min-h-0 rounded-full bg-grn-bg text-grn text-[12px] font-semibold whitespace-nowrap cursor-pointer">{runs.length ? "+ Machine" : "▶ Start"}</button> : <span class="text-grn text-[12px] font-semibold">✓ done</span>}</div>;
  if (card) return <div class="rounded-lg bg-c1/70 p-2.5 grid gap-1.5"><div class="flex items-start gap-2">{tickBox}<span class="w-5 h-5 rounded-full bg-c4 text-c0 text-[11px] font-bold flex items-center justify-center shrink-0">{j + 1}</span><div class="min-w-0 flex-1 grid gap-1">{name}{spec}<span class="t-meta">{t.good} good · {t.failed} failed · {left} left{t.runs ? ` · ${t.g} g` : ""}</span></div>{btns}</div></div>;
  return <tr class="border-b border-line bg-c1/50"><td class={td}><span class="inline-flex items-center gap-1.5">{tickBox}{k + 1}.{j + 1}</span></td><td class={td}>{btns}</td><td />
    <td class="px-2.5 py-1.5 text-left font-sans"><div class="grid gap-0.5">{name}{spec}</div></td>
    <td class={td}>{i.qty}</td><td class={`${td} font-semibold`}>{t.good}</td><td class={`${td} ${t.failed ? "text-red" : ""}`}>{t.failed}</td><td class={`${td} font-semibold`}>{left}</td><td /><td /><td class={td}>{p.printer || "—"}</td></tr>;
}

/** One machine of a start: its own plates × copies, and its own spools. */
type RunRow = { /** pick any spools freely, ignoring the reference colours */ free?: boolean; key: string; machine: string; plates: number; per: number; part: string; sp: Record<string, string>; picked: string[]; tab: string };
const idsOf = (r: RunRow, simple?: boolean) => (simple || r.free ? r.picked : Object.values(r.sp)).filter(Boolean);

/**
 * ▶ Start: one or more machines, each with its own plates × copies and its own spools (a big piece is cut into parts and printed on several
 * printers at once, each with its own filaments). Every machine becomes its own run, finished on its own. Skip logs counts for prints made before.
 */
export function StartPrint({ o, k, onClose, simple, part: startPart, group }: { o: Order; k: number; onClose: () => void; simple?: boolean; /** several parts printed together on one plate: one machine, one choice of filament */ group?: string[]; /** start this part of a cut line: its printer, colour and spool are filled in */ part?: string }) {
  const i = o.items[k], f = floorLine(o, i), cs = lineColours(i);
  const last = pendingWeigh(o, i).slice(-1)[0];
  const spoolsFor = (machine: string, skip: string[]) => Object.fromEntries(cs.map((c) => { const j = last?.colours?.findIndex((x) => eq(x, c)) ?? -1, id = j >= 0 ? last!.spoolIds?.[j] : undefined; return [c, id && !spoolBusy(id) && !skip.includes(id) ? id : bestSpool(c, machine, skip) ?? ""]; }));
  const fresh = (skip: string[], first = false): RunRow => { const machine = first ? i.machine ?? "" : ""; return { free: !cs.length || undefined, key: crypto.randomUUID(), machine, plates: 1, per: first ? (simple ? Math.max(1, f.remaining) : i.perPlate ?? 1) : 1, part: "", sp: spoolsFor(machine, skip), picked: [], tab: "" }; };
  const [rows, setRows] = useState<RunRow[]>(() => {
    const r = fresh([], true), pt = startPart ? i.parts?.find((x) => x.name === startPart) : undefined;
    if (group && group.length > 1) {
      const ps = group.map((n) => i.parts?.find((x) => x.name === n)).filter(Boolean) as NonNullable<LineItem["parts"]>, gc = [...new Set(ps.map((x) => x.colour).filter(Boolean))], pcs = gc.length ? gc : cs;
      const common = Object.entries(ps.reduce<Record<string, number>>((m, x) => (x.printer ? { ...m, [x.printer]: (m[x.printer] ?? 0) + 1 } : m), {})).sort((a, b) => b[1] - a[1])[0]?.[0] ?? r.machine;
      const left = Math.max(1, Math.min(...ps.map((x) => i.qty - runTotals(o, i, x.name).good)));
      const sp: Record<string, string> = {}; for (const c of pcs) sp[c] = bestSpool(c, common, Object.values(sp)) ?? "";
      return [{ ...r, part: group[0], machine: common, plates: 1, per: left, sp, tab: pcs.find((c) => !sp[c]) ?? pcs[0] ?? "" }];
    }
    if (pt) { const mach = pt.printer || r.machine, pcs = pt.colour ? [pt.colour] : cs, left = Math.max(1, i.qty - runTotals(o, i, pt.name).good); return [{ ...r, part: pt.name, machine: mach, per: left, sp: Object.fromEntries(pcs.map((c) => [c, bestSpool(c, mach) ?? ""])), tab: pcs[0] ?? "" }]; }
    return [{ ...r, tab: cs.find((c) => !r.sp[c]) ?? cs[0] ?? "" }];
  });
  const [open, setOpen] = useState(0), [bad, setBad] = useState(0);
  const partOf = (name: string) => i.parts?.find((x) => x.name === name);
  /** a part prints in its own colour; a plain run uses the line's colours */
  const gcols = group && group.length > 1 ? [...new Set(group.map((n) => partOf(n)?.colour).filter(Boolean) as string[])] : null;
  const csOf = (r: RunRow) => { if (gcols?.length) return gcols; const pc = partOf(r.part)?.colour; return pc ? [pc] : cs; };
  const set = (n: number, p: Partial<RunRow>) => setRows((rs) => rs.map((r, j) => (j === n ? { ...r, ...p } : r)));
  const takenBy = (n: number) => rows.flatMap((r, j) => (j === n ? [] : idsOf(r, simple)));
  const pcsOf = (r: RunRow) => (simple ? r.per : r.plates * r.per);
  const total = rows.reduce((a, r) => a + pcsOf(r), 0);
  const rowOk = (r: RunRow, n: number) => (simple || r.free ? r.picked.length > 0 && !r.picked.some((id) => spoolBusy(id)) : csOf(r).every((c) => r.sp[c] && !spoolBusy(r.sp[c]))) && !idsOf(r, simple).some((id) => takenBy(n).includes(id)) && (rows.length < 2 || !!r.machine) && pcsOf(r) > 0;
  const machinesOk = new Set(rows.map((r) => r.machine).filter(Boolean)).size === rows.filter((r) => r.machine).length;
  const ready = rows.every(rowOk) && machinesOk;
  /** Free choice of spools: any material, colour or brand. Keys are the colour name, made unique when a colour repeats. */
  const freeSpools = (picked: string[]) => { const out: Record<string, string> = {}; for (const id of picked) { const s = spoolsSig.value.find((x) => x.id === id); let key = s?.colour || "Spool"; if (out[key]) key = `${key} · #${s ? spoolNum(s) : ""}`; out[key] = id; } return out; };
  const start = () => {
    const names = rows.map((r) => r.machine).filter(Boolean).join(" + ") || undefined;
    for (const r of rows) startPlates(o, k, { machine: r.machine || undefined, plates: simple ? 1 : r.plates, perPlate: r.per, spools: simple || r.free ? freeSpools(r.picked) : Object.fromEntries(csOf(r).map((c) => [c, r.sp[c]])), part: r.part.trim() || undefined, ...(group && group.length > 1 ? { partsOn: group } : {}), lineMachine: names });
    onClose();
  };
  const skip = () => { const r = rows[0]; logPlates(o, k, { good: total - Math.min(bad, total), wasted: Math.min(bad, total), plates: simple ? 1 : r.plates, perPlate: simple ? total : r.per, gpp: {}, deduct: false }); onClose(); };
  const add = () => { const r = fresh(rows.flatMap((x) => idsOf(x, simple))); setRows((rs) => [...rs, { ...r, tab: cs.find((c) => !r.sp[c]) ?? cs[0] ?? "" }]); setOpen(rows.length); };
  /** a bulk line: the pieces still to print are shared equally between the machines in this start (the first ones take the odd piece) */
  const spread = () => { const m = rows.length, base = Math.floor(f.remaining / m), extra = f.remaining % m; setRows((rs) => rs.map((r, j) => ({ ...r, plates: 1, per: Math.max(1, base + (j < extra ? 1 : 0)) }))); };
  const drop = (n: number) => { setRows((rs) => rs.filter((_, j) => j !== n)); setOpen(0); };
  return <Sheet huge open onClose={onClose} title={`▶ Start print · ${i.name}`}
    footer={<><Button variant="outline" onClick={onClose}>Cancel</Button>{!simple && !(group && group.length > 1) && <Button variant="outline" onClick={skip} title="Already printed before: log the counts only, no grams">Skip (already printed)</Button>}<Button onClick={start} disabled={!ready && (simple || cs.length > 0 || rows.some((r) => r.picked.length > 0))}>▶ Start {group && group.length > 1 ? `${group.length} parts together` : rows.length > 1 ? `${rows.length} machines` : "print"}</Button></>}>
    <div class="max-w-[720px] mx-auto"><Head i={i} k={k} f={f} />
    {rows.map((r, n) => {
      const on = open === n, ok = rowOk(r, n), pcs = pcsOf(r), names = simple || r.free ? r.picked.map((id) => spoolName(id)?.t).filter(Boolean) : csOf(r).map((c) => spoolName(r.sp[c])?.t).filter(Boolean);
      const dup = idsOf(r, simple).some((id) => takenBy(n).includes(id)), sameMachine = !!r.machine && rows.some((x, j) => j !== n && x.machine === r.machine);
      return <div key={r.key} class={`rounded-2xl border mb-3 ${on ? "border-c4/40 bg-c0" : "border-line bg-c0"}`}>
        <div class="flex items-center gap-2 px-3 py-2.5">
          <span class="w-5 h-5 rounded-full bg-c4 text-c0 text-[11px] font-bold flex items-center justify-center shrink-0">{n + 1}</span>
          <button type="button" onClick={() => setOpen(on ? -1 : n)} aria-expanded={on} class="min-w-0 flex-1 text-left !min-h-0 cursor-pointer"><b class="block text-[13px]">{r.machine || (rows.length > 1 ? "Pick a machine" : "Any machine")} · {pcs} pcs{r.part ? ` · ${r.part}` : ""}</b>
            <span class={`block text-[11.5px] truncate ${ok ? "text-c2" : "text-amb"}`}>{names.length ? names.join(" · ") : simple || r.free ? "No spools yet" : csOf(r).length ? "Pick a spool for each colour" : "No colours set"}{dup ? " · a spool is also used on another machine" : sameMachine ? " · this machine is used twice" : ""}</span></button>
          {rows.length > 1 && <button type="button" onClick={() => drop(n)} class="text-[12px] text-red underline cursor-pointer !min-h-0 shrink-0">Remove</button>}
        </div>
        {on && <div class="px-3 pb-3 border-t border-line pt-3">
          <div class="flex flex-wrap items-end gap-2 p-3 rounded-xl bg-c1 mb-1">
            <label class="flex flex-col gap-1 text-[11px] text-c2">Machine<MachineSelect value={r.machine} onChange={(v) => set(n, { machine: v })} cls="!h-9 !bg-c0 border border-line" /></label>
            {simple ? <label class="flex flex-col gap-1 text-[11px] text-c2">Quantity to print<input type="number" min={1} class={inp} value={r.per} onInput={(e) => set(n, { per: Math.max(1, n0((e.target as HTMLInputElement).value)) })} /></label> : <>
            <label class="flex flex-col gap-1 text-[11px] text-c2">Plates<input type="number" min={1} class={inp} value={r.plates} onInput={(e) => set(n, { plates: Math.max(1, n0((e.target as HTMLInputElement).value)) })} /></label>
            <span class="pb-2 text-c2">×</span>
            <label class="flex flex-col gap-1 text-[11px] text-c2">Per plate<input type="number" min={1} class={inp} value={r.per} onInput={(e) => set(n, { per: Math.max(1, n0((e.target as HTMLInputElement).value)) })} /></label>
            <b class="pb-1.5 text-[17px] num">= {pcs} pcs</b></>}
            <label class="flex flex-col gap-1 text-[11px] text-c2 grow min-w-[10rem]" title="Only when a big piece is cut and each machine prints one part">Part (optional)
              {group && group.length > 1 ? <span class="min-h-9 px-2 py-1.5 rounded-lg bg-c0 border border-line text-[13px] font-semibold break-words">{group.join(" + ")} <span class="font-normal text-c3">· one plate</span></span> : i.parts?.length ? <select class="h-9 px-2 rounded-lg border border-line bg-c0 text-[13px] cursor-pointer" value={r.part} onChange={(e) => { const nm = (e.target as HTMLSelectElement).value, pt = partOf(nm), mach = pt?.printer || r.machine, pcs2 = pt?.colour ? [pt.colour] : cs; set(n, { part: nm, machine: mach, sp: Object.fromEntries(pcs2.map((c) => [c, bestSpool(c, mach, takenBy(n)) ?? ""])), tab: pcs2[0] ?? "" }); }}><option value="">Whole piece</option>{i.parts.map((x) => <option key={x.id}>{x.name}</option>)}</select>
                : <input class="h-9 px-2 rounded-lg border border-line bg-c0 text-[13px]" placeholder="e.g. Left half" value={r.part} onInput={(e) => set(n, { part: (e.target as HTMLInputElement).value })} />}</label>
          </div>
          {!simple && <label class="flex items-start gap-2 mt-3 text-[12.5px] cursor-pointer"><input type="checkbox" class="mt-0.5 accent-grn" checked={!!r.free} onChange={(e) => set(n, { free: (e.target as HTMLInputElement).checked })} />
            <span><b>Pick any spools freely</b><span class="block text-[11.5px] text-c2">The colours of this design are only a reference. Use any material, colour, brand or number of spools (e.g. Silk White instead of Pure White).</span></span></label>}
          {simple || r.free ? <>
            <div class="text-[10.5px] font-bold tracking-wide text-c2 uppercase mt-4 mb-1.5">Filaments on this machine · tap any spools: multi-material, multi-colour, any brand</div>
            <div class="flex flex-wrap gap-1.5 mb-2 min-h-8">{r.picked.length ? r.picked.map((id) => { const nm = spoolName(id); return nm && <button key={id} type="button" onClick={() => set(n, { picked: r.picked.filter((x) => x !== id) })} class="h-8 px-2.5 !min-h-0 rounded-full bg-c4 text-c0 text-[12px] font-semibold flex items-center gap-1.5 cursor-pointer"><Sq hex={nm.s.hex ?? colourHex(nm.s.colour)} size="w-3.5 h-3.5" />{nm.t} ✕</button>; }) : <span class="t-meta">None picked yet</span>}</div>
            <SpoolPicker colour="" machine={r.machine} picked={r.picked} taken={takenBy(n)} onPick={(id) => set(n, { picked: r.picked.includes(id) ? r.picked.filter((x) => x !== id) : [...r.picked, id] })} />
          </> : csOf(r).length ? <>
            <div class="flex flex-wrap gap-1.5 mt-4 mb-2">{csOf(r).map((c) => { const nm = spoolName(r.sp[c]); return <button key={c} type="button" onClick={() => set(n, { tab: c })} class={`h-8 px-3 !min-h-0 rounded-full flex items-center gap-1.5 text-[12px] font-semibold cursor-pointer ${r.tab === c ? "bg-c4 text-c0" : "bg-c1 text-c4"}`}>
              <Sq hex={colourHex(c)} size="w-3.5 h-3.5" />{c}{nm ? <span class={r.tab === c ? "opacity-80" : "text-grn"}>✓ #{spoolNum(nm.s)}</span> : <span class="opacity-70">· pick spool</span>}</button>; })}</div>
            {r.tab && <SpoolPicker colour={r.tab} machine={r.machine} value={r.sp[r.tab]} taken={takenBy(n)} onPick={(id) => { const next = { ...r.sp, [r.tab]: id }; const nx = csOf(r).find((c) => !next[c]); set(n, { sp: next, ...(nx ? { tab: nx } : {}) }); }} />}
          </> : <p class="t-meta mt-3">No colours set for this design. Use Edit colours first, or Skip to log counts only.</p>}
        </div>}
      </div>; })}
    <button type="button" onClick={add} class="w-full h-10 rounded-xl border border-dashed border-c2 text-[13px] font-medium text-c3 cursor-pointer !min-h-0">+ Add another machine <span class="t-meta">· its own plates and its own filaments</span></button>
    <div class="flex flex-wrap items-center gap-3 mt-3 text-[12px] text-c3"><b class="text-c4 text-[14px] num">{total} pcs on {rows.length} machine{rows.length > 1 ? "s" : ""}</b>
      {rows.length > 1 && f.remaining > 1 && <button type="button" onClick={spread} class="underline underline-offset-2 font-semibold text-c4 cursor-pointer !min-h-0" title="Share the pieces still to print equally between these machines">Share the {f.remaining} pcs left equally</button>}
      {!simple && <label class="ml-auto flex items-center gap-1.5" title="Only for Skip (already printed)">Wasted (if skipping)<input type="number" min={0} class={inp} value={bad} onInput={(e) => setBad(n0((e.target as HTMLInputElement).value))} /></label>}</div>
    </div>
  </Sheet>;
}

/** ■ Finish: pieces off the plates (good + wasted) and grams per plate from the spools picked at Start. */
export function FinishPrint({ o, k, run, onClose, simple }: { o: Order; k: number; run: Batch; onClose: () => void; simple?: boolean }) {
  const i = o.items[k], f = floorLine(o, i);
  const cs = run.colours?.length ? run.colours : lineColours(i);
  const [plates, setPlates] = useState(run.plates ?? 1), [per, setPer] = useState(run.perPlate ?? i.perPlate ?? 1), [bad, setBad] = useState(0), [hrs, setHrs] = useState(runHours(run));
  const [sp, setSp] = useState<Record<string, string>>(() => Object.fromEntries(cs.map((c, j) => [c, run.spoolIds?.[j] ?? bestSpool(c, run.printer) ?? ""])));
  const [g, setG] = useState<Record<string, number>>(() => Object.fromEntries(cs.map((c) => [c, i.gpp?.[c] ?? 0])));
  const [chg, setChg] = useState<string | null>(null), [w, setW] = useState<Record<string, number>>({}), [pg, setPg] = useState<Record<string, number>>({});
  const prior = pendingOn(o, i, run.spoolIds ?? [], run.id), priorPlates = prior.reduce((a, x) => a + (x.plates ?? 1), 0), priorPcs = prior.reduce((a, x) => a + x.units, 0);
  const pcs = plates * per, wasted = Math.min(bad, pcs), perG = cs.reduce((a, c) => a + (g[c] || 0), 0), allPlates = plates + priorPlates;
  /** Spools stay loaded between plates: log counts now, weigh once when the batch is done. On by default while pieces remain. */
  const [later, setLater] = useState(!simple && f.remaining > pcs);
  /** Spool weighed at the end (gross): grams used = gross before − gross now, spread over every plate since it was loaded. */
  const weigh = (c: string, v: number) => { setW({ ...w, [c]: v }); const n = spoolName(sp[c]); if (n && v > 0) setG({ ...g, [c]: Math.max(0, Math.round((spoolGross(n.s) - v) / allPlates)) }); };
  const done = () => { finishPlates(o, k, run.id, { plates, perPlate: per, wasted, spools: Object.fromEntries(cs.filter((c) => sp[c]).map((c) => [c, sp[c]])), gpp: g, later, hours: hrs, partG: run.partsOn ? pg : undefined }); onClose(); };
  const when = run.at ? new Date(run.at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : "";
  return <Sheet huge open onClose={onClose} title={`■ Complete print · ${i.name}`}
    footer={<><Button variant="outline" class="mr-auto text-red" onClick={() => { cancelRun(run.id); onClose(); }}>Cancel this run</Button><Button variant="outline" onClick={onClose}>Close</Button><Button onClick={done} disabled={!pcs}>Complete log</Button></>}>
    <div class="max-w-[680px] mx-auto"><Head i={i} k={k} f={f}><span class="inline-block rounded-md bg-amb-bg text-amb text-[11px] font-bold px-2 py-0.5 mb-1">ON PLATE{run.printer ? ` · ${run.printer}` : ""}{run.partsOn ? ` · ${run.partsOn.length} parts together` : run.part ? ` · ${run.part}` : ""}{when ? ` · started ${when}` : ""}</span></Head>
    <div class="flex flex-wrap items-end gap-2 p-3 rounded-xl bg-c1">
      {simple ? <label class="flex flex-col gap-1 text-[11px] text-c2">Pieces printed<input type="number" min={1} class={inp} value={per} onInput={(e) => setPer(Math.max(1, n0((e.target as HTMLInputElement).value)))} /></label> : <>
      <label class="flex flex-col gap-1 text-[11px] text-c2">Plates<input type="number" min={1} class={inp} value={plates} onInput={(e) => setPlates(Math.max(1, n0((e.target as HTMLInputElement).value)))} /></label>
      <span class="pb-2 text-c2">×</span>
      <label class="flex flex-col gap-1 text-[11px] text-c2">Per plate<input type="number" min={1} class={inp} value={per} onInput={(e) => setPer(Math.max(1, n0((e.target as HTMLInputElement).value)))} /></label>
      <b class="pb-1.5 text-[17px] num">= {pcs} pcs</b></>}
      <label class="ml-auto flex flex-col gap-1 text-[11px] text-c2">{simple ? "Failed (of these)" : "Wasted (of these)"}<input type="number" min={0} max={pcs} class={`${inp} !border-red/40`} value={bad} onInput={(e) => setBad(n0((e.target as HTMLInputElement).value))} /></label>
    </div>
    <label class="flex items-center gap-2 mt-3 text-[12px] text-c2">Print time (hours)<input type="number" min={0} step="0.1" class={`${inp} w-24`} value={hrs || ""} onInput={(e) => setHrs(Number((e.target as HTMLInputElement).value) || 0)} aria-label="Print time in hours" /><span>{run.printer ? `logged on ${run.printer}: machine hours, service count, failure %, machine and power cost` : "no printer picked, so nothing is logged on a printer"}</span></label>
    {run.partsOn && i.parts?.length ? <div class="mt-1.5 text-[12px] rounded-lg bg-c1 px-3 py-2">This plate printed {run.partsOn.length} parts together: {run.partsOn.join(", ")}. Each good copy counts for every one of them. The grams and hours are for the whole plate. They are shared equally between the parts unless you type what each part used below.</div> : run.part && i.parts?.length ? <div class="mt-1.5 text-[12px] rounded-lg bg-c1 px-3 py-2">This run printed “{run.part}”, one part of each piece. A piece is counted automatically once every part of it has printed good. Grams and hours are logged either way.</div> : null}
    <div class="t-meta mt-1.5">{pcs - wasted} good · {wasted} wasted. A plate halted mid-print counts all its pieces as wasted.</div>
    {!simple && <label class="flex items-start gap-2 mt-4 p-3 rounded-xl border border-line cursor-pointer text-[13px]"><input type="checkbox" class="mt-0.5 accent-grn" checked={later} onChange={(e) => setLater((e.target as HTMLInputElement).checked)} />
      <span><b>Spools stay loaded — weigh at the end</b><span class="block text-[12px] text-c2">Logs pieces only. Print the next plates from the same spools; weigh once when the batch is done and the grams are split over every plate.</span></span></label>}
    {!later && prior.length > 0 && <div class="mt-2 text-[12px] rounded-lg bg-amb-bg text-amb px-3 py-2">This weigh covers <b>{allPlates} plates</b> — {priorPlates} earlier ({priorPcs} pcs, not yet weighed) + {plates} now.</div>}
    {!later && <>
    <div class="text-[10.5px] font-bold tracking-wide text-c2 uppercase mt-4 mb-1.5">Material used · weigh each spool now (gross), or type grams {simple ? "used" : "per plate"}</div>
    {cs.map((c) => { const n = spoolName(sp[c]); return <div key={c} class="mb-1.5">
      <div class="grid grid-cols-[16px_minmax(0,1fr)_auto_auto_64px_12px] items-center gap-2.5 px-2.5 py-2 rounded-lg border border-line">
        <Sq hex={n?.s.hex ?? colourHex(c)} size="w-4 h-4" />
        <span class="min-w-0"><b class="block text-[13px] truncate">{n ? n.t : `${c} · no spool picked`}</b><span class="block text-[11px] text-c2 truncate">{n ? `${n.s.brand} · ${spoolGross(n.s)} g gross before` : "Pick a spool"}</span></span>
        <button type="button" onClick={() => setChg(chg === c ? null : c)} class="text-[12px] font-semibold text-grn !min-h-0 cursor-pointer">{chg === c ? "Done" : "Change"}</button>
        <label class="flex items-center gap-1 text-[11px] text-c2">Now<input type="number" min={0} aria-label={`${c} spool weight now, gross`} class="h-8 w-20 px-1.5 rounded-md border border-line bg-c0 text-right num" value={w[c] || ""} placeholder="gross g" onInput={(e) => weigh(c, n0((e.target as HTMLInputElement).value))} /></label>
        <input type="number" min={0} aria-label={`${c} grams per plate`} class="h-8 w-16 px-1.5 rounded-md border border-line bg-c0 text-right num" value={g[c] || ""} placeholder="0" onInput={(e) => setG({ ...g, [c]: n0((e.target as HTMLInputElement).value) })} /><span class="text-c2 text-[12px]">g</span>
      </div>
      {chg === c && <div class="mt-1.5 p-2 rounded-lg bg-c1"><SpoolPicker colour={c} machine={run.printer} self={run.id} value={sp[c]} onPick={(id) => { setSp({ ...sp, [c]: id }); setChg(null); }} /></div>}
    </div>; })}
    <div class="mt-3 text-[13px]">Deduct <b class="num">{perG * allPlates} g</b> from store <span class="text-c2">· {allPlates} plate{allPlates > 1 ? "s" : ""} × {perG} g</span></div></>}
    {run.partsOn && run.partsOn.length > 1 && <details class="mt-4 rounded-xl border border-line"><summary class="px-3 py-2.5 text-[13px] font-semibold cursor-pointer">What each part used <span class="font-normal text-c2">· optional</span></summary>
      <div class="px-3 pb-3 grid gap-1.5"><p class="t-meta">Only if you know it, for example from the slicer. Parts you leave empty share what is left of the plate's total equally.</p>
        {run.partsOn.map((n) => <label key={n} class="flex items-center gap-2 text-[13px]"><span class="min-w-0 flex-1 break-words">{n}</span><input type="number" min={0} aria-label={`Grams used by ${n}`} class="h-8 w-20 px-1.5 rounded-md border border-line bg-c0 text-right num" value={pg[n] || ""} placeholder="auto" onInput={(e) => setPg({ ...pg, [n]: n0((e.target as HTMLInputElement).value) })} /><span class="text-c2 text-[12px]">g</span></label>)}
        {Object.values(pg).some((v) => v > 0) && <p class="t-meta num">Typed for parts: {Object.values(pg).reduce((a, x) => a + x, 0)} g{!later && perG * allPlates > 0 ? ` of ${perG * allPlates} g on the plate` : ""}</p>}</div></details>}
    </div>
  </Sheet>;
}

/** Store colours (in-stock spools) then library colours with no stock, each A–Z, so names always match the store. */
function storeColours() {
  const stocked: string[] = [];
  for (const sp of spoolsSig.value) if (sp.active !== false && sp.status !== "empty" && sp.colour?.trim() && !stocked.some((x) => eq(x, sp.colour))) stocked.push(sp.colour.trim());
  const rest = filMasterSig.value.colours.map((c) => c.name).filter((n) => !stocked.some((x) => eq(x, n)));
  return { stocked: sortAbc(stocked), rest: sortAbc(rest) };
}
const kg = (g: number) => (g >= 1000 ? `${(g / 1000).toFixed(1)} kg` : `${g} g`);
/** Swatch picker: a colour block beside every name, sorted A–Z, with a filter box. */
function ColourPicker({ skip, onPick, label }: { skip: (n: string) => boolean; onPick: (n: string) => void; label: string }) {
  const [q, setQ] = useState("");
  const { stocked, rest } = storeColours();
  const f = (xs: string[]) => xs.filter((n) => !skip(n) && n.toLowerCase().includes(q.trim().toLowerCase()));
  const item = (n: string, stock: boolean) => <button key={n} type="button" onClick={() => onPick(n)} class="flex items-center gap-2 px-2 py-1.5 rounded-md text-left text-[13px] hover:bg-c1 !min-h-0 cursor-pointer min-w-0">
    <Sq hex={colourHex(n)} size="w-5 h-5 shrink-0" /><span class="truncate">{n}</span>{stock && <span class="ml-auto text-[11px] text-c2 num shrink-0">{kg(colourStore(n))}</span>}</button>;
  const grid = "grid grid-cols-[repeat(auto-fill,minmax(170px,1fr))] gap-0.5";
  return <div class="w-full">
    <input autoFocus value={q} placeholder={`${label} — type to filter`} onInput={(e) => setQ((e.target as HTMLInputElement).value)} class="h-9 w-full max-w-xs px-2 mb-2 rounded-lg border border-line bg-c0 text-[13px]" />
    <div class="max-h-[40vh] overflow-y-auto">
      <div class="text-[10.5px] font-bold tracking-wide text-c2 uppercase px-2 mb-1">In store</div><div class={grid}>{f(stocked).map((n) => item(n, true))}</div>
      {f(rest).length > 0 && <><div class="text-[10.5px] font-bold tracking-wide text-c2 uppercase px-2 mt-2 mb-1">Library · no stock</div><div class={grid}>{f(rest).map((n) => item(n, false))}</div></>}
    </div>
  </div>;
}

/** Master grid: tick the colours each design uses. Tap a column name to swap it for a store colour or remove it. Nothing changes until Save. */
function EditColours({ o, onClose }: { o: Order; onClose: () => void }) {
  const lib = filMasterSig.value.colours;
  const [sel, setSel] = useState(() => Object.fromEntries(o.items.map((i, k) => [k, lineColours(i)])) as Record<number, string[]>);
  const [extra, setExtra] = useState<string[]>(o.floorCols ?? []);
  const [ren, setRen] = useState<Record<string, string>>({}), [edit, setEdit] = useState<string | null>(null), [adding, setAdding] = useState(false);
  const cols = useMemo(() => { const u = new Set([...Object.values(sel).flat(), ...extra]); return [...lib.map((c) => c.name).filter((n) => [...u].some((x) => eq(x, n))), ...[...u].filter((x) => !lib.some((c) => eq(c.name, x)))]; }, [sel, extra]);
  const flip = (k: number, c: string) => setSel({ ...sel, [k]: sel[k].some((x) => eq(x, c)) ? sel[k].filter((x) => !eq(x, c)) : [...sel[k], c] });
  const uniq = (xs: string[]) => xs.filter((x, j) => xs.findIndex((y) => eq(x, y)) === j);
  /** Replace colour `c` with `to` everywhere (to = "" removes the column). */
  const swap = (c: string, to: string) => {
    const f = (xs: string[]) => uniq(xs.flatMap((x) => (eq(x, c) ? (to ? [to] : []) : [x])));
    setSel(Object.fromEntries(Object.entries(sel).map(([k, v]) => [k, f(v)])));
    setExtra(f(extra));
    const next: Record<string, string> = {}; for (const [from, t] of Object.entries(ren)) next[from] = eq(t, c) ? to : t;
    if (!Object.keys(ren).some((k) => eq(k, c)) && !Object.values(ren).some((t) => eq(t, c))) next[c] = to;
    setRen(next); setEdit(null);
  };
  const gppOf = (gpp?: Record<string, number>) => { if (!gpp) return gpp; const out: Record<string, number> = {};
    for (const [c, g] of Object.entries(gpp)) { const hit = Object.keys(ren).find((k) => eq(k, c)); const to = hit === undefined ? c : ren[hit]; if (to) out[to] = (out[to] ?? 0) + g; } return out; };
  const save = () => { patchOrder(o, { floorCols: extra, items: o.items.map((i, k) => ({ ...i, colours: sel[k], gpp: gppOf(i.gpp) })) }); onClose(); };
  const pick = "h-9 px-2 rounded-lg text-[13px] font-semibold cursor-pointer";
  return <Sheet huge open onClose={onClose} title={`Edit colours · ${o.no}`}
    footer={<><button type="button" onClick={() => { setAdding(!adding); setEdit(null); }} class={`${pick} mr-auto border border-dashed border-grn text-grn`}>＋ Add colour from store</button>
      <Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={save}>Save colours</Button></>}>
    <p class="t-meta mb-3">Tap a box to tick the colours each design uses. Tap a colour's name to change it to a store colour or remove it. Striped columns have no stock in the store.</p>
    {edit && <div class="sticky top-0 z-10 shadow mb-3 p-2.5 rounded-lg bg-c1 flex flex-wrap items-center gap-2 text-[13px]">
      <Sq hex={colourHex(edit)} size="w-4 h-4" /><b>{edit}</b><span class="text-c2">{colourStore(edit) ? `· ${kg(colourStore(edit))} in store` : "· not in store"}</span>
      <Button variant="outline" onClick={() => swap(edit, "")}>Remove column</Button>
      <Button variant="outline" class="ml-auto" onClick={() => setEdit(null)}>Done</Button>
      <ColourPicker label="Change to" skip={(n) => eq(n, edit)} onPick={(n) => swap(edit, n)} />
    </div>}
    {adding && !edit && <div class="sticky top-0 z-10 shadow mb-3 p-2.5 rounded-lg bg-c1 flex flex-wrap items-center gap-2 text-[13px]">
      <b>Add a colour column</b><Button variant="outline" class="ml-auto" onClick={() => setAdding(false)}>Done</Button>
      <ColourPicker label="Add" skip={(n) => cols.some((x) => eq(x, n))} onPick={(n) => setExtra([...extra, n])} />
    </div>}
    <table class="w-full border-collapse text-[13px]">
      <thead><tr class="border-b border-line"><th class="px-1 py-2 text-[11px] text-c2">Image</th><th class="px-1 py-2 text-left text-[11px] text-c2">Design</th>
        {cols.map((c) => <th key={c} class={`px-1 py-2 align-top w-12 ${colourStore(c) ? "" : "floor-empty text-red"}`}><button type="button" title={`Change or remove ${c}`} onClick={() => { setEdit(edit === c ? null : c); setAdding(false); }} class={`flex flex-col items-center gap-1 mx-auto !min-h-0 cursor-pointer rounded-md px-0.5 hover:bg-c1 ${edit === c ? "ring-2 ring-grn" : ""}`}><Sq hex={colourHex(c)} size="w-4 h-4" /><span class="text-[11px] leading-none whitespace-nowrap [writing-mode:vertical-rl] rotate-180 h-[88px] text-left underline decoration-dotted underline-offset-2">{c}</span></button></th>)}</tr></thead>
      <tbody>{o.items.map((i, k) => i.offFloor ? null : <tr key={k} class="border-b border-line">
        <td class="px-1 py-1.5"><Thumb thumb={i.thumb} full={i.img} alt={i.name} class="w-14 h-14" /></td>
        <td class="px-1 py-1.5">{i.name}</td>
        {cols.map((c) => { const on = sel[k].some((x) => eq(x, c)); return <td key={c} class={`text-center ${colourStore(c) ? "" : "floor-empty"}`}>
          <button type="button" aria-pressed={on} aria-label={`${i.name} uses ${c}`} onClick={() => flip(k, c)} class={`w-6 h-6 !min-h-0 rounded-[5px] cursor-pointer ${on ? "shadow-[inset_0_0_0_1px_rgb(0_0_0/0.2)]" : "border-[1.5px] border-line bg-c0"}`} style={on ? { background: colourHex(c) ?? "var(--c-3)" } : undefined} /></td>; })}
      </tr>)}</tbody>
    </table>
  </Sheet>;
}

/** Fix any line item. Lower printed / wasted can return grams to stock. Delete removes from this sheet only. */
function EditLines({ o, onClose }: { o: Order; onClose: () => void }) {
  const [items, setItems] = useState<LineItem[]>(() => o.items.map((i) => { const f = floorLine(o, i); return { ...i, printed: f.printed + f.extra, failed: f.wasted }; }));
  const [ask, setAsk] = useState<{ g: Record<string, number>; text: string } | null>(null);
  const put = (k: number, p: Partial<LineItem>) => setItems(items.map((x, j) => (j === k ? { ...x, ...p } : x)));
  const attach = async (k: number, file?: File | null) => { if (!file?.type.startsWith("image/")) return; const [full, thumb] = await Promise.all([shrinkImage(file, 1920, 0.72), shrinkImage(file, 160, 0.6)]); put(k, { img: storeMedia(full, `${o.no} ${items[k].name}`), thumb }); };
  const returns = () => { const g: Record<string, number> = {}, what: string[] = [];
    o.items.forEach((old, k) => { const nw = items[k]; if (!nw) return; const f = floorLine(o, old); const drop = Math.max(0, f.printed + f.extra - (nw.printed ?? 0)) + Math.max(0, f.wasted - (nw.failed ?? 0));
      if (drop > 0) { what.push(`${old.name} −${drop} pcs`); for (const [c, x] of Object.entries(gramsFor(old, drop))) g[c] = (g[c] ?? 0) + x; } });
    return { g, text: what.join(" · ") }; };
  const commit = (back: boolean) => { if (back && ask) returnGrams(o, "Correction", ask.g); saveFloorLines(o, items.filter((i) => i.name.trim())); onClose(); };
  const save = () => { const r = returns(); if (Object.keys(r.g).length) setAsk(r); else commit(false); };
  const inp = "h-9 px-2 rounded-lg bg-c1 text-[13px] w-full min-w-0";
  if (ask) { const total = Object.values(ask.g).reduce((a, x) => a + x, 0); return <Sheet open onClose={() => setAsk(null)} title="Return grams to stock?"
    footer={<><Button variant="outline" onClick={() => setAsk(null)}>Cancel</Button><Button variant="outline" onClick={() => commit(false)}>No, keep stock</Button><Button onClick={() => commit(true)}>Yes, return {total} g</Button></>}>
    <p class="text-[13px] leading-relaxed">{ask.text}.<br />That's about <b>{total} g</b> ({Object.entries(ask.g).map(([c, x]) => `${c} ${x}`).join(" · ")}).</p></Sheet>; }
  return <Sheet huge open onClose={onClose} title={`Edit line items · ${o.no}`}
    footer={<><Button variant="outline" class="mr-auto" onClick={() => setItems([...items, { name: "", material: items[0]?.material ?? "PLA", colour: "", qty: 1, price: 0, cost: 0 }])}>＋ Add line item</Button><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={save}>Save changes</Button></>}>
    <p class="t-meta mb-3">Fix any mistake. Nothing changes until you save. Removing a row hides it from this sheet only; the order keeps it.</p>
    <div class="overflow-x-auto"><table class="w-full min-w-[860px] border-collapse text-[13px]">
      <thead><tr class="border-b border-line text-[11px] text-c2">{["Img", "Name", "Qty", "Printed", "Wasted", "Model", "Machine", "Size", "Height mm", "Rough g/pc", ""].map((h) => <th key={h} class={`px-1 py-2 ${h === "Name" ? "text-left" : ""}`}>{h}</th>)}</tr></thead>
      <tbody>{items.map((i, k) => i.offFloor ? null : <tr key={k} class="border-b border-line">
        <td class="px-1 py-1.5 w-14"><Thumb thumb={i.thumb} full={i.img} alt={i.name || "Item"} class="w-11 h-11" onAdd={(fl) => attach(k, fl)} />
          <label class="block text-[10px] text-grn text-center cursor-pointer">{i.thumb || i.img ? "Change" : "Upload"}<input type="file" accept="image/*" class="sr-only" onChange={(e) => attach(k, (e.target as HTMLInputElement).files?.[0])} /></label></td>
        <td class="px-1 min-w-[10rem]"><input class={inp} value={i.name} placeholder="Item name" onInput={(e) => put(k, { name: (e.target as HTMLInputElement).value })} /></td>
        {(["qty", "printed", "failed"] as const).map((key) => <td key={key} class="px-1 w-[72px]"><input type="number" min={0} class={`${inp} text-center num`} value={i[key] ?? 0} onInput={(e) => put(k, { [key]: n0((e.target as HTMLInputElement).value) })} /></td>)}
        <td class="px-1 text-center"><Toggle paid={!!i.paid} onChange={(v) => put(k, { paid: v })} /></td>
        <td class="px-1 text-center"><MachineSelect value={i.machine} onChange={(v) => put(k, { machine: v || undefined })} /></td>
        <td class="px-1 text-center"><select value={i.designSize ?? ""} aria-label="Design size" onChange={(e) => put(k, { designSize: ((e.target as HTMLSelectElement).value || undefined) as LineItem["designSize"] })} class="h-9 px-1 rounded-lg bg-c1 text-[13px] cursor-pointer"><option value="">—</option>{["S", "M", "L"].map((x) => <option key={x}>{x}</option>)}</select></td>
        <td class="px-1 w-[76px]"><input type="number" min={0} aria-label="Height in mm" placeholder="mm" class={`${inp} text-center num`} value={i.heightMm ?? ""} onInput={(e) => put(k, { heightMm: n0((e.target as HTMLInputElement).value) || undefined })} /></td>
        <td class="px-1 w-[84px]"><input type="number" min={0} aria-label="Rough total grams per piece" placeholder="g" title="Rough total grams per piece. Used for planning only; sliced grams replace it once a print is logged." class={`${inp} text-center num`} value={i.roughG ?? ""} onInput={(e) => put(k, { roughG: n0((e.target as HTMLInputElement).value) || undefined })} /></td>
        <td class="px-1 w-9"><button type="button" aria-label={`Remove ${i.name} from sheet`} onClick={() => put(k, { offFloor: true })} class="w-8 h-8 !min-h-0 rounded-lg text-red hover:bg-red-bg cursor-pointer">🗑</button></td>
      </tr>)}</tbody>
    </table></div>
  </Sheet>;
}

/** Runs of a line taken off the plate (finished or skipped), newest first. */
const pastRuns = (o: Order, i: LineItem) => batchesSig.value.filter((b) => b.orderNo === o.no && b.name === i.name && !b.running).sort((a, b) => (b.endAt ?? b.at ?? "").localeCompare(a.endAt ?? a.at ?? ""));
const hasHistory = (o: Order, i: LineItem) => pastRuns(o, i).length > 0 || runsOf(o, i).length > 0;
const when = (iso?: string) => iso ? new Date(iso).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—";

/** 🕘 History of one line: every run with its machine, spools, grams, time, good and failed pieces. Read only. */
function PrintHistory({ o, k, onClose }: { o: Order; k: number; onClose: () => void }) {
  const i = o.items[k], f = floorLine(o, i), runs = [...runsOf(o, i), ...pastRuns(o, i)];
  const spoolsOf = (b: Batch) => (b.spoolIds?.length ? b.spoolIds.map((id, j) => { const n = spoolName(id); return { id, t: n?.t ?? (b.spool?.split(" + ")[j] ?? "Spool removed from store"), hex: n?.s.hex ?? colourHex(n?.s.colour ?? b.colours?.[j] ?? ""), ref: b.colours?.[j], g: b.grams?.[id] }; }) : b.spool ? b.spool.split(" + ").map((t) => ({ id: t, t, hex: undefined as string | undefined, ref: undefined as string | undefined, g: undefined as number | undefined })) : []);
  const tot = runs.filter((b) => !b.running).reduce((a, b) => ({ good: a.good + b.done, bad: a.bad + (b.failed ?? 0), h: a.h + (b.hours ?? 0), g: a.g + Object.values(b.grams ?? {}).reduce((x, y) => x + y, 0) }), { good: 0, bad: 0, h: 0, g: 0 });
  return <Sheet huge open onClose={onClose} title={`🕘 Print history · ${i.name}`} footer={<Button onClick={onClose}>Close</Button>}>
    <div class="max-w-[820px] mx-auto"><Head i={i} k={k} f={f} />
      <div class="flex flex-wrap gap-x-6 gap-y-1 mb-3 text-[13px] num"><span><b>{runs.length}</b> runs</span><span class="text-grn"><b>{tot.good}</b> good</span><span class={tot.bad ? "text-red" : ""}><b>{tot.bad}</b> failed</span><span><b>{tot.g}</b> g used</span><span><b>{Math.round(tot.h * 10) / 10}</b> h</span></div>
      {!runs.length && <p class="t-meta">No runs logged for this line yet. Counts typed in Edit line items have no run behind them.</p>}
      <div class="grid gap-2">{runs.map((b) => { const sp = spoolsOf(b), bad = b.failed ?? 0; return <div key={b.id} class={`rounded-xl border p-3 ${b.running ? "border-amb/50 bg-amb-bg/40" : bad ? "border-red/40" : "border-line"}`}>
        <div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px]">
          <b>{b.running ? "ON PLATE" : b.weighLater ? "Done · weigh pending" : !b.spoolIds?.length && !b.grams ? "Logged (skipped)" : "Done"}</b>
          <span>🖨 {b.printer || "No machine"}</span>
          {(b.part || b.partsOn) && <span class="t-meta">{b.partsOn ? b.partsOn.join(" + ") : b.part}</span>}
          <span class="ml-auto t-meta num">Start {when(b.at)}{b.endAt ? ` · End ${when(b.endAt)}` : ""}{b.hours ? ` · ${b.hours} h` : ""}</span></div>
        <div class="flex flex-wrap gap-x-4 mt-1 text-[12.5px] num"><span>{b.plates ?? 1} plate{(b.plates ?? 1) > 1 ? "s" : ""} × {b.perPlate ?? b.units}</span>
          {!b.running && <><span class="text-grn font-semibold">{b.done} good</span><span class={bad ? "text-red font-semibold" : "text-c2"}>{bad} failed</span></>}
          {b.reason && <span class="text-red">· {b.reason}</span>}{b.by && <span class="text-c2">· by {b.by}</span>}</div>
        {sp.length > 0 && <div class="grid gap-1 mt-2">{sp.map((x) => <div key={x.id} class="flex items-center gap-2 text-[12.5px]"><Sq hex={x.hex} size="w-3.5 h-3.5" /><span class="min-w-0 truncate">{x.t}</span>{x.ref && <span class="t-meta truncate">for {x.ref}</span>}<span class="ml-auto num font-semibold">{x.g ? `${x.g} g` : b.running || b.weighLater ? "" : "—"}</span></div>)}</div>}
      </div>; })}</div>
    </div>
  </Sheet>;
}
