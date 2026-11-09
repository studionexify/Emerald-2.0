/** Nexcal · FDM — the studio's pricing calculator, ported from Emerald 1 (same engine, same numbers). */
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { CALC_TABS } from "../nav";
import { Button, Card, CardTitle, Field, Icon, inputCls, Page, Sheet, SubTabs } from "../ui";
import { navigate } from "../router";
import { createOrder, inr } from "../data";
import { nexcalSig, NEXCAL_DEFAULTS, type NexcalSettings } from "../data/pricing";
import {
  aggregateUploadedParts, applyAggregateToInputs, buildBulkPriceTable, calculateNexcal, computePrintTimeRate, emptyNexcalInputs, estimatorParams,
  getPartsPerSpool, longestDimensionMm, newUploadedPart, NEXCAL_MATERIALS, type MeshUnit, type NexcalInputs, type NexcalLineRow, type UploadedPart,
} from "../data/nexcal/engine";
import { estimate as estimatePart } from "../data/nexcal/estimator";
import { analyzeMesh, detectFormatAndParse, scaleMeshAnalysis, type Triangle, type UpAxis } from "../data/nexcal/geometry";
import { renderDataURL } from "../data/nexcal/thumbnail";
import { blankQ, SpoolPick, type Quote } from "./Calculator";

const UP_AXES: UpAxis[] = ["Z", "-Z", "X", "-X", "Y", "-Y"];
const UNITS: [MeshUnit, string][] = [["mm", "mm"], ["cm", "cm"], ["inch", "in"]];
let seq = 1;
const rid = () => seq++;
const matRows = (): NexcalLineRow[] => [{ id: rid(), name: "", qty: 1, unitCost: 0 }, { id: rid(), name: "", qty: 1, unitCost: 0 }];
const packRows = (): NexcalLineRow[] => [{ id: rid(), name: "Packaging", qty: 1, unitCost: 0 }, { id: rid(), name: "Postage / Shipping", qty: 1, unitCost: 0 }];
const num = (e: Event) => Number((e.target as HTMLInputElement).value) || 0;
const sm = `${inputCls} !h-7 !px-2 text-[12px] num`;
const dec = (n: number) => inr(Math.round(n * 100) / 100);

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return <div class={`flex justify-between gap-3 py-1 text-[13px] ${strong ? "font-semibold border-t border-line mt-1 pt-2" : ""}`}><span class={strong ? "" : "text-c3"}>{label}</span><span class="num">{value}</span></div>;
}

/* ---------------------------------------------------------------- 3D model upload */
function UploadCard({ parts, onFiles, onPart, onUnit, onAxis, onSize, onReset, onRemove, onClear, onView, agg, busy }: {
  parts: UploadedPart[]; onFiles: (f: FileList | null) => void; onPart: (id: number, p: Partial<UploadedPart>) => void;
  onUnit: (p: UploadedPart, u: MeshUnit) => void; onAxis: (p: UploadedPart, a: UpAxis) => void; onSize: (p: UploadedPart, mm: number) => void;
  onReset: (p: UploadedPart) => void; onRemove: (id: number) => void; onClear: () => void; onView: (p: UploadedPart) => void;
  agg: ReturnType<typeof aggregateUploadedParts>; busy: boolean;
}) {
  const [over, setOver] = useState(false);
  const [hover, setHover] = useState(false);
  useEffect(() => {
    if (!hover) return;
    const f = (e: ClipboardEvent) => { if (e.clipboardData?.files.length) { e.preventDefault(); onFiles(e.clipboardData.files); } };
    addEventListener("paste", f); return () => removeEventListener("paste", f);
  }, [hover]);
  return (
    <div class="flex flex-col h-full">
      <CardTitle>3D model</CardTitle>
      <p class="t-meta -mt-1 mb-3">Upload a model to estimate its weight and print time automatically.</p>
      <label tabIndex={0} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
        onDragEnter={(e) => { e.preventDefault(); setOver(true); }} onDragOver={(e) => e.preventDefault()} onDragLeave={(e) => { e.preventDefault(); setOver(false); }}
        onDrop={(e) => { e.preventDefault(); setOver(false); onFiles(e.dataTransfer?.files ?? null); }}
        class={`flex-1 min-h-[150px] justify-center flex flex-col items-center gap-1.5 rounded-2xl border-2 border-dashed px-6 py-7 text-center cursor-pointer transition-colors ${over ? "border-c4 bg-c1" : "border-c2 hover:bg-c1/50"}`}>
        <Icon name="in" size={22} />
        <span class="text-[13px] font-semibold">{busy ? "Reading files…" : "Click, drag or paste 3D files here"}</span>
        <span class="t-meta">.stl, .obj, .step, .stp — multiple files supported</span>
        <input type="file" accept=".stl,.obj,.step,.stp" multiple class="sr-only" onChange={(e) => { onFiles((e.target as HTMLInputElement).files); (e.target as HTMLInputElement).value = ""; }} />
      </label>

      {parts.length > 0 && <>
        <div class="mt-3 flex flex-col gap-2.5">
          {parts.map((p) => {
            const longest = longestDimensionMm(p), q = Math.max(1, p.qty || 1), d = p.meshAnalysis?.dimensions;
            return (
              <div key={p.id} class={`rounded-2xl border border-line bg-c1/40 p-3 ${p.included === false ? "opacity-50" : ""}`}>
                <div class="flex items-start gap-3">
                  <input type="checkbox" class="mt-1.5 w-4 h-4" checked={p.included !== false} aria-label={`Include ${p.name}`} onChange={(e) => onPart(p.id, { included: (e.target as HTMLInputElement).checked })} />
                  <button type="button" onClick={() => onView(p)} title="View larger" class="w-14 h-14 shrink-0 overflow-hidden rounded-xl border border-line bg-white cursor-pointer">
                    {p.thumbnail ? <img src={p.thumbnail} alt="" class="w-full h-full object-cover" /> : <span class="grid place-items-center w-full h-full text-c2"><Icon name="box" size={18} /></span>}
                  </button>
                  <div class="min-w-0 flex-1">
                    <p class="text-[13px] font-semibold break-all">{p.name}</p>
                    <p class="t-meta num">{d ? `${d.x.toFixed(1)} × ${d.y.toFixed(1)} × ${d.z.toFixed(1)} mm` : "could not analyse"}</p>
                    <div class="mt-1.5 flex flex-wrap items-center gap-1" role="group" aria-label="Orientation (which side faces up)">
                      <span class="t-meta mr-1">Up</span>
                      {UP_AXES.map((a) => <button key={a} type="button" onClick={() => onAxis(p, a)} class={`h-6 min-w-8 px-1.5 rounded-md text-[11px] font-semibold cursor-pointer ${p.upAxis === a ? "bg-c4 text-c0" : "bg-c0 border border-line text-c3 hover:text-c4"}`}>{a}</button>)}
                    </div>
                  </div>
                  <button type="button" aria-label="Remove" onClick={() => onRemove(p.id)} class="w-7 h-7 shrink-0 grid place-items-center rounded-full text-c3 hover:bg-c1 cursor-pointer"><Icon name="close" size={14} /></button>
                </div>
                <div class="mt-3 grid grid-cols-3 lg:grid-cols-5 gap-2">
                  <Field label="Unit"><select class={sm} value={p.unit} onChange={(e) => onUnit(p, (e.target as HTMLSelectElement).value as MeshUnit)}>{UNITS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
                  <Field label="Size (mm)">
                    <span class="flex items-center gap-1">
                      <input key={`${p.id}-${p.scalePercent}`} type="number" min={0.1} step={0.1} class={sm} disabled={longest === null} defaultValue={longest !== null ? String(Math.round(longest * 100) / 100) : ""}
                        aria-label="Longest side in mm" onBlur={(e) => onSize(p, parseFloat((e.target as HTMLInputElement).value))} onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()} />
                      <button type="button" title="Reset to original size" disabled={!p.baseMeshAnalysis || Math.abs(p.scalePercent - 100) < 0.01} onClick={() => onReset(p)}
                        class="w-7 h-7 shrink-0 grid place-items-center rounded-md border border-line text-c3 disabled:opacity-40 cursor-pointer">↺</button>
                    </span>
                  </Field>
                  <Field label="Wall loops"><input type="number" min={1} class={sm} value={p.wallLoops} onInput={(e) => onPart(p.id, { wallLoops: Math.max(1, num(e) || 1) })} /></Field>
                  <Field label="Infill %"><input type="number" min={0} max={100} class={sm} value={p.infillPercent} onInput={(e) => onPart(p.id, { infillPercent: Math.min(100, Math.max(0, num(e))) })} /></Field>
                  <Field label="Qty"><input type="number" min={1} class={sm} value={p.qty || 1} onInput={(e) => onPart(p.id, { qty: Math.max(1, Math.round(num(e)) || 1) })} /></Field>
                </div>
                <div class="mt-2.5 flex flex-wrap items-center justify-between gap-2">
                  <label class="flex items-center gap-1.5 text-[12px] text-c3 cursor-pointer"><input type="checkbox" checked={!!p.supportEnabled} onChange={(e) => onPart(p.id, { supportEnabled: (e.target as HTMLInputElement).checked })} />Support (+33% wt / +160% time){p.scalePercent !== 100 && <span class="ml-2">· scaled {Math.round(p.scalePercent)}%</span>}</label>
                  <span class="num text-[13px] font-semibold">{p.weightGrams !== null ? `${(p.weightGrams * q).toFixed(2)} g · ${((p.timeHours ?? 0) * q).toFixed(2)} hr` : "—"}</span>
                </div>
              </div>
            );
          })}
        </div>
        <div class="mt-3 rounded-xl bg-c1/60 p-3">
          <Row label="Files" value={String(agg.fileCount)} />
          <Row label="Total parts (qty)" value={String(agg.totalPartCount)} />
          <Row label="Total volume" value={`${(agg.totalVolumeMm3 / 1000).toFixed(2)} cm³`} />
          <Row label="Total surface area" value={`${Math.round(agg.totalSurfaceAreaMm2).toLocaleString("en-IN")} mm²`} />
          <Row label="Triangles" value={agg.totalTriangleCount.toLocaleString("en-IN")} />
          <Row strong label="Estimated filament" value={`${agg.totalWeightGrams.toFixed(2)} g`} />
          <Row strong label="Estimated print time" value={`${agg.totalTimeHours.toFixed(2)} hr`} />
        </div>
        <div class="mt-2 flex items-center justify-between gap-2"><p class="t-meta">Auto-filled into Print parameters below — adjust by hand if needed.</p><Button variant="outline" onClick={onClear}>Clear all</Button></div>
      </>}
    </div>
  );
}

/* ---------------------------------------------------------------- line items */
function Lines({ title, rows, locked, total, onChange, add }: { title: string; rows: NexcalLineRow[]; locked?: [string, number]; total: number; onChange: (r: NexcalLineRow[]) => void; add: string }) {
  const up = (id: number, p: Partial<NexcalLineRow>) => onChange(rows.map((r) => (r.id === id ? { ...r, ...p } : r)));
  return (
    <div class="mb-4 last:mb-0">
      <div class="flex items-center justify-between mb-1.5"><span class="t-section">{title}</span><Button variant="outline" icon="plus" onClick={() => onChange([...rows, { id: rid(), name: "", qty: 1, unitCost: 0 }])}>{add}</Button></div>
      <div class="hidden 2xl:grid grid-cols-[minmax(0,1fr)_64px_96px_90px_28px] gap-2 t-meta uppercase tracking-[0.06em] pb-1 border-b border-line"><span>Item</span><span class="text-right">Qty</span><span class="text-right">Unit ₹</span><span class="text-right">Total</span><span /></div>
      {locked && <div class="grid grid-cols-[minmax(0,1fr)_auto] 2xl:grid-cols-[minmax(0,1fr)_56px_80px_76px_28px] gap-2 items-center py-1.5 text-[13px] border-b border-line"><span class="font-medium text-c3">{locked[0]}</span><span class="hidden 2xl:block" /><span class="hidden 2xl:block" /><span class="num text-right font-semibold">{dec(locked[1])}</span><span class="hidden 2xl:block" /></div>}
      {rows.map((r) => (
        <div key={r.id} class="grid grid-cols-[minmax(0,1fr)_56px_80px_28px] 2xl:grid-cols-[minmax(0,1fr)_56px_80px_76px_28px] gap-2 items-center py-1.5 border-b border-line">
          <input class={sm} placeholder="Name" value={r.name} onInput={(e) => up(r.id, { name: (e.target as HTMLInputElement).value })} />
          <input class={`${sm} text-right`} type="number" min={0} value={r.qty} onInput={(e) => up(r.id, { qty: num(e) })} aria-label="Qty" />
          <input class={`${sm} text-right`} type="number" min={0} value={r.unitCost} onInput={(e) => up(r.id, { unitCost: num(e) })} aria-label="Unit cost" />
          <span class="hidden 2xl:block num text-right text-[13px]">{dec(r.qty * r.unitCost)}</span>
          <button type="button" aria-label="Remove row" onClick={() => onChange(rows.filter((x) => x.id !== r.id))} class="w-7 h-7 grid place-items-center rounded-full text-c3 hover:bg-c1 cursor-pointer"><Icon name="close" size={12} /></button>
        </div>
      ))}
      <div class="flex justify-between pt-2 text-[13px] font-semibold"><span>Total</span><span class="num">{dec(total)}</span></div>
    </div>
  );
}

/* ---------------------------------------------------------------- settings */
function SetNum({ label, k }: { label: string; k: keyof NexcalSettings }) {
  const s = nexcalSig.value;
  return <Field label={label}><input class={`${inputCls} num`} type="number" step="any" value={s[k] as number} onInput={(e) => (nexcalSig.value = { ...nexcalSig.value, [k]: num(e) })} /></Field>;
}
function Advanced() {
  const s = nexcalSig.value, pr = computePrintTimeRate(s);
  return (
    <div class="grid gap-6 lg:grid-cols-2 pt-3">
      <div class="flex flex-col gap-5">
        <div><div class="t-section mb-2">General rates</div><div class="grid grid-cols-2 gap-3">
          <SetNum label="Material efficiency factor" k="materialEfficiencyFactor" /><SetNum label="Labour rate (₹/hr)" k="labourHourlyRate" />
          <SetNum label="GST (%)" k="gstPercent" /><SetNum label="Default margin (%)" k="defaultMarginPercent" /><SetNum label="Margin floor (%)" k="marginFloorPct" />
        </div></div>
        <div><div class="t-section mb-1">Model estimation</div><p class="t-meta mb-2">Slicer-like parameters for uploads. Unit, up-axis, walls, infill, support and size are set per part.</p><div class="grid grid-cols-2 gap-3">
          <SetNum label="Nozzle diameter (mm)" k="nozzleDiameter" /><SetNum label="Layer height (mm)" k="layerHeight" />
          <SetNum label="Default wall loops" k="wallLoops" /><SetNum label="Default infill (%)" k="infillPercent" />
          <SetNum label="Outer wall speed (mm/s)" k="outerWallSpeed" /><SetNum label="Inner wall speed (mm/s)" k="innerWallSpeed" />
          <SetNum label="Infill speed (mm/s)" k="infillSpeed" /><SetNum label="First layer speed (mm/s)" k="firstLayerSpeed" />
          <SetNum label="Speed realisation factor" k="speedRealizationFactor" /><SetNum label="Per-layer overhead (s)" k="perLayerOverheadSeconds" />
          <SetNum label="First layer overhead (s)" k="firstLayerFixedOverheadSeconds" />
        </div></div>
      </div>
      <div>
        <div class="t-section mb-2">Print time rate (machine cost)</div>
        <SubTabs value={s.printTimeRateMode} onChange={(m) => (nexcalSig.value = { ...s, printTimeRateMode: m })} items={[["auto", "From printer economics"], ["manual", "Manual ₹/hr"]]} />
        {s.printTimeRateMode === "manual" ? <div class="mt-3 max-w-[200px]"><SetNum label="Print time rate (₹/hr)" k="printTimeRateManual" /></div> : <>
          <div class="mt-3 grid grid-cols-2 gap-3">
            <SetNum label="Printer cost (₹)" k="printerCost" /><SetNum label="Additional upfront (₹)" k="additionalUpfrontCost" />
            <SetNum label="Annual maintenance (₹)" k="annualMaintenance" /><SetNum label="Estimated life (yrs)" k="estimatedLifeYrs" />
            <SetNum label="Uptime (%)" k="estimatedUptimePct" /><SetNum label="Power draw (W)" k="powerConsumptionW" />
            <SetNum label="Electricity (₹/kWh)" k="electricityCost" /><SetNum label="Cost buffer factor" k="costBufferFactor" />
          </div>
          <div class="mt-3 rounded-xl bg-c1/60 p-3">
            <Row label="Total investment" value={dec(pr.totalInvestment)} /><Row label="Lifetime cost" value={dec(pr.lifetimeCost)} />
            <Row label="Uptime hrs / yr" value={pr.uptimeHrsYr.toFixed(0)} /><Row label="Capital ₹/hr" value={dec(pr.capitalCostPerHr)} />
            <Row label="Electrical ₹/hr" value={dec(pr.electricalCostPerHr)} /><Row strong label="Print time rate" value={`${dec(pr.printTimeRate)}/hr`} />
          </div>
        </>}
        <Button class="mt-4" variant="outline" onClick={() => { if (confirm("Reset all Nexcal settings to the Excel defaults?")) nexcalSig.value = { ...NEXCAL_DEFAULTS }; }}>Reset to Excel defaults</Button>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- page */
export function Nexcal() {
  const settings = nexcalSig.value;
  const fresh = (): NexcalInputs => ({ ...emptyNexcalInputs(), marginPercent: settings.defaultMarginPercent, materialRows: matRows(), packagingRows: packRows() });
  const [inputs, setInputs] = useState<NexcalInputs>(fresh);
  const [q, setQ] = useState<Quote>(blankQ);
  const [files, setFiles] = useState<UploadedPart[]>([]);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState("");
  const [view, setView] = useState<{ name: string; src: string } | null>(null);
  const [adv, setAdv] = useState(false);
  const tris = useRef(new Map<number, Triangle[]>());
  const patch = (p: Partial<NexcalInputs>) => setInputs((c) => ({ ...c, ...p }));
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(""), 2600); return () => clearTimeout(t); }, [toast]);

  const result = useMemo(() => calculateNexcal(inputs, settings), [inputs, settings]);
  const bulk = useMemo(() => buildBulkPriceTable(inputs, settings, result.unitLandedCost), [inputs, settings, result.unitLandedCost]);
  const perSpool = getPartsPerSpool(settings, inputs.filamentGrams);
  const parts = useMemo(() => files.map((f) => {
    if (!f.meshAnalysis) return { ...f, weightGrams: null, timeHours: null };
    const e = estimatePart(f.meshAnalysis, inputs.material, estimatorParams(settings, { wallLoops: f.wallLoops, infillPercent: f.infillPercent, supportEnabled: f.supportEnabled }));
    return { ...f, weightGrams: e.weightGrams, timeHours: e.timeHours };
  }), [files, inputs.material, settings]);
  const agg = useMemo(() => aggregateUploadedParts(parts), [parts]);
  useEffect(() => { if (files.length) setInputs((c) => applyAggregateToInputs(c, agg)); }, [agg.totalWeightGrams, agg.totalTimeHours, agg.totalPartCount]);

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
  const onFiles = async (fl: FileList | null) => {
    if (!fl?.length) return;
    setBusy(true);
    const got = await Promise.all([...fl].map(async (file) => { try { return { file, t: await detectFormatAndParse(file) }; } catch (e) { setToast((e as Error).message || `Could not read ${file.name}`); return null; } }));
    setBusy(false);
    const add: UploadedPart[] = [];
    for (const g of got) { if (!g) continue; const id = rid(); tris.current.set(id, g.t); const b = newUploadedPart(id, g.file.name, settings); add.push({ ...b, ...analyse(b) }); }
    if (add.length) { setFiles((fs) => [...fs, ...add]); if (!q.item) setQ((x) => ({ ...x, item: add[0].name.replace(/\.[^.]+$/, "") })); }
  };
  const onSize = (p: UploadedPart, mm: number) => {
    if (!p.baseMeshAnalysis || !isFinite(mm) || mm <= 0) return;
    const d = p.baseMeshAnalysis.dimensions, base = Math.max(d.x, d.y, d.z); if (base <= 0) return;
    const pct = (mm / base) * 100; upd(p.id, { scalePercent: pct, meshAnalysis: scaleMeshAnalysis(p.baseMeshAnalysis, pct / 100) });
  };
  const remove = (id: number) => { tris.current.delete(id); setFiles((fs) => { const n = fs.filter((f) => f.id !== id); if (!n.length) patch({ orderQty: 1 }); return n; }); };
  const clear = () => { tris.current.clear(); setFiles([]); patch({ orderQty: 1 }); };
  const openView = (p: UploadedPart) => { const t = tris.current.get(p.id); if (!t?.length) return; let src = p.thumbnail ?? ""; try { src = renderDataURL(t, p.upAxis, 900); } catch { /* keep small */ } setView({ name: p.name, src }); };
  const reset = () => { clear(); setInputs(fresh()); setQ(blankQ()); setToast("Calculator reset"); };

  const hrs = Math.floor(inputs.printHours), minsRaw = Math.round((inputs.printHours - hrs) * 60);
  const H = minsRaw === 60 ? hrs + 1 : hrs, M = minsRaw === 60 ? 0 : minsRaw;
  const wide = files.length > 0;
  const below = result.marginSafe < settings.marginFloorPct;

  const summary = () => [
    "Studio Nexify — Price Estimate", "--------------------------------",
    ...(q.item ? [`Item: ${q.item}`] : []),
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
      supports: files.some((f) => f.supportEnabled), material: q.material ?? inputs.material, colour: q.colour });
    navigate("/work/orders");
  };

  return (
    <Page title="Nexcal" sub="Cost-plus pricing, machine-time economics and bulk tiers" tabs={CALC_TABS}
      actions={<><Button variant="outline" icon="copy" onClick={copy}>Copy summary</Button><Button variant="outline" icon="printer" onClick={() => print()}>Print</Button><Button variant="outline" onClick={reset}>Reset</Button></>}>
      {toast && <div class="mb-3 rounded-xl bg-c1 px-3.5 py-2 text-[13px] font-medium" role="status">{toast}</div>}
      <div class="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px] items-start">
        <Card>
          <div class="grid lg:grid-cols-2">
            <section class={`min-w-0 pb-5 ${wide ? "lg:col-span-2" : "lg:pr-5 lg:pb-0 lg:border-r border-line"}`}>
          <UploadCard parts={parts} agg={agg} busy={busy} onFiles={onFiles} onPart={upd} onClear={clear} onRemove={remove} onView={openView} onSize={onSize}
            onUnit={(p, unit) => upd(p.id, { unit, scalePercent: 100, ...analyse({ ...p, unit, scalePercent: 100 }) })}
            onAxis={(p, upAxis) => upd(p.id, { upAxis, ...analyse({ ...p, upAxis }) })}
            onReset={(p) => p.baseMeshAnalysis && upd(p.id, { scalePercent: 100, meshAnalysis: scaleMeshAnalysis(p.baseMeshAnalysis, 1) })} />
            </section>
            <section class={`min-w-0 pt-5 border-t border-line ${wide ? "lg:col-span-2" : "lg:pt-0 lg:pl-5 lg:border-t-0"}`}>
              <CardTitle>Print & pricing</CardTitle>
            <div class={`grid gap-3 grid-cols-2 ${wide ? "md:grid-cols-4" : ""}`}>
              <div class={`col-span-2 ${wide ? "md:col-span-4" : ""}`}><SpoolPick onPick={(c, m, col) => { patch({ filamentCostPerKg: c, ...(m && (NEXCAL_MATERIALS as readonly string[]).includes(m) ? { material: m } : {}) }); setQ({ ...q, material: m, colour: col }); }} /></div>
              <Field label="Material used"><select class={inputCls} value={inputs.material} onChange={(e) => patch({ material: (e.target as HTMLSelectElement).value })}>{NEXCAL_MATERIALS.map((m) => <option key={m}>{m}</option>)}</select></Field>
              <Field label="Filament cost (₹ / kg)"><input class={`${inputCls} num`} type="number" value={inputs.filamentCostPerKg} onInput={(e) => patch({ filamentCostPerKg: num(e) })} /></Field>
              <Field label="Filament per part (g)"><input class={`${inputCls} num`} type="number" step="any" value={inputs.filamentGrams} onInput={(e) => patch({ filamentGrams: num(e) })} /></Field>
              <Field label="Print time per part">
                <span class="flex gap-1.5">
                  <span class="relative flex-1"><input class={`${inputCls} num !pr-8 !pl-2 text-right`} type="number" aria-label="Hours" value={H} onInput={(e) => patch({ printHours: Math.max(0, Math.round(num(e))) + M / 60 })} /><span class="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 t-meta">hr</span></span>
                  <span class="relative flex-1"><input class={`${inputCls} num !pr-9 !pl-2 text-right`} type="number" aria-label="Minutes" value={M} onInput={(e) => patch({ printHours: (Math.max(0, Math.round(num(e))) + H * 60) / 60 })} /><span class="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 t-meta">min</span></span>
                </span>
              </Field>
              <Field label="Labour per part (min)"><input class={`${inputCls} num`} type="number" value={inputs.labourMinutes} onInput={(e) => patch({ labourMinutes: num(e) })} /></Field>
              <Field label="Margin (%)"><input class={`${inputCls} num`} type="number" value={inputs.marginPercent} onInput={(e) => patch({ marginPercent: num(e) })} /></Field>
            </div>
            <p class="t-meta mt-3">GST <b class="text-c4">{settings.gstPercent}%</b> · machine <b class="text-c4">{dec(result.printTimeRate)}/hr</b> · <button type="button" class="underline cursor-pointer" onClick={() => setAdv(true)}>Advanced settings</button></p>
            </section>
          </div>
          <div class="mt-5 pt-5 border-t border-line">
            <CardTitle>Bill of materials</CardTitle>
            <div class="grid lg:grid-cols-2 gap-y-5">
              <section class="min-w-0 lg:pr-5 lg:border-r border-line">
            <Lines title="Materials" rows={inputs.materialRows} locked={["Printed part (auto)", result.printedPartCost]} total={result.totalMaterialsCost} onChange={(r) => patch({ materialRows: r })} add="Add material" />
              </section>
              <section class="min-w-0 pt-5 border-t border-line lg:pt-0 lg:border-t-0 lg:pl-5">
                <Lines title="Packaging & shipping" rows={inputs.packagingRows} total={result.totalPackagingCost} onChange={(r) => patch({ packagingRows: r })} add="Add item" />
              </section>
            </div>
          </div>
          <div class="mt-5 pt-5 border-t border-line">
            <CardTitle>Bulk pricing</CardTitle>
            <p class="t-meta -mt-1 mb-3">Spool-count tiers, mapped automatically to a part-quantity range.</p>
            <div class="grid lg:grid-cols-2">
              <section class="min-w-0 pb-5 lg:pb-0 lg:pr-5 lg:border-r border-line">
                        <div class="grid grid-cols-2 gap-3">
              <Field label="Order quantity"><input class={`${inputCls} num`} type="number" min={1} value={inputs.orderQty} onInput={(e) => patch({ orderQty: num(e) || 1 })} /></Field>
              <Field label="Spool weight (g)"><input class={`${inputCls} num`} type="number" value={settings.spoolWeightGrams} onInput={(e) => (nexcalSig.value = { ...settings, spoolWeightGrams: num(e) || 1 })} /></Field>
            </div>
            <p class="t-meta mt-2">1 part = {inputs.filamentGrams} g · {perSpool >= 1 ? `${perSpool} part${perSpool === 1 ? "" : "s"} / spool` : `${Math.ceil(inputs.filamentGrams / Math.max(1, settings.spoolWeightGrams))} spools / part`}</p>
            <div class="mt-3 flex items-center justify-between"><span class="t-meta uppercase tracking-[0.06em]">Spool qty tiers</span>
              <Button variant="outline" icon="plus" onClick={() => { const s = [...settings.bulkTiers].sort((a, b) => a.min - b.min); nexcalSig.value = { ...settings, bulkTiers: [...settings.bulkTiers, { min: (s[s.length - 1]?.min ?? 0) + 1 }] }; }}>Add tier</Button></div>
            <div class="mt-2 flex flex-wrap gap-2">
              {settings.bulkTiers.map((t, i) => (
                <span key={i} class="flex items-center gap-1 rounded-full border border-line bg-c1/50 pl-3 pr-1 h-8">
                  <input type="number" min={1} class="num w-12 bg-transparent text-right text-[12px] font-semibold outline-none" value={t.min} aria-label="Tier starts at spools"
                    onInput={(e) => (nexcalSig.value = { ...settings, bulkTiers: settings.bulkTiers.map((x, j) => (j === i ? { min: Math.max(1, num(e) || 1) } : x)) })} />
                  {settings.bulkTiers.length > 1 && <button type="button" aria-label="Remove tier" onClick={() => (nexcalSig.value = { ...settings, bulkTiers: settings.bulkTiers.filter((_, j) => j !== i) })} class="w-6 h-6 grid place-items-center rounded-full text-c3 hover:bg-c1 cursor-pointer"><Icon name="close" size={11} /></button>}
                </span>
              ))}
            </div>
              </section>
              <section class="min-w-0 pt-5 border-t border-line lg:pt-0 lg:border-t-0 lg:pl-5">
                <ul class="flex flex-col gap-1.5">
              <li class="grid grid-cols-[minmax(0,1fr)_40px_52px_52px] gap-2 px-3 t-meta uppercase tracking-[0.06em]"><span>Qty</span><span class="text-right">Off</span><span class="text-right">Ex GST</span><span class="text-right">Inc GST</span></li>
              {bulk.map((r, i) => (
                <li key={i} class={`grid grid-cols-[minmax(0,1fr)_40px_52px_52px] gap-2 items-center rounded-xl px-3 h-10 text-[13px] num ${r.isActive ? "bg-c4 text-c0" : "bg-c1/60"}`}>
                  <span class="font-semibold whitespace-nowrap">{r.maxParts === null ? `${r.minParts}+` : `${r.minParts}–${r.maxParts}`} pcs</span>
                  <span class="text-right">{r.discount ? `−${r.discount}%` : "—"}</span>
                  <span class="text-right">{inr(r.priceExGst)}</span>
                  <span class="text-right font-semibold">{inr(r.priceIncGst)}</span>
                </li>
              ))}
                </ul>
              </section>
            </div>
          </div>
          <div class="mt-5 pt-4 border-t border-line">
        <button type="button" onClick={() => setAdv(!adv)} aria-expanded={adv} class="w-full flex items-center justify-between text-left cursor-pointer">
          <span class="text-[15px] font-semibold">Advanced settings</span><span class={`transition-transform ${adv ? "rotate-90" : ""}`}><Icon name="right" size={14} /></span>
        </button>
        {adv && <Advanced />}
          </div>
        </Card>

        <Card class="xl:sticky xl:top-0">
          <CardTitle>Cost summary</CardTitle>
            <Row label="Total materials" value={dec(result.totalMaterialsCost)} />
            <Row label="Total labour" value={dec(result.totalLabourCost)} />
            <Row label="Machine / printer" value={dec(result.machineCost)} />
            <Row label="Total packaging" value={dec(result.totalPackagingCost)} />
            <Row strong label="Unit landed cost" value={dec(result.unitLandedCost)} />
            <Row label="Order quantity" value={`${result.orderQty} ${result.orderQty === 1 ? "unit" : "units"}`} />
            <Row label="Bulk discount" value={result.bulkDiscount ? `${result.bulkDiscount}% off margin` : "—"} />
            <Row strong label="Total landed cost" value={dec(result.totalLandedCost)} />
            <Row label={`Calculated price (pre-tax) · ${result.marginSafe}% margin`} value={dec(result.calcPrice)} />
            <Row label={`GST ${settings.gstPercent}%`} value={dec(result.gstAmount)} />
            <div class="mt-3 rounded-2xl bg-c4 text-c0 px-4 py-4 text-center">
              <p class="text-[11px] font-semibold uppercase tracking-[0.08em] opacity-70">Final price <span class="normal-case font-normal">(rounded to ₹10)</span></p>
              <p class="num text-[32px] leading-none font-semibold tracking-tight mt-1">{inr(result.finalPriceRounded)}</p>
              <p class="num text-[12px] mt-1.5 opacity-70">Exact {dec(result.finalPrice)}{result.perUnitPrice !== null && <> · per unit {dec(result.perUnitPrice)}</>}</p>
            </div>
            {below && <p class="mt-2 text-[12px] text-warn font-medium">Margin {result.marginSafe}% is below the {settings.marginFloorPct}% floor.</p>}
            <Button class="mt-3 w-full" onClick={quote}>Use in quotation</Button>
        </Card>
      </div>


      {view && <Sheet open onClose={() => setView(null)} title={view.name}><img src={view.src} alt={view.name} class="mx-auto max-h-[70vh] w-auto bg-white rounded-xl" /></Sheet>}
    </Page>
  );
}
