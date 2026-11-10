/** Floor: the internal bulk work sheet. Opens at 95% of the screen from an order's FLOOR button. */
import { useEffect, useMemo, useState } from "preact/hooks";
import { Thumb } from "../../ui/media";
import { Button, Sheet } from "../../ui";
import { ordersSig, printersSig, filMasterSig, shortDate, shrinkImage, storeMedia, patchOrder, type Order, type LineItem } from "../../data";
import { colourHex, colourStore, floorColumns, floorLine, gramsFor, gramsPerPc, lineColours, logPlates, returnGrams, saveFloorLines } from "../../data/floor";

const eq = (a?: string, b?: string) => (a ?? "").trim().toLowerCase() === (b ?? "").trim().toLowerCase();
const n0 = (v: string) => Math.max(0, Math.floor(Number(v) || 0));
const Sq = ({ hex, size = "w-6 h-6" }: { hex?: string; size?: string }) => <span class={`${size} inline-block rounded-[5px] shadow-[inset_0_0_0_1px_rgb(0_0_0/0.15)] align-middle`} style={{ background: hex ?? "var(--c-1)" }} />;

function Toggle({ paid, onChange }: { paid: boolean; onChange: (v: boolean) => void }) {
  const b = (on: boolean, l: string, tone: string) => <button type="button" onClick={(e) => { e.stopPropagation(); onChange(l === "Paid"); }} class={`h-6 px-2 rounded-full text-[11px] font-semibold !min-h-0 cursor-pointer ${on ? tone : "text-c2"}`}>{l}</button>;
  return <span class="inline-flex rounded-full bg-c1 p-0.5">{b(!paid, "Free", "bg-grn text-c0")}{b(paid, "Paid", "bg-red text-c0")}</span>;
}
function MachineSelect({ value, onChange, cls = "" }: { value?: string; onChange: (v: string) => void; cls?: string }) {
  const names = printersSig.value.filter((p) => p.active !== false).map((p) => p.name);
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

  const th = "px-1 py-2 text-[11px] font-semibold text-c2 whitespace-nowrap select-none cursor-pointer hover:text-c4 align-bottom";
  const H = ({ k, children, left }: { k: SortKey; children: preact.ComponentChildren; left?: boolean }) =>
    <th class={`${th} ${left ? "text-left" : "text-center"}`} onClick={() => setSort({ k, up: sort.k === k ? !sort.up : true })} aria-sort={sort.k === k ? (sort.up ? "ascending" : "descending") : "none"}>
      {children}<span class={`ml-0.5 text-[9px] max-[1100px]:hidden ${sort.k === k ? "text-grn" : "text-c2/60"}`}>{sort.k === k ? (sort.up ? "▲" : "▼") : "⇅"}</span></th>;
  const td = "px-1 py-2 text-center";
  const kpi = (l: string, v: string | number, c = "") => <div><div class="text-[11px] text-c2">{l}</div><div class={`num text-[22px] font-semibold leading-tight ${c}`}>{v}</div></div>;

  return <div class="fixed inset-0 z-40 bg-black/50 pop-in" onClick={onClose}>
    <div role="dialog" aria-modal="true" aria-label={`Floor · ${o.no}`} onClick={(e) => e.stopPropagation()} class="absolute inset-[2.5vh_2.5vw] bg-c0 rounded-2xl shadow-2xl overflow-y-auto overflow-x-hidden">
      <button type="button" aria-label="Close Floor" onClick={onClose} class="sticky float-right top-3 mr-3 z-10 w-13 h-13 !min-h-0 rounded-full bg-c4 text-c0 grid place-items-center text-[26px] leading-none cursor-pointer shadow-lg">✕</button>
      <div class="px-[clamp(12px,2vw,28px)] pt-6 pb-8">
        <div class="flex flex-wrap items-start gap-3 pr-16">
          <div class="mr-auto min-w-0"><h2 class="text-[20px] font-semibold leading-tight">{o.no} · {o.customer}</h2>
            <div class="t-meta mt-1">Due {shortDate(o.due)} · {rows.length} designs · {tot.q} pcs</div></div>
          <Button variant="outline" onClick={() => setLines(true)}>✎ Edit line items</Button>
          <Button variant="outline" onClick={() => setCols(true)}>✎ Edit colours</Button>
        </div>
        <div class="flex flex-wrap gap-x-9 gap-y-3 mt-5 mb-5">
          {kpi("Ordered", tot.q)}{kpi("Printed", tot.p)}{kpi("Wasted", tot.w, tot.w ? "text-red" : "")}{kpi("Pending", tot.r)}{kpi("Extra (showcase)", `+${tot.e}`)}{kpi("Designs done", `${done}/${rows.length}`)}{kpi("Filament needed", `${kg.toFixed(2)} kg`)}
        </div>
        <table class="w-full border-collapse text-[13px] num">
          <thead><tr class="border-b border-line">
            <H k="sr">Sr</H><th class={`${th} !cursor-default`}>Log</th><th class={`${th} !cursor-default`}>Img</th><H k="name" left>Name</H><H k="qty">Qty</H><H k="printed">Printed</H><H k="wasted">Wasted</H><H k="remaining">Remaining</H><H k="extra">Extra</H><H k="model">Model</H><H k="machine">Machine</H>
            {columns.map((c) => { const empty = !store[c]; return <th key={c} class={`${th} !align-top w-11 max-w-11 max-[1300px]:w-7 max-[1300px]:max-w-7 ${empty ? "floor-empty text-red" : ""}`} onClick={() => setSort({ k: `c:${c}`, up: sort.k === `c:${c}` ? !sort.up : false })}>
              <div class="flex flex-col items-center gap-1"><Sq hex={colourHex(c)} size="w-4 h-4" />
                <span class="text-[10px] leading-[1.15] whitespace-normal text-center h-[2.4em] max-[1300px]:[writing-mode:vertical-rl] max-[1300px]:rotate-180 max-[1300px]:h-[78px] max-[1300px]:text-right max-[1300px]:whitespace-nowrap">{c}</span></div></th>; })}
          </tr></thead>
          <tbody>
            {sorted.map(({ i, k, f }) => { const fin = !f.remaining, cs = lineColours(i); return (
              <tr key={k} class={`border-b border-line ${fin ? "bg-c1 text-c2" : ""}`}>
                <td class={td}>{k + 1}</td>
                <td class={td}><button type="button" onClick={() => setLogK(k)} class="h-7 px-2.5 !min-h-0 rounded-full bg-grn-bg text-grn text-[12px] font-semibold whitespace-nowrap cursor-pointer">＋ Log</button></td>
                <td class={td}><div class="inline-block align-middle"><Thumb thumb={i.thumb} full={i.img} alt={i.name} class="w-12 h-12 max-[1100px]:w-9 max-[1100px]:h-9" onAdd={(fl) => attach(k, fl)} /></div></td>
                <td class="px-1 py-2 text-left font-sans leading-snug">{i.name}</td>
                <td class={td}>{i.qty}</td>
                <td class={`${td} font-semibold`}>{f.printed}</td>
                <td class={`${td} ${f.wasted ? "text-red" : ""}`}>{f.wasted}</td>
                <td class={`${td} font-semibold ${fin ? "text-grn" : ""}`}>{fin ? "✓ 0" : f.remaining}</td>
                <td class={`${td} text-acc font-semibold`}>{f.extra ? `+${f.extra}` : ""}</td>
                <td class={td}><Toggle paid={!!i.paid} onChange={(v) => put(k, { paid: v })} /></td>
                <td class={td}><MachineSelect value={i.machine} onChange={(v) => put(k, { machine: v || undefined })} /></td>
                {columns.map((c) => <td key={c} class={`${td} ${store[c] ? "" : "floor-empty"}`}>{cs.some((x) => eq(x, c)) && <Sq hex={colourHex(c)} size="w-6 h-6 max-[1100px]:w-[18px] max-[1100px]:h-[18px]" />}</td>)}
              </tr>); })}
          </tbody>
          <tfoot class="text-[12px] text-c3">
            <tr class="border-t-2 border-line"><td colSpan={4} class="px-1 py-1.5 font-semibold text-c4">Total</td><td class={td}>{tot.q}</td><td class={td}>{tot.p}</td><td class={td}>{tot.w}</td><td class={td}>{tot.r}</td><td class={`${td} text-acc`}>+{tot.e}</td><td colSpan={2} class="px-1 text-right whitespace-nowrap">In store (g)</td>
              {columns.map((c) => <td key={c} class={`${td} ${store[c] ? "" : "floor-empty text-red font-semibold"}`}>{store[c]}</td>)}</tr>
            <tr><td colSpan={11} class="px-1 py-1.5 text-right">Needed for pending (g)</td>{columns.map((c) => <td key={c} class={`${td} ${store[c] ? "" : "floor-empty"}`}>{need[c] || "—"}</td>)}</tr>
            <tr><td colSpan={11} class="px-1 py-1.5 text-right">Balance after job (g)</td>{columns.map((c) => { const b = store[c] - need[c]; return <td key={c} class={`${td} font-semibold ${b < 0 ? "text-red" : "text-grn"} ${store[c] ? "" : "floor-empty"}`}>{b > 0 ? "+" : ""}{b}</td>; })}</tr>
          </tfoot>
        </table>
        {!rows.length && <p class="t-meta py-6 text-center">No line items on the sheet. Use Edit line items to add one.</p>}
      </div>
    </div>
    {logK !== null && <LogPrint o={o} k={logK} onClose={() => setLogK(null)} />}
    {cols && <EditColours o={o} onClose={() => setCols(false)} />}
    {lines && <EditLines o={o} onClose={() => setLines(false)} />}
  </div>;
}

/** Log plates: plates × copies = pieces, of which some wasted; grams per plate per colour come off the store. */
function LogPrint({ o, k, onClose }: { o: Order; k: number; onClose: () => void }) {
  const i = o.items[k], f = floorLine(o, i), cs = lineColours(i);
  const [plates, setPlates] = useState(1), [per, setPer] = useState(i.perPlate ?? 1), [bad, setBad] = useState(0);
  const [g, setG] = useState<Record<string, number>>(Object.fromEntries(cs.map((c) => [c, i.gpp?.[c] ?? 0])));
  const pcs = plates * per, wasted = Math.min(bad, pcs), grams = Object.values(g).reduce((a, x) => a + x, 0) * plates;
  const go = (deduct: boolean) => { logPlates(o, k, { good: pcs - wasted, wasted, plates, perPlate: per, gpp: g, deduct }); onClose(); };
  const inp = "h-9 w-16 px-2 rounded-lg border border-line bg-c0 text-[15px] num";
  return <Sheet open onClose={onClose} title={`＋ Log print · ${i.name}`}
    footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button variant="outline" onClick={() => go(false)} disabled={!pcs}>Skip (already printed)</Button><Button onClick={() => go(true)} disabled={!pcs}>Complete log</Button></>}>
    <div class="flex gap-4">
      <Thumb thumb={i.thumb} full={i.img} alt={i.name} class="w-28 h-28 !rounded-xl" />
      <div class="min-w-0 text-[13px] leading-relaxed">
        <div class="t-meta">Sr {k + 1} · Qty {i.qty}</div>
        <div><b>{f.printed} printed · {f.remaining} pending</b> <span class="text-red">· {f.wasted} wasted</span></div>
        <div class="text-c3">{i.machine || "Any machine"} · {i.paid ? "Paid" : "Free"} model</div>
        <div class="flex flex-wrap items-center gap-1 mt-1">{cs.map((c) => <Sq key={c} hex={colourHex(c)} size="w-4 h-4" />)}<span class="text-c3 ml-1">{cs.join(" · ") || "No colours set"}</span></div>
      </div>
    </div>
    <div class="flex flex-wrap items-end gap-2 mt-4 p-3 rounded-xl bg-c1">
      <label class="flex flex-col gap-1 text-[11px] text-c2">Plates<input type="number" min={1} class={inp} value={plates} onInput={(e) => setPlates(Math.max(1, n0((e.target as HTMLInputElement).value)))} /></label>
      <span class="pb-2 text-c2">×</span>
      <label class="flex flex-col gap-1 text-[11px] text-c2">Per plate<input type="number" min={1} class={inp} value={per} onInput={(e) => setPer(Math.max(1, n0((e.target as HTMLInputElement).value)))} /></label>
      <span class="pb-2 text-c2">=</span><b class="pb-1.5 text-[17px] num">{pcs} pcs</b>
      <label class="ml-auto flex flex-col gap-1 text-[11px] text-c2">Wasted (of these)<input type="number" min={0} max={pcs} class={`${inp} !border-red/40`} value={bad} onInput={(e) => setBad(n0((e.target as HTMLInputElement).value))} /></label>
    </div>
    <div class="t-meta mt-1.5">{pcs - wasted} good · {wasted} wasted. A plate halted mid-print counts all its pieces as wasted.</div>
    <div class="text-[11px] text-c2 mt-4 mb-1.5">Material per plate <span class="text-c2/70">(from slicer)</span></div>
    {cs.length ? <div class="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-1.5">
      {cs.map((c) => <label key={c} class="flex items-center gap-1.5 px-2 py-1.5 rounded-lg border border-line text-[12px]"><Sq hex={colourHex(c)} size="w-3.5 h-3.5" /><span class="truncate">{c}</span>
        <input type="number" min={0} class="ml-auto h-7 w-12 px-1 rounded-md border border-line bg-c0 text-right num" value={g[c] || ""} placeholder="0" onInput={(e) => setG({ ...g, [c]: n0((e.target as HTMLInputElement).value) })} /><span class="text-c2">g</span></label>)}
    </div> : <p class="t-meta">Set this design's colours in Edit colours to track grams.</p>}
    <div class="mt-3 text-[13px]">Deduct <b class="num">{grams} g</b> from store <span class="text-c2">· {plates} plate{plates > 1 ? "s" : ""} × {grams / plates} g</span></div>
  </Sheet>;
}

/** Master grid: tick the colours each design uses. Nothing changes until Save. */
function EditColours({ o, onClose }: { o: Order; onClose: () => void }) {
  const lib = filMasterSig.value.colours;
  const [sel, setSel] = useState(() => Object.fromEntries(o.items.map((i, k) => [k, lineColours(i)])) as Record<number, string[]>);
  const [extra, setExtra] = useState<string[]>(o.floorCols ?? []), [add, setAdd] = useState("");
  const cols = useMemo(() => { const u = new Set([...Object.values(sel).flat(), ...extra]); return [...lib.map((c) => c.name).filter((n) => [...u].some((x) => eq(x, n))), ...[...u].filter((x) => !lib.some((c) => eq(c.name, x)))]; }, [sel, extra]);
  const flip = (k: number, c: string) => setSel({ ...sel, [k]: sel[k].some((x) => eq(x, c)) ? sel[k].filter((x) => !eq(x, c)) : [...sel[k], c] });
  const save = () => { patchOrder(o, { floorCols: extra, items: o.items.map((i, k) => ({ ...i, colours: sel[k] })) }); onClose(); };
  return <Sheet huge open onClose={onClose} title={`Edit colours · ${o.no}`}
    footer={<><select value={add} onChange={(e) => { const v = (e.target as HTMLSelectElement).value; if (v) setExtra([...extra, v]); setAdd(""); }} class="h-9 px-2 mr-auto rounded-lg border border-dashed border-grn text-grn text-[13px] font-semibold cursor-pointer"><option value="">＋ Add colour from library</option>{lib.filter((c) => !cols.some((x) => eq(x, c.name))).map((c) => <option key={c.name}>{c.name}</option>)}</select>
      <Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={save}>Save colours</Button></>}>
    <p class="t-meta mb-3">Tap to tick the colours each design uses.</p>
    <table class="w-full border-collapse text-[13px]">
      <thead><tr class="border-b border-line"><th class="px-1 py-2 text-[11px] text-c2">Image</th><th class="px-1 py-2 text-left text-[11px] text-c2">Design</th>
        {cols.map((c) => <th key={c} class={`px-1 py-2 align-top w-12 ${colourStore(c) ? "" : "floor-empty text-red"}`}><div class="flex flex-col items-center gap-1"><Sq hex={colourHex(c)} size="w-4 h-4" /><span class="text-[10px] leading-[1.15] h-[2.4em] text-center">{c}</span></div></th>)}</tr></thead>
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
