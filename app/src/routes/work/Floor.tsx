import { sortAbc } from "../../mock/types";
/** Floor: the internal bulk work sheet. Opens at 95% of the screen from an order's FLOOR button. */
import { useEffect, useMemo, useState } from "preact/hooks";
import { Thumb } from "../../ui/media";
import { Button, Sheet } from "../../ui";
import { ordersSig, printersSig, filMasterSig, spoolsSig, batchesSig, shortDate, shrinkImage, storeMedia, patchOrder, type Order, type LineItem, type Spool, type Batch, spoolGross } from "../../data";
import { cancelRun, colourHex, colourStore, finishPlates, floorColumns, floorLine, gramsFor, gramsPerPc, lineColours, logPlates, returnGrams, saveFloorLines, startPlates } from "../../data/floor";

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
  const [logK, setLogK] = useState<number | null>(null), [cols, setCols] = useState(false), [lines, setLines] = useState(false);
  useEffect(() => { const k = (e: KeyboardEvent) => e.key === "Escape" && logK === null && !cols && !lines && onClose(); addEventListener("keydown", k); return () => removeEventListener("keydown", k); }, [logK, cols, lines]);

  const columns = floorColumns(o);
  const store = Object.fromEntries(columns.map((c) => [c, colourStore(c)]));
  const rows = o.items.map((i, k) => ({ i, k, f: floorLine(o, i) })).filter((r) => !r.i.offFloor);
  const val = (r: (typeof rows)[number], k: SortKey): number | string => k === "sr" ? r.k : k === "name" ? r.i.name.toLowerCase() : k === "qty" ? r.i.qty : k === "printed" ? r.f.printed : k === "wasted" ? r.f.wasted : k === "remaining" ? r.f.remaining : k === "extra" ? r.f.extra : k === "model" ? Number(!!r.i.paid) : k === "machine" ? (r.i.machine ?? "") : Number(lineColours(r.i).some((c) => eq(c, k.slice(2))));
  const sorted = [...rows].sort((a, b) => { const x = val(a, sort.k), y = val(b, sort.k); return (x < y ? -1 : x > y ? 1 : a.k - b.k) * (sort.up ? 1 : -1); });
  const need = Object.fromEntries(columns.map((c) => [c, Math.round(rows.reduce((a, r) => a + (lineColours(r.i).some((x) => eq(x, c)) ? r.f.remaining * gramsPerPc(r.i, lineColours(r.i).find((x) => eq(x, c))!) : 0), 0))]));
  const tot = rows.reduce((a, r) => ({ q: a.q + r.i.qty, p: a.p + r.f.printed, w: a.w + r.f.wasted, r: a.r + r.f.remaining, e: a.e + r.f.extra }), { q: 0, p: 0, w: 0, r: 0, e: 0 });
  const done = rows.filter((r) => !r.f.remaining).length, kg = Object.values(need).reduce((a, x) => a + x, 0) / 1000;
  const put = (k: number, p: Partial<LineItem>) => patchOrder(o, { items: o.items.map((x, j) => (j === k ? { ...x, ...p } : x)) });
  const attach = async (k: number, file?: File | null) => { if (!file?.type.startsWith("image/")) return; const [full, thumb] = await Promise.all([shrinkImage(file, 1024, 0.6), shrinkImage(file, 160, 0.6)]); put(k, { img: storeMedia(full, `${o.no} ${o.items[k].name}`), thumb }); };

  const th = "px-2 py-2.5 text-[11.5px] font-bold uppercase tracking-wide !text-c0 whitespace-nowrap select-none cursor-pointer hover:opacity-75 align-bottom";
  const H = ({ k, children, left }: { k: SortKey; children: preact.ComponentChildren; left?: boolean }) =>
    <th class={`${th} ${left ? "text-left" : "text-center"}`} onClick={() => setSort({ k, up: sort.k === k ? !sort.up : true })} aria-sort={sort.k === k ? (sort.up ? "ascending" : "descending") : "none"}>
      {children}<span class={`ml-0.5 text-[9px] max-[1100px]:hidden ${sort.k === k ? "text-grn-bg" : "opacity-50"}`}>{sort.k === k ? (sort.up ? "▲" : "▼") : "⇅"}</span></th>;
  const td = "px-2 py-2 text-center";
  const kpi = (l: string, v: string | number, c = "") => <div><div class="text-[11px] text-c2">{l}</div><div class={`num text-[22px] font-semibold leading-tight ${c}`}>{v}</div></div>;

  return <div class="fixed inset-0 z-40 bg-black/50 pop-in" onClick={(e) => e.target === e.currentTarget && onClose()}>
    <div role="dialog" aria-modal="true" aria-label={`Floor · ${o.no}`} onClick={(e) => e.stopPropagation()} class="absolute top-[2.5dvh] bottom-[2.5dvh] left-1/2 -translate-x-1/2 w-max min-w-[min(900px,95vw)] max-w-[95vw] bg-c0 rounded-2xl shadow-2xl flex flex-col max-[640px]:inset-0 max-[640px]:translate-x-0 max-[640px]:left-0 max-[640px]:w-full max-[640px]:min-w-0 max-[640px]:max-w-none max-[640px]:rounded-none">
      <button type="button" aria-label="Close Floor" onClick={onClose} class="absolute -top-3 -right-3 max-[640px]:top-2 max-[640px]:right-2 max-[640px]:w-11 max-[640px]:h-11 max-[640px]:text-[20px] z-20 w-13 h-13 ring-4 ring-c0 !min-h-0 rounded-full bg-c4 text-c0 grid place-items-center text-[26px] leading-none cursor-pointer shadow-lg">✕</button>
      <div class="flex-1 min-h-0 overflow-y-auto overflow-x-hidden rounded-2xl max-[640px]:rounded-none overscroll-contain"><div class="px-[clamp(12px,2vw,28px)] pt-6 pb-8 max-[640px]:pt-4 max-[640px]:pb-6">
        <div class="flex flex-wrap items-start gap-3 pr-16">
          <div class="mr-auto min-w-0"><h2 class="text-[20px] font-semibold leading-tight">{o.no} · {o.customer}</h2>
            <div class="t-meta mt-1">Due {shortDate(o.due)} · {rows.length} designs · {tot.q} pcs</div></div>
          <Button variant="outline" onClick={() => setLines(true)}>✎ Edit line items</Button>
          <Button variant="outline" onClick={() => setCols(true)}>✎ Edit colours</Button>
        </div>
        <div class="grid grid-cols-[repeat(auto-fill,minmax(110px,1fr))] sm:flex sm:flex-wrap gap-x-9 gap-y-3 mt-5 mb-5">
          {kpi("Ordered", tot.q)}{kpi("Printed", tot.p)}{kpi("Wasted", tot.w, tot.w ? "text-red" : "")}{kpi("Pending", tot.r)}{kpi("Extra (showcase)", `+${tot.e}`)}{kpi("Designs done", `${done}/${rows.length}`)}{kpi("Filament needed", `${kg.toFixed(2)} kg`)}
        </div>
        <div class="max-[1099px]:hidden"><table class="w-full border-collapse text-[14px] num">
          <thead class="sticky top-0 z-[5] bg-c4 text-c0"><tr>
            <H k="sr">Sr</H><th class={`${th} !cursor-default`}>Print</th><th class={`${th} !cursor-default`}>Img</th><H k="name" left>Name</H><H k="qty">Qty</H><H k="printed">Printed</H><H k="wasted">Wasted</H><H k="remaining">Remaining</H><H k="extra">Extra</H><H k="model">Model</H><H k="machine">Machine</H>
            {columns.map((c) => { const empty = !store[c]; return <th key={c} class={`${th} !align-bottom !px-0.5 w-6 min-w-0 ${empty ? "floor-empty text-red" : ""}`} onClick={() => setSort({ k: `c:${c}`, up: sort.k === `c:${c}` ? !sort.up : false })}>
              <div class="flex flex-col items-center justify-end gap-1.5">
                <span class="text-[11px] font-semibold leading-none normal-case tracking-normal whitespace-nowrap [writing-mode:vertical-rl] rotate-180 bg-c4 rounded py-1 px-0.5" title={c}>{c}</span><Sq hex={colourHex(c)} size="w-4 h-4 ring-1 ring-white/70" /></div></th>; })}
          </tr></thead>
          <tbody>
            {sorted.map(({ i, k, f }) => { const fin = !f.remaining, cs = lineColours(i); return (
              <tr key={k} class={`border-b border-line ${fin ? "bg-c1 text-c2 [&>td]:grayscale [&>td]:opacity-60" : ""}`}>
                <td class={td}>{k + 1}</td>
                <td class={td}>{(() => { const run = batchesSig.value.find((b) => b.orderNo === o.no && b.name === i.name && b.running); return run
                  ? <button type="button" onClick={() => setLogK(k)} class="!min-h-0 rounded-full bg-amb-bg text-amb px-2.5 py-1 text-[12px] font-semibold whitespace-nowrap cursor-pointer leading-tight">■ Finish<span class="block text-[9.5px] font-medium">on plate · {run.units} pcs</span></button>
                  : <button type="button" onClick={() => setLogK(k)} class="h-7 px-2.5 !min-h-0 rounded-full bg-grn-bg text-grn text-[12px] font-semibold whitespace-nowrap cursor-pointer">▶ Start</button>; })()}</td>
                <td class={td}><div class="inline-block align-middle"><Thumb thumb={i.thumb} full={i.img} alt={i.name} class="w-12 h-12 max-[1100px]:w-9 max-[1100px]:h-9" onAdd={(fl) => attach(k, fl)} /></div></td>
                <td class="px-2.5 py-2 text-left font-sans font-semibold leading-snug min-w-[8rem]">{i.name}</td>
                <td class={td}>{i.qty}</td>
                <td class={`${td} font-semibold`}>{f.printed}</td>
                <td class={`${td} ${f.wasted ? "text-red" : ""}`}>{f.wasted}</td>
                <td class={`${td} font-semibold ${fin ? "text-grn" : ""}`}>{fin ? "✓ 0" : f.remaining}</td>
                <td class={`${td} text-acc font-semibold`}>{f.extra ? `+${f.extra}` : ""}</td>
                <td class={td}><Toggle paid={!!i.paid} onChange={(v) => put(k, { paid: v })} /></td>
                <td class={td}><MachineSelect value={i.machine} onChange={(v) => put(k, { machine: v || undefined })} /></td>
                {columns.map((c) => <td key={c} class={`${td} !px-0.5 ${store[c] ? "" : "floor-empty"}`}>{cs.some((x) => eq(x, c)) && <Sq hex={colourHex(c)} size="w-6 h-6 max-[1100px]:w-[18px] max-[1100px]:h-[18px]" />}</td>)}
              </tr>); })}
          </tbody>
          <tfoot class="text-[12px] text-c3">
            <tr class="border-t-2 border-line"><td colSpan={4} class="px-1 py-1.5 font-semibold text-c4">Total</td><td class={td}>{tot.q}</td><td class={td}>{tot.p}</td><td class={td}>{tot.w}</td><td class={td}>{tot.r}</td><td class={`${td} text-acc`}>+{tot.e}</td><td colSpan={2} class="px-1 text-right whitespace-nowrap">In store (g)</td>
              {columns.map((c) => <td key={c} class={`${td} ${store[c] ? "" : "floor-empty text-red font-semibold"}`}>{store[c]}</td>)}</tr>
            <tr><td colSpan={11} class="px-1 py-1.5 text-right">Needed for pending (g)</td>{columns.map((c) => <td key={c} class={`${td} ${store[c] ? "" : "floor-empty"}`}>{need[c] || "—"}</td>)}</tr>
            <tr><td colSpan={11} class="px-1 py-1.5 text-right">Balance after job (g)</td>{columns.map((c) => { const b = store[c] - need[c]; return <td key={c} class={`${td} font-semibold ${b < 0 ? "text-red" : "text-grn"} ${store[c] ? "" : "floor-empty"}`}>{b > 0 ? "+" : ""}{b}</td>; })}</tr>
          </tfoot>
        </table></div>
        <div class="min-[1100px]:hidden grid gap-2">
          {sorted.map(({ i, k, f }) => { const fin = !f.remaining, cs = lineColours(i), run = batchesSig.value.find((b) => b.orderNo === o.no && b.name === i.name && b.running); return (
            <div key={k} class={`rounded-xl border border-line p-3 ${fin ? "bg-c1 text-c2 grayscale opacity-70" : "bg-c0"}`}>
              <div class="flex items-center gap-3">
                <Thumb thumb={i.thumb} full={i.img} alt={i.name} class="w-11 h-11 shrink-0" onAdd={(fl) => attach(k, fl)} />
                <div class="min-w-0 flex-1"><div class="font-semibold text-[14px] leading-snug">{k + 1}. {i.name}</div>
                  <div class="t-meta">Qty {i.qty} · {f.printed} printed · {f.remaining} left{f.wasted ? <span class="text-red"> · {f.wasted} wasted</span> : null}{f.extra ? ` · +${f.extra} extra` : ""}</div></div>
                {run ? <button type="button" onClick={() => setLogK(k)} class="!min-h-0 shrink-0 rounded-full bg-amb-bg text-amb px-3 py-1.5 text-[12px] font-semibold cursor-pointer leading-tight">■ Finish<span class="block text-[10px] font-medium">{run.units} pcs</span></button>
                  : <button type="button" onClick={() => setLogK(k)} class="h-8 px-3 !min-h-0 shrink-0 rounded-full bg-grn-bg text-grn text-[12px] font-semibold cursor-pointer">▶ Start</button>}
              </div>
              <div class="flex flex-wrap items-center gap-2 mt-2"><Toggle paid={!!i.paid} onChange={(v) => put(k, { paid: v })} /><MachineSelect value={i.machine} onChange={(v) => put(k, { machine: v || undefined })} /></div>
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
    </div>
    {logK !== null && (() => { const it = o.items[logK], run = batchesSig.value.find((b) => b.orderNo === o.no && b.name === it.name && b.running); return run ? <FinishPrint o={o} k={logK} run={run} onClose={() => setLogK(null)} /> : <StartPrint o={o} k={logK} onClose={() => setLogK(null)} />; })()}
    {cols && <EditColours o={o} onClose={() => setCols(false)} />}
    {lines && <EditLines o={o} onClose={() => setLines(false)} />}
  </div>;
}

/** Spool search: matches for the colour first, every other spool in store below in grey. */
/** The unfinished run a spool is on (it stays locked until that run is completed or cancelled). */
const spoolBusy = (id: string, self?: string) => batchesSig.value.find((b) => b.running && b.id !== self && b.spoolIds?.includes(id));
function SpoolPicker({ colour, machine, value, onPick, self, picked }: { colour: string; machine?: string; value?: string; onPick: (id: string) => void; self?: string; picked?: string[] }) {
  const [q, setQ] = useState(""), [mat, setMat] = useState(""), [brand, setBrand] = useState("");
  const all = spoolsSig.value.filter((s) => s.active !== false && s.status !== "empty" && s.grams > 0);
  const mats = [...new Set(all.map((s) => s.material))].sort(), brands = [...new Set(all.map((s) => s.brand).filter(Boolean))].sort();
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const hit = (s: Spool) => (!mat || s.material === mat) && (!brand || s.brand === brand) && words.every((w) => `${s.material} ${s.colour} ${s.brand} ${s.spoolNo}`.toLowerCase().includes(w));
  const loaded = (s: Spool) => s.status === "loaded" && !!machine && machine.split(" + ").some((m) => eq(s.printer, m));
  const rank = (a: Spool, b: Spool) => Number(loaded(b)) - Number(loaded(a)) || b.grams - a.grams;
  const match = all.filter((s) => eq(s.colour, colour) && hit(s)).sort(rank), other = all.filter((s) => !eq(s.colour, colour) && hit(s)).sort((a, b) => a.colour.localeCompare(b.colour) || b.grams - a.grams);
  const Row = ({ s, dim }: { s: Spool; dim?: boolean }) => { const on = picked ? picked.includes(s.id) : value === s.id, busy = spoolBusy(s.id, self); return (
    <button type="button" disabled={!!busy} onClick={() => !busy && onPick(s.id)} aria-pressed={on} title={busy ? "In use until that print is completed" : undefined} class={`w-full grid grid-cols-[16px_minmax(0,1fr)_auto_auto] items-center gap-2.5 px-2.5 py-2 mb-1 rounded-lg text-left !min-h-0 ${busy ? "cursor-not-allowed border border-dashed border-red/50 bg-red-bg/40" : "cursor-pointer"} ${on ? "border-2 border-grn bg-grn-bg" : busy ? "" : "border border-line hover:bg-c1"} ${(dim || busy) && !on ? "opacity-60" : ""}`}>
      <Sq hex={s.hex ?? colourHex(s.colour)} size="w-4 h-4" />
      <span class="min-w-0"><b class="block text-[13px] truncate">{s.material} · {s.colour} · {s.spoolNo}</b><span class="block text-[11px] text-c2 truncate">{s.brand}</span>{busy && <span class="block text-[11px] font-semibold text-red truncate">In use · {busy.orderNo} · {busy.name}{busy.printer ? ` · ${busy.printer}` : ""}</span>}</span>
      {busy ? <span class="text-[10px] font-bold text-red bg-red-bg rounded px-1.5 py-0.5 whitespace-nowrap">IN USE</span> : loaded(s) ? <span class="text-[10px] font-bold text-grn bg-grn-bg rounded px-1.5 py-0.5 whitespace-nowrap">LOADED</span> : <span />}
      <span class={`num text-[13px] font-semibold ${s.grams < 200 ? "text-red" : ""}`}>{spoolGross(s)} g</span></button>); };
  const chip = (on: boolean, l: string, f: () => void) => <button type="button" onClick={f} class={`h-7 px-2.5 !min-h-0 rounded-full text-[11px] cursor-pointer border ${on ? "bg-grn-bg border-grn/40 text-grn font-semibold" : "border-line text-c3"}`}>{l}</button>;
  return <div>
    <input type="search" value={q} onInput={(e) => setQ((e.target as HTMLInputElement).value)} placeholder="Search colour, material, brand or spool no. — e.g. “white petg”, “esun”, “12”" class="w-full h-9 px-3 rounded-lg border border-line bg-c0 text-[13px] mb-2" />
    <div class="flex flex-wrap gap-1.5 mb-2">{chip(!mat, "All materials", () => setMat(""))}{mats.map((m) => chip(mat === m, m, () => setMat(mat === m ? "" : m)))}
      <select value={brand} onChange={(e) => setBrand((e.target as HTMLSelectElement).value)} class="h-7 px-2 rounded-full border border-line text-[11px] bg-c0 cursor-pointer"><option value="">Brand ▾</option>{brands.map((b) => <option key={b}>{b}</option>)}</select></div>
    <div class="max-h-[38vh] overflow-y-auto pr-1">
      {!picked && <><div class="text-[10.5px] font-bold tracking-wide text-c2 uppercase my-1">{colour} · matches</div>
      {match.length ? match.map((s) => <Row key={s.id} s={s} />) : <p class="t-meta mb-2">No {colour} spool in store{q || mat || brand ? " for this search" : ""}.</p>}
      {other.length > 0 && <div class="text-[10.5px] font-bold tracking-wide text-c2 uppercase mt-3 mb-1">Other spools in store</div>}</>}
      {picked ? [...match, ...other].map((s) => <Row key={s.id} s={s} />) : other.map((s) => <Row key={s.id} s={s} dim />)}
    </div>
  </div>;
}
const spoolName = (id?: string) => { const s = spoolsSig.value.find((x) => x.id === id); return s ? { s, t: `${s.material} · ${s.colour} · ${s.spoolNo}` } : null; };
/** Fullest spool of a colour, preferring the one loaded on this machine. */
const bestSpool = (colour: string, machine?: string) => spoolsSig.value.filter((s) => s.active !== false && s.status !== "empty" && s.grams > 0 && eq(s.colour, colour) && !spoolBusy(s.id)).sort((a, b) => Number(b.status === "loaded" && eq(b.printer, machine)) - Number(a.status === "loaded" && eq(a.printer, machine)) || b.grams - a.grams)[0]?.id;

function Head({ i, k, f, children }: { i: LineItem; k: number; f: ReturnType<typeof floorLine>; children?: preact.ComponentChildren }) {
  return <div class="flex gap-4 mb-4"><Thumb thumb={i.thumb} full={i.img} alt={i.name} class="w-24 h-24 !rounded-xl" />
    <div class="min-w-0 text-[13px] leading-relaxed">{children}<div class="text-c3">Sr {k + 1} · Qty {i.qty} · <b class="text-c4">{f.printed} printed · {f.remaining} pending</b>{f.wasted ? <span class="text-red"> · {f.wasted} wasted</span> : null}</div>
      <div class="flex flex-wrap items-center gap-1 mt-1">{lineColours(i).map((c) => <Sq key={c} hex={colourHex(c)} size="w-3.5 h-3.5" />)}<span class="text-c3 ml-1">{lineColours(i).join(" · ") || "No colours set — use Edit colours"}</span></div></div></div>;
}
const inp = "h-9 w-16 px-2 rounded-lg border border-line bg-c0 text-[15px] num";

/** ▶ Start: machine, plates × copies, and the spool for each colour. Skip logs counts for prints made before. */
export function StartPrint({ o, k, onClose, simple }: { o: Order; k: number; onClose: () => void; simple?: boolean }) {
  const i = o.items[k], f = floorLine(o, i), cs = lineColours(i);
  const [machine, setMachine] = useState(i.machine ?? ""), [plates, setPlates] = useState(1), [per, setPer] = useState(simple ? Math.max(1, f.remaining) : i.perPlate ?? 1), [bad, setBad] = useState(0);
  const [sp, setSp] = useState<Record<string, string>>(() => Object.fromEntries(cs.map((c) => [c, bestSpool(c, i.machine) ?? ""])));
  const [tab, setTab] = useState(cs.find((c) => !sp[c]) ?? cs[0]);
  const [machines, setMachines] = useState<string[]>(i.machine ? i.machine.split(" + ") : []), [picked, setPicked] = useState<string[]>([]);
  const pcs = plates * per, ready = simple ? picked.length > 0 && !picked.some((id) => spoolBusy(id)) : cs.every((c) => sp[c] && !spoolBusy(sp[c]));
  /** Free choice of spools: any material, colour or brand. Keys are the colour name, made unique when a colour repeats. */
  const freeSpools = () => { const out: Record<string, string> = {}; for (const id of picked) { const s = spoolsSig.value.find((x) => x.id === id); let key = s?.colour || "Spool"; if (out[key]) key = `${key} · ${s?.spoolNo}`; out[key] = id; } return out; };
  const start = () => { startPlates(o, k, { machine: simple ? machines.join(" + ") || undefined : machine || undefined, plates, perPlate: per, spools: simple ? freeSpools() : Object.fromEntries(cs.map((c) => [c, sp[c]])) }); onClose(); };
  const skip = () => { logPlates(o, k, { good: pcs - Math.min(bad, pcs), wasted: Math.min(bad, pcs), plates, perPlate: per, gpp: {}, deduct: false }); onClose(); };
  return <Sheet huge open onClose={onClose} title={`▶ Start print · ${i.name}`}
    footer={<><Button variant="outline" onClick={onClose}>Cancel</Button>{!simple && <Button variant="outline" onClick={skip} title="Already printed before: log the counts only, no grams">Skip (already printed)</Button>}<Button onClick={start} disabled={!ready && (simple || cs.length > 0)}>▶ Start print</Button></>}>
    <div class="max-w-[680px] mx-auto"><Head i={i} k={k} f={f} />
    <div class="flex flex-wrap items-end gap-2 p-3 rounded-xl bg-c1 mb-1">
      {simple ? <div class="flex flex-col gap-1 text-[11px] text-c2 w-full">Machines · pick one or more<div class="flex flex-wrap gap-1.5">{printersSig.value.filter((p) => p.active !== false).map((p) => { const on = machines.includes(p.name); return <button key={p.id} type="button" aria-pressed={on} onClick={() => setMachines(on ? machines.filter((m) => m !== p.name) : [...machines, p.name])} class={`h-8 px-3 !min-h-0 rounded-full text-[12px] cursor-pointer border ${on ? "bg-c4 text-c0 border-c4 font-semibold" : "border-line bg-c0 text-c4"}`}>{p.name}</button>; })}</div></div>
      : <label class="flex flex-col gap-1 text-[11px] text-c2">Machine<MachineSelect value={machine} onChange={setMachine} cls="!h-9 !bg-c0 border border-line" /></label>}
      {simple ? <label class="flex flex-col gap-1 text-[11px] text-c2">Quantity to print<input type="number" min={1} class={inp} value={per} onInput={(e) => setPer(Math.max(1, n0((e.target as HTMLInputElement).value)))} /></label> : <>
      <label class="flex flex-col gap-1 text-[11px] text-c2">Plates<input type="number" min={1} class={inp} value={plates} onInput={(e) => setPlates(Math.max(1, n0((e.target as HTMLInputElement).value)))} /></label>
      <span class="pb-2 text-c2">×</span>
      <label class="flex flex-col gap-1 text-[11px] text-c2">Per plate<input type="number" min={1} class={inp} value={per} onInput={(e) => setPer(Math.max(1, n0((e.target as HTMLInputElement).value)))} /></label>
      <b class="pb-1.5 text-[17px] num">= {pcs} pcs</b></>}
      {!simple && <label class="ml-auto flex flex-col gap-1 text-[11px] text-c2" title="Only for Skip (already printed)">Wasted (if skipping)<input type="number" min={0} class={inp} value={bad} onInput={(e) => setBad(n0((e.target as HTMLInputElement).value))} /></label>}
    </div>
    {simple ? <>
      <div class="text-[10.5px] font-bold tracking-wide text-c2 uppercase mt-4 mb-1.5">Filaments · tap any spools: multi-material, multi-colour, any brand</div>
      <div class="flex flex-wrap gap-1.5 mb-2 min-h-8">{picked.length ? picked.map((id) => { const n = spoolName(id); return n && <button key={id} type="button" onClick={() => setPicked(picked.filter((x) => x !== id))} class="h-8 px-2.5 !min-h-0 rounded-full bg-c4 text-c0 text-[12px] font-semibold flex items-center gap-1.5 cursor-pointer"><Sq hex={n.s.hex ?? colourHex(n.s.colour)} size="w-3.5 h-3.5" />{n.t} ✕</button>; }) : <span class="t-meta">None picked yet</span>}</div>
      <SpoolPicker colour="" machine={machines.join(" + ")} picked={picked} onPick={(id) => setPicked(picked.includes(id) ? picked.filter((x) => x !== id) : [...picked, id])} />
    </> : cs.length ? <>
      <div class="flex flex-wrap gap-1.5 mt-4 mb-2">{cs.map((c) => { const n = spoolName(sp[c]); return <button key={c} type="button" onClick={() => setTab(c)} class={`h-8 px-3 !min-h-0 rounded-full flex items-center gap-1.5 text-[12px] font-semibold cursor-pointer ${tab === c ? "bg-c4 text-c0" : "bg-c1 text-c4"}`}>
        <Sq hex={colourHex(c)} size="w-3.5 h-3.5" />{c}{n ? <span class={tab === c ? "opacity-80" : "text-grn"}>✓ {n.s.spoolNo}</span> : <span class="opacity-70">· pick spool</span>}</button>; })}</div>
      {tab && <SpoolPicker colour={tab} machine={machine} value={sp[tab]} onPick={(id) => { const next = { ...sp, [tab]: id }; setSp(next); const nx = cs.find((c) => !next[c]); if (nx) setTab(nx); }} />}
    </> : <p class="t-meta mt-3">No colours set for this design. Use Edit colours first, or Skip to log counts only.</p>}
    </div>
  </Sheet>;
}

/** ■ Finish: pieces off the plates (good + wasted) and grams per plate from the spools picked at Start. */
export function FinishPrint({ o, k, run, onClose, simple }: { o: Order; k: number; run: Batch; onClose: () => void; simple?: boolean }) {
  const i = o.items[k], f = floorLine(o, i);
  const cs = run.colours?.length ? run.colours : lineColours(i);
  const [plates, setPlates] = useState(run.plates ?? 1), [per, setPer] = useState(run.perPlate ?? i.perPlate ?? 1), [bad, setBad] = useState(0);
  const [sp, setSp] = useState<Record<string, string>>(() => Object.fromEntries(cs.map((c, j) => [c, run.spoolIds?.[j] ?? bestSpool(c, run.printer) ?? ""])));
  const [g, setG] = useState<Record<string, number>>(() => Object.fromEntries(cs.map((c) => [c, i.gpp?.[c] ?? 0])));
  const [chg, setChg] = useState<string | null>(null), [w, setW] = useState<Record<string, number>>({});
  /** Spool weighed after the print (gross): grams used = gross before − gross now, spread over the plates. */
  const weigh = (c: string, v: number) => { setW({ ...w, [c]: v }); const n = spoolName(sp[c]); if (n && v > 0) setG({ ...g, [c]: Math.max(0, Math.round((spoolGross(n.s) - v) / plates)) }); };
  const pcs = plates * per, wasted = Math.min(bad, pcs), perG = cs.reduce((a, c) => a + (g[c] || 0), 0);
  const done = () => { finishPlates(o, k, run.id, { plates, perPlate: per, wasted, spools: Object.fromEntries(cs.filter((c) => sp[c]).map((c) => [c, sp[c]])), gpp: g }); onClose(); };
  const when = run.at ? new Date(run.at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : "";
  return <Sheet huge open onClose={onClose} title={`■ Complete print · ${i.name}`}
    footer={<><Button variant="outline" class="mr-auto text-red" onClick={() => { cancelRun(run.id); onClose(); }}>Cancel this run</Button><Button variant="outline" onClick={onClose}>Close</Button><Button onClick={done} disabled={!pcs}>Complete log</Button></>}>
    <div class="max-w-[680px] mx-auto"><Head i={i} k={k} f={f}><span class="inline-block rounded-md bg-amb-bg text-amb text-[11px] font-bold px-2 py-0.5 mb-1">ON PLATE{run.printer ? ` · ${run.printer}` : ""}{when ? ` · started ${when}` : ""}</span></Head>
    <div class="flex flex-wrap items-end gap-2 p-3 rounded-xl bg-c1">
      {simple ? <label class="flex flex-col gap-1 text-[11px] text-c2">Pieces printed<input type="number" min={1} class={inp} value={per} onInput={(e) => setPer(Math.max(1, n0((e.target as HTMLInputElement).value)))} /></label> : <>
      <label class="flex flex-col gap-1 text-[11px] text-c2">Plates<input type="number" min={1} class={inp} value={plates} onInput={(e) => setPlates(Math.max(1, n0((e.target as HTMLInputElement).value)))} /></label>
      <span class="pb-2 text-c2">×</span>
      <label class="flex flex-col gap-1 text-[11px] text-c2">Per plate<input type="number" min={1} class={inp} value={per} onInput={(e) => setPer(Math.max(1, n0((e.target as HTMLInputElement).value)))} /></label>
      <b class="pb-1.5 text-[17px] num">= {pcs} pcs</b></>}
      <label class="ml-auto flex flex-col gap-1 text-[11px] text-c2">{simple ? "Failed (of these)" : "Wasted (of these)"}<input type="number" min={0} max={pcs} class={`${inp} !border-red/40`} value={bad} onInput={(e) => setBad(n0((e.target as HTMLInputElement).value))} /></label>
    </div>
    <div class="t-meta mt-1.5">{pcs - wasted} good · {wasted} wasted. A plate halted mid-print counts all its pieces as wasted.</div>
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
    <div class="mt-3 text-[13px]">Deduct <b class="num">{perG * plates} g</b> from store <span class="text-c2">· {plates} plate{plates > 1 ? "s" : ""} × {perG} g</span></div>
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
  const attach = async (k: number, file?: File | null) => { if (!file?.type.startsWith("image/")) return; const [full, thumb] = await Promise.all([shrinkImage(file, 1024, 0.6), shrinkImage(file, 160, 0.6)]); put(k, { img: storeMedia(full, `${o.no} ${items[k].name}`), thumb }); };
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
    <table class="w-full border-collapse text-[13px]">
      <thead><tr class="border-b border-line text-[11px] text-c2">{["Img", "Name", "Qty", "Printed", "Wasted", "Model", "Machine", ""].map((h) => <th key={h} class={`px-1 py-2 ${h === "Name" ? "text-left" : ""}`}>{h}</th>)}</tr></thead>
      <tbody>{items.map((i, k) => i.offFloor ? null : <tr key={k} class="border-b border-line">
        <td class="px-1 py-1.5 w-14"><Thumb thumb={i.thumb} full={i.img} alt={i.name || "Item"} class="w-11 h-11" onAdd={(fl) => attach(k, fl)} />
          <label class="block text-[10px] text-grn text-center cursor-pointer">{i.thumb || i.img ? "Change" : "Upload"}<input type="file" accept="image/*" class="sr-only" onChange={(e) => attach(k, (e.target as HTMLInputElement).files?.[0])} /></label></td>
        <td class="px-1"><input class={inp} value={i.name} placeholder="Item name" onInput={(e) => put(k, { name: (e.target as HTMLInputElement).value })} /></td>
        {(["qty", "printed", "failed"] as const).map((key) => <td key={key} class="px-1 w-[72px]"><input type="number" min={0} class={`${inp} text-center num`} value={i[key] ?? 0} onInput={(e) => put(k, { [key]: n0((e.target as HTMLInputElement).value) })} /></td>)}
        <td class="px-1 text-center"><Toggle paid={!!i.paid} onChange={(v) => put(k, { paid: v })} /></td>
        <td class="px-1 text-center"><MachineSelect value={i.machine} onChange={(v) => put(k, { machine: v || undefined })} /></td>
        <td class="px-1 w-9"><button type="button" aria-label={`Remove ${i.name} from sheet`} onClick={() => put(k, { offFloor: true })} class="w-8 h-8 !min-h-0 rounded-lg text-red hover:bg-red-bg cursor-pointer">🗑</button></td>
      </tr>)}</tbody>
    </table>
  </Sheet>;
}
