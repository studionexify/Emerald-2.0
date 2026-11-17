/**
 * The Nexcal calculator. One component, two homes: the Nexcal page (mode "page") and the New design window in Nexder (mode "embed").
 * Drop STL, OBJ, STEP or 3MF files, see size / weight / time, pick which 3MF plates to price, get the price.
 */
import type { ComponentChildren } from "preact";
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { Button, Field, Icon, inputCls } from "../../ui";
import { createOrder, inr } from "../../data";
import { navigate } from "../../router";
import { nexcalSig } from "../../data/pricing";
import {
  aggregateUploadedParts, applyAggregateToInputs, buildBulkPriceTable, calculateNexcal, ceilToNearest, emptyNexcalInputs, estimatorParams, getPartsPerSpool, longestDimensionMm,
  newUploadedPart, NEXCAL_MATERIALS, type MeshUnit, type NexcalInputs, type UploadedPart,
} from "../../data/nexcal/engine";
import { estimate as estimatePart } from "../../data/nexcal/estimator";
import { analyzeMesh, detectFormatAndParse, scaleMeshAnalysis, type MeshAnalysis, type Triangle, type UpAxis } from "../../data/nexcal/geometry";
import { renderDataURL } from "../../data/nexcal/thumbnail";
import type { File3MF, Plate } from "../../data/nexcal/threemf";
import { load3MF } from "../../data/nexcal/threemf-load";
import { blankQ, SpoolPick, type Quote } from "../Calculator";
import { Advanced, dec, Lines, matRows, num, packRows, rid, Row as KV, sm } from "./parts";

const UP_AXES: UpAxis[] = ["Z", "-Z", "X", "-X", "Y", "-Y"];
const UNITS: [MeshUnit, string][] = [["mm", "mm"], ["cm", "cm"], ["inch", "in"]];
export const MODEL_TYPES = ".stl,.obj,.step,.stp,.3mf";
const hm = (h: number) => { const t = Math.round(h * 60); return t >= 60 ? `${Math.floor(t / 60)} h ${t % 60} min` : `${t} min`; };
const dims = (d?: { x: number; y: number; z: number }) => (d ? `${d.x.toFixed(1)} × ${d.y.toFixed(1)} × ${d.z.toFixed(1)} mm` : "");

/** What the design window needs back from the calculator. */
export type Use = { kind: "price"; price: number } | { kind: "size"; sizeMm: number; grams: number };
export interface WorkbenchProps {
  mode: "page" | "embed";
  onUse?: (u: Use) => void;
  /** embed: files dropped here, so the design keeps them too */
  onFiles?: (files: File[]) => void;
  /** embed: files to open right away (the "Calculate" shortcut on a design file). `n` changes each time. */
  feed?: { n: number; files: File[] };
}

/* ---------------------------------------------------------------- small pieces */
const Fold = ({ title, meta, open, children }: { title: string; meta?: ComponentChildren; open?: boolean; children: ComponentChildren }) => (
  <details open={open} class="rounded-[var(--radius-card)] bg-c0 min-w-0">
    <summary class="flex items-center gap-2 min-h-11 px-4 py-2 select-none"><span class="chev text-c2 inline-flex"><Icon name="right" size={12} /></span><span class="text-[14px] font-semibold">{title}</span>{meta && <span class="ml-auto t-meta text-right break-words">{meta}</span>}</summary>
    <div class="px-4 pb-4">{children}</div>
  </details>
);
const Section = ({ title, hint, children, action }: { title: string; hint?: ComponentChildren; children: ComponentChildren; action?: ComponentChildren }) => (
  <section class="rounded-[var(--radius-card)] bg-c0 p-4 min-w-0">
    <div class="flex items-start gap-2 mb-3"><div class="min-w-0 flex-1"><h2 class="text-[15px] font-bold">{title}</h2>{hint && <p class="t-meta mt-0.5">{hint}</p>}</div>{action}</div>
    {children}
  </section>
);
const Dot = ({ c }: { c: string }) => <span class="w-3.5 h-3.5 rounded-full shrink-0 shadow-[inset_0_0_0_1px_rgb(128_128_128/0.55)]" style={{ background: c }} />;
const Tag = ({ tone, children }: { tone: "grn" | "amb" | "mute"; children: ComponentChildren }) => <span class={`inline-flex items-center rounded-full px-2 h-5 text-[11px] font-semibold whitespace-nowrap ${tone === "grn" ? "bg-grn-bg text-grn" : tone === "amb" ? "bg-amb-bg text-amb" : "bg-c1 text-c3"}`}>{children}</span>;

/** A 3MF project on screen: its plates, and what the file says about the machine. */
type SheetState = { id: number; name: string; data: File3MF; on: Record<number, boolean>; pieces: Record<number, number>; slicer: boolean; useFile: boolean; support: boolean };
const fileParams = (m: File3MF["machine"]) => ({ ...(m.walls ? { wallLoops: m.walls } : {}), ...(m.infill !== undefined ? { infillPercent: m.infill } : {}), ...(m.layerHeight ? { layerHeight: m.layerHeight } : {}), ...(m.nozzle ? { nozzleDiameter: m.nozzle } : {}) });

/* ---------------------------------------------------------------- workbench */
export function Workbench({ mode, onUse, onFiles: told, feed }: WorkbenchProps) {
  const embed = mode === "embed", settings = nexcalSig.value;
  const fresh = (): NexcalInputs => ({ ...emptyNexcalInputs(), marginPercent: settings.defaultMarginPercent, materialRows: matRows(), packagingRows: packRows() });
  const [inputs, setInputs] = useState<NexcalInputs>(fresh);
  const [q, setQ] = useState<Quote>(blankQ);
  const [files, setFiles] = useState<UploadedPart[]>([]);
  const [sheets, setSheets] = useState<SheetState[]>([]);
  const [busy, setBusy] = useState(false), [toast, setToast] = useState(""), [over, setOver] = useState(false), [hover, setHover] = useState(false);
  const [view, setView] = useState<{ name: string; src: string } | null>(null);
  const tris = useRef(new Map<number, Triangle[]>());
  const patch = (p: Partial<NexcalInputs>) => setInputs((c) => ({ ...c, ...p }));
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(""), 3200); return () => clearTimeout(t); }, [toast]);

  /* every model, as parts the engine understands: loose files, and the chosen plates of each 3MF */
  const looseParts = useMemo(() => files.map((f) => {
    if (!f.meshAnalysis) return { ...f, weightGrams: null, timeHours: null };
    const e = estimatePart(f.meshAnalysis, inputs.material, estimatorParams(settings, { wallLoops: f.wallLoops, infillPercent: f.infillPercent, supportEnabled: f.supportEnabled }));
    return { ...f, weightGrams: e.weightGrams, timeHours: e.timeHours };
  }), [files, inputs.material, settings]);
  const figures = useMemo(() => sheets.map((s) => s.data.plates.map((p) => {
    if (s.slicer && p.slice) return { g: p.slice.grams, h: p.slice.seconds / 3600, from: "slicer" as const };
    const prm = estimatorParams(settings, { supportEnabled: s.support, ...(s.useFile ? fileParams(s.data.machine) : {}) });
    let g = 0, h = 0; for (const it of p.items) { const e = estimatePart(it.analysis, inputs.material, prm); g += e.weightGrams; h += e.timeHours; }
    return { g, h, from: "estimate" as const };
  })), [sheets, inputs.material, settings]);
  const plateParts = useMemo(() => sheets.flatMap((s, si) => s.data.plates.filter((p) => s.on[p.index]).map((p) => {
    const f = figures[si][s.data.plates.indexOf(p)], pcs = Math.max(1, s.pieces[p.index] ?? 1);
    const base = newUploadedPart(s.id * 1000 + p.index, `${s.name} · ${p.name}`, settings);
    return { ...base, qty: pcs, weightGrams: f.g / pcs, timeHours: f.h / pcs, meshAnalysis: null as MeshAnalysis | null };
  })), [sheets, figures, settings]);
  const parts = useMemo(() => [...looseParts, ...plateParts], [looseParts, plateParts]);
  const agg = useMemo(() => aggregateUploadedParts(parts), [parts]);
  const hasModel = files.length > 0 || sheets.length > 0;
  useEffect(() => { if (hasModel) setInputs((c) => applyAggregateToInputs(c, agg)); }, [agg.totalWeightGrams, agg.totalTimeHours, agg.totalPartCount]);

  const result = useMemo(() => calculateNexcal(inputs, settings), [inputs, settings]);
  const bulk = useMemo(() => buildBulkPriceTable(inputs, settings, result.unitLandedCost), [inputs, settings, result.unitLandedCost]);
  const perSpool = getPartsPerSpool(settings, inputs.filamentGrams);
  const unit = ceilToNearest(result.finalPrice / Math.max(1, result.orderQty), 10);

  /* ---- loading files */
  const analyse = (p: UploadedPart): Partial<UploadedPart> => {
    const t = tris.current.get(p.id);
    if (!t) return { baseMeshAnalysis: null, meshAnalysis: null };
    try {
      const base = analyzeMesh(t, { unit: p.unit, upAxis: p.upAxis });
      const scaled = scaleMeshAnalysis(base, Math.max(p.scalePercent, 1) / 100);
      if (scaled.warning) setToast(`${p.name}: ${scaled.warning}`);
      let thumbnail: string | null = null;
      try { thumbnail = renderDataURL(t, p.upAxis, 128); } catch { /* cosmetic */ }
      return { baseMeshAnalysis: base, meshAnalysis: scaled, thumbnail };
    } catch (e) { setToast(`${p.name}: ${(e as Error).message || "Could not analyse mesh"}`); return { baseMeshAnalysis: null, meshAnalysis: null }; }
  };
  const upd = (id: number, p: Partial<UploadedPart>) => setFiles((fs) => fs.map((f) => (f.id === id ? { ...f, ...p } : f)));
  const open = async (list: File[], fromUser: boolean) => {
    if (!list.length) return;
    setBusy(true);
    const loose: UploadedPart[] = [], sh: SheetState[] = [];
    for (const file of list) {
      try {
        if (/\.3mf$/i.test(file.name)) {
          const data = await load3MF(file), first = data.plates[0];
          sh.push({ id: rid(), name: file.name.replace(/\.3mf$/i, ""), data, on: first ? { [first.index]: true } : {}, pieces: {}, slicer: true, useFile: true, support: !!data.machine.support });
        } else { const t = await detectFormatAndParse(file); const id = rid(); tris.current.set(id, t); const b = newUploadedPart(id, file.name, settings); loose.push({ ...b, ...analyse(b) }); }
      } catch (e) { setToast((e as Error).message || `Could not read ${file.name}`); }
    }
    setBusy(false);
    if (loose.length) setFiles((fs) => [...fs, ...loose]);
    if (sh.length) setSheets((s) => [...s, ...sh]);
    const first = loose[0]?.name ?? sh[0]?.name; if (first && !q.item) setQ((x) => ({ ...x, item: first.replace(/\.[^.]+$/, "") }));
    if (fromUser) told?.(list);
  };
  useEffect(() => { if (feed?.n) open(feed.files, false); }, [feed?.n]);
  useEffect(() => {
    if (!hover) return;
    const f = (e: ClipboardEvent) => { if (e.clipboardData?.files.length) { e.preventDefault(); open([...e.clipboardData.files], true); } };
    addEventListener("paste", f); return () => removeEventListener("paste", f);
  }, [hover]);

  const onSize = (p: UploadedPart, mm: number) => {
    if (!p.baseMeshAnalysis || !isFinite(mm) || mm <= 0) return;
    const d = p.baseMeshAnalysis.dimensions, base = Math.max(d.x, d.y, d.z); if (base <= 0) return;
    const pct = (mm / base) * 100; upd(p.id, { scalePercent: pct, meshAnalysis: scaleMeshAnalysis(p.baseMeshAnalysis, pct / 100) });
  };
  const remove = (id: number) => { tris.current.delete(id); setFiles((fs) => fs.filter((f) => f.id !== id)); };
  const clear = () => { tris.current.clear(); setFiles([]); setSheets([]); patch({ orderQty: 1 }); };
  const reset = () => { clear(); setInputs(fresh()); setQ(blankQ()); setToast("Calculator reset"); };
  useEffect(() => { if (!hasModel && inputs.orderQty !== 1 && !embed) { /* keep what the user typed */ } }, [hasModel]);
  const openView = (p: UploadedPart) => { const t = tris.current.get(p.id); if (!t?.length) return; let src = p.thumbnail ?? ""; try { src = renderDataURL(t, p.upAxis, 900); } catch { /* keep small */ } setView({ name: p.name, src }); };
  const setSheet = (id: number, p: Partial<SheetState>) => setSheets((ss) => ss.map((s) => (s.id === id ? { ...s, ...p } : s)));

  /* ---- what the size of the thing is: the longest side of one piece */
  const sizeMm = useMemo(() => {
    const l = files.map((f) => longestDimensionMm(f) ?? 0);
    for (const s of sheets) for (const p of s.data.plates) if (s.on[p.index]) for (const it of p.items) l.push(Math.max(it.analysis.dimensions.x, it.analysis.dimensions.y, it.analysis.dimensions.z));
    return l.length ? Math.round(Math.max(...l) * 10) / 10 : 0;
  }, [files, sheets]);

  const hrs = Math.floor(inputs.printHours), minsRaw = Math.round((inputs.printHours - hrs) * 60);
  const H = minsRaw === 60 ? hrs + 1 : hrs, M = minsRaw === 60 ? 0 : minsRaw;
  const below = result.marginSafe < settings.marginFloorPct;
  const summary = () => [
    "Studio Nexify — Price Estimate", "--------------------------------", ...(q.item ? [`Item: ${q.item}`] : []),
    `Material: ${inputs.material}`, `Filament: ${inputs.filamentGrams} g @ ₹${inputs.filamentCostPerKg}/kg`, `Print time: ${H} hr ${M} min`, `Labour: ${inputs.labourMinutes} min`, "",
    `Total materials cost: ${dec(result.totalMaterialsCost)}`, `Total labour cost: ${dec(result.totalLabourCost)}`, `Machine / printer cost: ${dec(result.machineCost)}`, `Total packaging cost: ${dec(result.totalPackagingCost)}`,
    `Order quantity: ${result.orderQty} ${result.orderQty === 1 ? "unit" : "units"}`, `Bulk discount: ${result.bulkDiscount ? `${result.bulkDiscount}% off margin` : "—"}`,
    `Total landed cost: ${dec(result.totalLandedCost)}`, `Calculated price (pre-tax): ${dec(result.calcPrice)}`, `GST (${settings.gstPercent}%): ${dec(result.gstAmount)}`, "",
    `FINAL PRICE (rounded): ${inr(result.finalPriceRounded)}`, `Exact: ${dec(result.finalPrice)}`, ...(result.perUnitPrice !== null ? [`Per unit: ${dec(result.perUnitPrice)}`] : []),
  ].join("\n");
  const copy = async () => { try { await navigator.clipboard.writeText(summary()); setToast("Summary copied"); } catch { setToast("Could not copy — clipboard blocked"); } };
  const quote = () => {
    const qty = result.orderQty;
    createOrder({ type: "client", customer: "New client", item: q.item.trim() || "Calculated item", qty, price: Math.round(result.finalPriceRounded / qty), medium: "Instagram", due: "",
      supports: files.some((f) => f.supportEnabled) || sheets.some((s) => s.support), material: q.material ?? inputs.material, colour: q.colour });
    navigate("/work/orders");
  };

  /* ---------------------------------------------------------------- the price */
  const price = (
    <section class={`rounded-[var(--radius-card)] bg-c0 p-4 min-w-0 ${embed ? "sticky top-0 z-10 shadow-[0_1px_0_var(--line)]" : ""}`} aria-label="Price">
      <div class={embed ? "flex items-center gap-x-4 gap-y-3 flex-wrap" : ""}>
        <div class={`rounded-2xl bg-c4 text-c0 px-4 py-3.5 text-center ${embed ? "min-w-[170px] max-sm:w-full" : ""}`}>
          <p class="text-[11px] font-semibold uppercase tracking-[0.08em] opacity-70">{embed ? "Price per piece" : "Final price"} <span class="normal-case font-normal">(rounded to ₹10)</span></p>
          <p class="num text-[32px] leading-none font-semibold tracking-tight mt-1">{inr(embed ? unit : result.finalPriceRounded)}</p>
          <p class="num text-[12px] mt-1.5 opacity-70">Exact {dec(result.finalPrice)}{result.perUnitPrice !== null && <> · per unit {dec(result.perUnitPrice)}</>}</p>
        </div>
        {embed && <div class="min-w-[220px] flex-1 grid gap-1 text-[13px]">
          <span><b class="num">{inputs.filamentGrams || 0} g</b> <span class="text-c3">per piece</span> · <b class="num">{hm(inputs.printHours)}</b>{sizeMm > 0 && <> · <b class="num">{sizeMm} mm</b> <span class="text-c3">longest side</span></>}</span>
          <span class="flex gap-2 flex-wrap mt-1">
            <Button icon="check" disabled={!hasModel && !inputs.filamentGrams} onClick={() => onUse?.({ kind: "price", price: unit })}>Use {inr(unit)} as price</Button>
            <Button variant="outline" icon="plus" disabled={!inputs.filamentGrams || !sizeMm} onClick={() => onUse?.({ kind: "size", sizeMm, grams: Math.round(inputs.filamentGrams * 10) / 10 })}>Save as a size</Button>
          </span>
        </div>}
      </div>
      {below && <p class="mt-2 text-[12px] text-warn font-medium">Margin {result.marginSafe}% is below the {settings.marginFloorPct}% floor.</p>}
      {!embed && <Button class="mt-3 w-full" onClick={quote}>Use in quotation</Button>}
      <details class="mt-3" open={!embed}>
        <summary class="flex items-center gap-2 h-8 select-none"><span class="chev text-c2 inline-flex"><Icon name="right" size={12} /></span><span class="text-[13px] font-semibold">Cost breakdown</span></summary>
        <div class="pt-1">
          <KV label="Total materials" value={dec(result.totalMaterialsCost)} /><KV label="Total labour" value={dec(result.totalLabourCost)} /><KV label="Machine / printer" value={dec(result.machineCost)} /><KV label="Total packaging" value={dec(result.totalPackagingCost)} />
          <KV strong label="Unit landed cost" value={dec(result.unitLandedCost)} />
          <KV label="Order quantity" value={`${result.orderQty} ${result.orderQty === 1 ? "unit" : "units"}`} /><KV label="Bulk discount" value={result.bulkDiscount ? `${result.bulkDiscount}% off margin` : "—"} />
          <KV strong label="Total landed cost" value={dec(result.totalLandedCost)} /><KV label={`Price before GST · ${result.marginSafe}% margin`} value={dec(result.calcPrice)} /><KV label={`GST ${settings.gstPercent}%`} value={dec(result.gstAmount)} />
        </div>
      </details>
      <div class="mt-3 flex gap-2 flex-wrap">
        <Button variant="outline" icon="copy" onClick={copy}>Copy summary</Button>
        {!embed && <Button variant="outline" icon="printer" onClick={() => print()}>Print</Button>}
        <Button variant="ghost" onClick={reset}>Reset</Button>
      </div>
    </section>
  );

  /* ---------------------------------------------------------------- the model */
  const model = (
    <Section title="Model" hint="Drop STL, OBJ, STEP or 3MF files. A 3MF with several plates lets you choose which plate to price.">
      <label tabIndex={0} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
        onDragEnter={(e) => { e.preventDefault(); setOver(true); }} onDragOver={(e) => e.preventDefault()} onDragLeave={(e) => { e.preventDefault(); setOver(false); }}
        onDrop={(e) => { e.preventDefault(); setOver(false); open([...(e.dataTransfer?.files ?? [])], true); }}
        class={`flex ${hasModel ? "min-h-[64px] flex-row gap-3" : "min-h-[150px] flex-col"} items-center justify-center gap-1.5 rounded-2xl border-2 border-dashed px-5 py-4 text-center cursor-pointer ${over ? "border-c4 bg-c1" : "border-c2/60 hover:bg-c1/50"}`}>
        <Icon name="in" size={hasModel ? 18 : 22} />
        <span class="min-w-0"><span class="block text-[13px] font-semibold">{busy ? "Reading files…" : hasModel ? "Add more files" : "Click, drag or paste 3D files here"}</span>{!hasModel && <span class="block t-meta">.3mf, .stl, .obj, .step, .stp · several files at once</span>}</span>
        <input type="file" accept={MODEL_TYPES} multiple class="sr-only" onChange={(e) => { open([...((e.target as HTMLInputElement).files ?? [])], true); (e.target as HTMLInputElement).value = ""; }} />
      </label>

      {sheets.map((s, si) => <SheetBlock key={s.id} s={s} figs={figures[si]} set={(p) => setSheet(s.id, p)} remove={() => setSheets((x) => x.filter((y) => y.id !== s.id))} />)}

      {looseParts.length > 0 && <div class="mt-3 grid gap-2.5">{looseParts.map((p) => <PartRow key={p.id} p={p} upd={upd} remove={remove} openView={openView} onSize={onSize}
        onUnit={(u) => upd(p.id, { unit: u, scalePercent: 100, ...analyse({ ...p, unit: u, scalePercent: 100 }) })} onAxis={(a) => upd(p.id, { upAxis: a, ...analyse({ ...p, upAxis: a }) })}
        onReset={() => p.baseMeshAnalysis && upd(p.id, { scalePercent: 100, meshAnalysis: scaleMeshAnalysis(p.baseMeshAnalysis, 1) })} />)}</div>}

      {hasModel && <div class="mt-3 rounded-xl bg-c1/60 px-3 py-2.5 flex flex-wrap gap-x-5 gap-y-1 text-[13px]">
        <span><span class="text-c3">Pieces</span> <b class="num">{agg.totalPartCount}</b></span><span><span class="text-c3">Per piece</span> <b class="num">{inputs.filamentGrams} g</b></span>
        <span><span class="text-c3">Print time</span> <b class="num">{hm(inputs.printHours)}</b></span>{sizeMm > 0 && <span><span class="text-c3">Longest side</span> <b class="num">{sizeMm} mm</b></span>}
        <button type="button" class="ml-auto underline text-c3 cursor-pointer !min-h-0" onClick={clear}>Clear all</button>
      </div>}
    </Section>
  );

  const print_ = (
    <Section title="Print and pricing" hint={hasModel ? "Filled from your files. Change anything to override." : "Or type the weight and time from your slicer."}>
      <div class="grid gap-3 grid-cols-2">
        <div class="col-span-2"><SpoolPick onPick={(c, m, col) => { patch({ filamentCostPerKg: c, ...(m && (NEXCAL_MATERIALS as readonly string[]).includes(m) ? { material: m } : {}) }); setQ({ ...q, material: m, colour: col }); }} /></div>
        <Field label="Material"><select class={inputCls} value={inputs.material} onChange={(e) => patch({ material: (e.target as HTMLSelectElement).value })}>{NEXCAL_MATERIALS.map((m) => <option key={m}>{m}</option>)}</select></Field>
        <Field label="Filament cost (₹ / kg)"><input class={`${inputCls} num`} type="number" value={inputs.filamentCostPerKg} onInput={(e) => patch({ filamentCostPerKg: num(e) })} /></Field>
        <Field label="Filament per piece (g)"><input class={`${inputCls} num`} type="number" step="any" value={inputs.filamentGrams} onInput={(e) => patch({ filamentGrams: num(e) })} /></Field>
        <Field label="Print time per piece">
          <span class="flex gap-1.5">
            <span class="relative flex-1"><input class={`${inputCls} num !pr-8 !pl-2 text-right`} type="number" aria-label="Hours" value={H} onInput={(e) => patch({ printHours: Math.max(0, Math.round(num(e))) + M / 60 })} /><span class="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 t-meta">hr</span></span>
            <span class="relative flex-1"><input class={`${inputCls} num !pr-9 !pl-2 text-right`} type="number" aria-label="Minutes" value={M} onInput={(e) => patch({ printHours: (Math.max(0, Math.round(num(e))) + H * 60) / 60 })} /><span class="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 t-meta">min</span></span>
          </span>
        </Field>
        <Field label="Labour per piece (min)"><input class={`${inputCls} num`} type="number" value={inputs.labourMinutes} onInput={(e) => patch({ labourMinutes: num(e) })} /></Field>
        <Field label="Margin (%)"><input class={`${inputCls} num`} type="number" value={inputs.marginPercent} onInput={(e) => patch({ marginPercent: num(e) })} /></Field>
      </div>
      <p class="t-meta mt-3">GST <b class="text-c4">{settings.gstPercent}%</b> · machine <b class="text-c4">{dec(result.printTimeRate)}/hr</b></p>
    </Section>
  );

  const more = <>
    <Fold title="Bill of materials" meta={`${dec(result.totalMaterialsCost + result.totalPackagingCost)}`}>
      <Lines title="Materials" rows={inputs.materialRows} locked={["Printed part (auto)", result.printedPartCost]} total={result.totalMaterialsCost} onChange={(r) => patch({ materialRows: r })} add="Add material" />
      <div class="mt-4 pt-4 border-t border-line"><Lines title="Packaging & shipping" rows={inputs.packagingRows} total={result.totalPackagingCost} onChange={(r) => patch({ packagingRows: r })} add="Add item" /></div>
    </Fold>
    <Fold title="Bulk pricing" meta={`${result.orderQty} ${result.orderQty === 1 ? "unit" : "units"}`}>
      <div class="grid grid-cols-2 gap-3">
        <Field label="Order quantity"><input class={`${inputCls} num`} type="number" min={1} value={inputs.orderQty} onInput={(e) => patch({ orderQty: num(e) || 1 })} /></Field>
        <Field label="Spool weight (g)"><input class={`${inputCls} num`} type="number" value={settings.spoolWeightGrams} onInput={(e) => (nexcalSig.value = { ...settings, spoolWeightGrams: num(e) || 1 })} /></Field>
      </div>
      <p class="t-meta mt-2">1 piece = {inputs.filamentGrams} g · {perSpool >= 1 ? `${perSpool} piece${perSpool === 1 ? "" : "s"} / spool` : `${Math.ceil(inputs.filamentGrams / Math.max(1, settings.spoolWeightGrams))} spools / piece`}</p>
      <div class="mt-3 flex items-center justify-between"><span class="t-meta uppercase tracking-[0.06em]">Spool qty tiers</span>
        <Button variant="outline" icon="plus" onClick={() => { const s = [...settings.bulkTiers].sort((a, b) => a.min - b.min); nexcalSig.value = { ...settings, bulkTiers: [...settings.bulkTiers, { min: (s[s.length - 1]?.min ?? 0) + 1 }] }; }}>Add tier</Button></div>
      <div class="mt-2 flex flex-wrap gap-2">{settings.bulkTiers.map((t, i) => (
        <span key={i} class="flex items-center gap-1 rounded-full border border-line bg-c1/50 pl-3 pr-1 h-8">
          <input type="number" min={1} class="num w-12 bg-transparent text-right text-[12px] font-semibold outline-none" value={t.min} aria-label="Tier starts at spools" onInput={(e) => (nexcalSig.value = { ...settings, bulkTiers: settings.bulkTiers.map((x, j) => (j === i ? { min: Math.max(1, num(e) || 1) } : x)) })} />
          {settings.bulkTiers.length > 1 && <button type="button" aria-label="Remove tier" onClick={() => (nexcalSig.value = { ...settings, bulkTiers: settings.bulkTiers.filter((_, j) => j !== i) })} class="w-6 h-6 grid place-items-center rounded-full text-c3 hover:bg-c1 cursor-pointer"><Icon name="close" size={11} /></button>}
        </span>))}</div>
      <ul class="mt-4 pt-4 border-t border-line flex flex-col gap-1.5">
        <li class="grid grid-cols-[minmax(0,1fr)_40px_52px_52px] gap-2 px-3 t-meta uppercase tracking-[0.06em]"><span>Qty</span><span class="text-right">Off</span><span class="text-right">Ex GST</span><span class="text-right">Inc GST</span></li>
        {bulk.map((r, i) => (
          <li key={i} class={`grid grid-cols-[minmax(0,1fr)_40px_52px_52px] gap-2 items-center rounded-xl px-3 min-h-10 text-[13px] num ${r.isActive ? "bg-c4 text-c0" : "bg-c1/60"}`}>
            <span class="font-semibold">{r.maxParts === null ? `${r.minParts}+` : `${r.minParts}–${r.maxParts}`} pcs</span><span class="text-right">{r.discount ? `−${r.discount}%` : "—"}</span><span class="text-right">{inr(r.priceExGst)}</span><span class="text-right font-semibold">{inr(r.priceIncGst)}</span>
          </li>))}
      </ul>
    </Fold>
    <Fold title="Advanced settings" meta="rates, estimation, machine cost"><Advanced /></Fold>
  </>;

  return (
    <div class="min-w-0">
      {toast && <div class="mb-3 rounded-xl bg-c1 px-3.5 py-2 text-[13px] font-medium" role="status">{toast}</div>}
      {embed
        ? <div class="grid gap-3">{price}{model}{print_}{more}</div>
        : <div class="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px] items-start"><div class="grid gap-4 min-w-0">{model}{print_}{more}</div><div class="xl:sticky xl:top-0 min-w-0">{price}</div></div>}
      {view && <Viewer name={view.name} src={view.src} onClose={() => setView(null)} />}
    </div>
  );
}

/** Picture viewer. Takes Escape for itself, so a window underneath it stays open. */
function Viewer({ name, src, onClose }: { name: string; src: string; onClose: () => void }) {
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopImmediatePropagation(); e.preventDefault(); onClose(); } }; addEventListener("keydown", k, true); return () => removeEventListener("keydown", k, true); }, []);
  return <div class="fixed inset-0 z-[70] bg-black/80 flex items-center justify-center p-4 cursor-zoom-out" role="dialog" aria-label={name} onClick={onClose}><img src={src} alt={name} class="max-h-[88vh] max-w-full bg-white rounded-xl" /></div>;
}

/* ---------------------------------------------------------------- one STL / OBJ / STEP file */
function PartRow({ p, upd, remove, openView, onSize, onUnit, onAxis, onReset }: {
  p: UploadedPart; upd: (id: number, x: Partial<UploadedPart>) => void; remove: (id: number) => void; openView: (p: UploadedPart) => void; onSize: (p: UploadedPart, mm: number) => void;
  onUnit: (u: MeshUnit) => void; onAxis: (a: UpAxis) => void; onReset: () => void;
}) {
  const longest = longestDimensionMm(p), qn = Math.max(1, p.qty || 1), d = p.meshAnalysis?.dimensions;
  return (
    <div class={`rounded-2xl border border-line bg-c1/40 p-3 ${p.included === false ? "opacity-50" : ""}`}>
      <div class="flex items-start gap-3">
        <input type="checkbox" class="mt-1.5 w-4 h-4" checked={p.included !== false} aria-label={`Include ${p.name}`} onChange={(e) => upd(p.id, { included: (e.target as HTMLInputElement).checked })} />
        <button type="button" onClick={() => openView(p)} title="View larger" class="w-14 h-14 shrink-0 overflow-hidden rounded-xl border border-line bg-white cursor-pointer !min-h-0 p-0">
          {p.thumbnail ? <img src={p.thumbnail} alt="" class="w-full h-full object-cover" /> : <span class="grid place-items-center w-full h-full text-c2"><Icon name="box" size={18} /></span>}
        </button>
        <div class="min-w-0 flex-1">
          <p class="text-[13px] font-semibold break-all">{p.name}</p>
          <p class="t-meta num">{dims(d) || "could not analyse"}</p>
          <p class="num text-[13px] font-semibold mt-0.5">{p.weightGrams !== null ? `${(p.weightGrams * qn).toFixed(1)} g · ${hm((p.timeHours ?? 0) * qn)}` : "—"}<span class="t-meta font-normal"> · estimated</span></p>
        </div>
        <button type="button" aria-label="Remove" onClick={() => remove(p.id)} class="w-7 h-7 shrink-0 grid place-items-center rounded-full text-c3 hover:bg-c1 cursor-pointer !min-h-0"><Icon name="close" size={14} /></button>
      </div>
      <details class="mt-2">
        <summary class="flex items-center gap-1.5 h-7 select-none text-[12px] font-semibold text-c3"><span class="chev inline-flex"><Icon name="right" size={11} /></span>Size, orientation and slicing</summary>
        <div class="mt-2 flex flex-wrap items-center gap-1" role="group" aria-label="Orientation (which side faces up)"><span class="t-meta mr-1">Up</span>
          {UP_AXES.map((a) => <button key={a} type="button" onClick={() => onAxis(a)} class={`h-6 min-w-8 px-1.5 !min-h-0 rounded-md text-[11px] font-semibold cursor-pointer ${p.upAxis === a ? "bg-c4 text-c0" : "bg-c0 border border-line text-c3"}`}>{a}</button>)}</div>
        <div class="mt-2 grid grid-cols-3 gap-2">
          <Field label="Unit"><select class={sm} value={p.unit} onChange={(e) => onUnit((e.target as HTMLSelectElement).value as MeshUnit)}>{UNITS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
          <Field label="Longest side (mm)"><span class="flex items-center gap-1">
            <input key={`${p.id}-${p.scalePercent}`} type="number" min={0.1} step={0.1} class={sm} disabled={longest === null} defaultValue={longest !== null ? String(Math.round(longest * 100) / 100) : ""} aria-label="Longest side in mm"
              onBlur={(e) => onSize(p, parseFloat((e.target as HTMLInputElement).value))} onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()} />
            <button type="button" title="Reset to original size" disabled={!p.baseMeshAnalysis || Math.abs(p.scalePercent - 100) < 0.01} onClick={onReset} class="w-7 h-7 shrink-0 grid place-items-center rounded-md border border-line text-c3 disabled:opacity-40 cursor-pointer !min-h-0">↺</button></span></Field>
          <Field label="Wall loops"><input type="number" min={1} class={sm} value={p.wallLoops} onInput={(e) => upd(p.id, { wallLoops: Math.max(1, num(e) || 1) })} /></Field>
          <Field label="Infill %"><input type="number" min={0} max={100} class={sm} value={p.infillPercent} onInput={(e) => upd(p.id, { infillPercent: Math.min(100, Math.max(0, num(e))) })} /></Field>
          <Field label="Quantity"><input type="number" min={1} class={sm} value={p.qty || 1} onInput={(e) => upd(p.id, { qty: Math.max(1, Math.round(num(e)) || 1) })} /></Field>
        </div>
        <label class="mt-2 flex items-center gap-1.5 text-[12px] text-c3 cursor-pointer"><input type="checkbox" checked={!!p.supportEnabled} onChange={(e) => upd(p.id, { supportEnabled: (e.target as HTMLInputElement).checked })} />Supports (+33% weight, +160% time){p.scalePercent !== 100 && <span class="ml-2">· scaled {Math.round(p.scalePercent)}%</span>}</label>
      </details>
    </div>
  );
}

/* ---------------------------------------------------------------- one 3MF: plates to choose from, and what the file says */
function SheetBlock({ s, figs, set, remove }: { s: SheetState; figs: { g: number; h: number; from: "slicer" | "estimate" }[]; set: (p: Partial<SheetState>) => void; remove: () => void }) {
  const d = s.data, m = d.machine, picked = d.plates.filter((p) => s.on[p.index]).length, anySlice = d.plates.some((p) => p.slice);
  const toggle = (p: Plate) => set({ on: { ...s.on, [p.index]: !s.on[p.index] } });
  return (
    <div class="mt-3 rounded-2xl border border-line bg-c1/30 p-3">
      <div class="flex items-start gap-2">
        <span class="mt-0.5 text-c3"><Icon name="box" size={16} /></span>
        <div class="min-w-0 flex-1">
          <p class="text-[13px] font-semibold break-all">{s.name}.3mf</p>
          <p class="t-meta">{d.app || "3MF project"} · {d.plates.length} plate{d.plates.length === 1 ? "" : "s"} · {picked} chosen</p>
        </div>
        {anySlice ? <Tag tone="grn">sliced file</Tag> : <Tag tone="amb">not sliced · estimated</Tag>}
        <button type="button" aria-label="Remove file" onClick={remove} class="w-7 h-7 shrink-0 grid place-items-center rounded-full text-c3 hover:bg-c1 cursor-pointer !min-h-0"><Icon name="close" size={14} /></button>
      </div>
      {d.plates.length > 0 && <div class="mt-3 grid gap-2.5 grid-cols-[repeat(auto-fill,minmax(230px,1fr))]">
        {d.plates.map((p, k) => {
          const on = !!s.on[p.index], f = figs[k], pcs = s.pieces[p.index] ?? 1;
          return (
            <div key={p.index} class={`rounded-2xl border p-2.5 min-w-0 ${on ? "border-c4 bg-c0" : "border-line bg-c0/60"}`}>
              <button type="button" aria-pressed={on} onClick={() => toggle(p)} class="w-full flex items-start gap-2.5 text-left cursor-pointer !min-h-0 p-0">
                <span class="w-[72px] h-[72px] rounded-xl bg-c1 overflow-hidden shrink-0 flex items-center justify-center text-c2">{p.thumb ? <img src={p.thumb} alt="" class="w-full h-full object-cover" /> : <Icon name="box" size={22} />}</span>
                <span class="min-w-0 flex-1">
                  <b class="block text-[13px] break-words">Plate {p.index}{p.name && p.name !== `Plate ${p.index}` ? ` · ${p.name}` : ""}</b>
                  <span class="block t-meta break-words">{p.objects.length ? p.objects.join(", ") : `${p.instances} object${p.instances === 1 ? "" : "s"}`}</span>
                  {p.size && <span class="block t-meta num">{dims(p.size)}</span>}
                </span>
                <span class={`w-5 h-5 rounded-md border shrink-0 flex items-center justify-center ${on ? "bg-c4 text-c0 border-c4" : "border-c2/50"}`}>{on && <Icon name="check" size={12} />}</span>
              </button>
              <div class="mt-2 flex items-center gap-1.5 flex-wrap">{p.filaments.map((x) => <span key={x.slot} class="inline-flex items-center gap-1 text-[11.5px]" title={x.type}><Dot c={x.colour} />{x.grams !== undefined ? `${x.grams.toFixed(1)} g` : x.type}</span>)}</div>
              <div class="mt-1.5 flex items-center justify-between gap-2"><span class="num text-[13px] font-semibold">{f.g.toFixed(1)} g · {hm(f.h)}</span>{f.from === "slicer" ? <Tag tone="grn">from slicer</Tag> : <Tag tone="amb">estimated</Tag>}</div>
              {on && <label class="mt-2 flex items-center justify-between gap-2 text-[12px] text-c3">Pieces on this plate<input type="number" min={1} class={`${sm} !w-16 text-right`} value={pcs} aria-label={`Pieces on plate ${p.index}`} onInput={(e) => set({ pieces: { ...s.pieces, [p.index]: Math.max(1, Math.round(num(e)) || 1) } })} /></label>}
            </div>
          );
        })}
      </div>}
      <div class="mt-3 flex flex-wrap gap-x-5 gap-y-1.5">
        {anySlice && <label class="flex items-center gap-1.5 text-[12px] text-c3 cursor-pointer"><input type="checkbox" checked={s.slicer} onChange={(e) => set({ slicer: (e.target as HTMLInputElement).checked })} />Use the slicer's weight and time when the file has them</label>}
        <label class="flex items-center gap-1.5 text-[12px] text-c3 cursor-pointer"><input type="checkbox" checked={s.useFile} onChange={(e) => set({ useFile: (e.target as HTMLInputElement).checked })} />Estimate with the file's settings (walls, infill, layer height)</label>
        <label class="flex items-center gap-1.5 text-[12px] text-c3 cursor-pointer"><input type="checkbox" checked={s.support} onChange={(e) => set({ support: (e.target as HTMLInputElement).checked })} />Supports (+33% weight, +160% time)</label>
      </div>
      <details class="mt-2">
        <summary class="flex items-center gap-1.5 h-7 select-none text-[12px] font-semibold text-c3"><span class="chev inline-flex"><Icon name="right" size={11} /></span>What this file contains</summary>
        <div class="mt-2 grid gap-1 text-[12.5px]">
          {([["Printer", m.printer], ["Nozzle", m.nozzle ? `${m.nozzle} mm` : ""], ["Layer height", m.layerHeight ? `${m.layerHeight} mm` : ""], ["Wall loops", m.walls ? String(m.walls) : ""], ["Infill", m.infill !== undefined ? `${m.infill}%` : ""], ["Supports", m.support === undefined ? "" : m.support ? "on" : "off"], ["Bed", m.bed], ["Print profile", m.printProfile]] as const).filter(([, v]) => v).map(([k, v]) => (
            <div key={k} class="flex justify-between gap-3"><span class="text-c3">{k}</span><span class="text-right break-words min-w-0">{v}</span></div>))}
          {m.filaments.length > 0 && <div class="flex justify-between gap-3"><span class="text-c3">Filaments</span><span class="flex flex-wrap justify-end gap-x-3 gap-y-1">{m.filaments.map((f, i) => <span key={i} class="inline-flex items-center gap-1"><Dot c={f.colour} />{f.name || f.type || `Slot ${i + 1}`}</span>)}</span></div>}
        </div>
        {d.notes.map((n, i) => <p key={i} class="t-meta mt-1.5">{n}</p>)}
        <p class="t-meta mt-1.5 break-words">{d.entries.length} items inside{d.geometry === "skipped" ? ", models not read (too large)" : ""}: {d.entries.slice(0, 14).map((e) => e.name).join(", ")}{d.entries.length > 14 ? " …" : ""}</p>
      </details>
    </div>
  );
}
