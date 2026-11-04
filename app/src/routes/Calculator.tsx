import { useState } from "preact/hooks";
import { CALC_TABS } from "../nav";
import { Button, Card, CardTitle, Field, inputCls, Page, SubTabs } from "../ui";
import { navigate } from "../router";
import { createOrder, inr, rate, RATE_DEFS, ratesSig, resetRates, setRate } from "../data";

type Fields = Record<string, number>;
function useFields(init: Fields) {
  const [v, setV] = useState(init);
  const bind = (k: string) => ({ value: v[k], type: "number" as const, inputMode: "decimal" as const, class: inputCls,
    onInput: (e: Event) => setV({ ...v, [k]: Number((e.target as HTMLInputElement).value) || 0 }) });
  return [v, bind, setV] as const;
}

function Result({ rows, price }: { rows: [string, number][]; price: number }) {
  return (
    <Card dark class="self-start">
      <div class="text-sm opacity-80">Suggested price (incl. GST)</div>
      <div class="num text-3xl xl:text-5xl font-semibold mt-1 mb-2">{inr(price)}</div>
      <ul class="flex flex-col gap-2 text-sm">
        {rows.map(([l, n]) => <li key={l} class="flex justify-between border-t border-c3 pt-2"><span class="opacity-80">{l}</span><span class="num">{inr(n)}</span></li>)}
      </ul>
      <Button variant="outline" class="mt-3 w-full" onClick={() => { const o = createOrder({ type: "client", customer: prompt("Customer name") || "New client", item: prompt("Item name") || "Calculated item", qty: 1, price: Math.round(price), medium: "Instagram", due: "" }); alert(`Created ${o.no} at Quotation for ${inr(price)}`); navigate("/work/orders"); }}>Use in quotation</Button>
    </Card>
  );
}

function Shell({ children }: { children: preact.ComponentChildren }) {
  return (
    <Page title="Calculator" sub="Price a job before you quote it"  tabs={CALC_TABS}>
      <div class="grid gap-3 lg:grid-cols-[1fr_320px]">{children}</div>
    </Page>
  );
}

export function Nexcal() {
  const [mode, setMode] = useState<"direct" | "upload">("direct");
  const [v, b, setV] = useFields({ grams: 120, perKg: rate("pla"), hours: 5, machine: rate("machine"), power: rate("power"), labour: rate("labour") / 2, packing: rate("packingDefault"), margin: rate("margin"), gst: rate("gst"), qty: 1 });
  const material = (v.grams / 1000) * v.perKg, machine = v.hours * (v.machine + v.power);
  const cost = material + machine + v.labour + v.packing;
  const pre = cost * (1 + v.margin / 100), price = pre * (1 + v.gst / 100);
  return (
    <Shell>
      <Card>
        <CardTitle>Nexcal · FDM</CardTitle>
        <div class="mb-3"><SubTabs value={mode} onChange={setMode} items={[["direct", "Direct input"], ["upload", "Upload models"]]} /></div>
        {mode === "upload" && <ModelUpload onTotal={(g, h) => setV({ ...v, grams: Math.round(g), hours: Math.round(h * 10) / 10 })} />}
        <div class="grid sm:grid-cols-2 gap-4">
          <Field label="Filament used (g)"><input {...b("grams")} /></Field>
          <Field label="Filament price (₹/kg)"><input {...b("perKg")} /></Field>
          <Field label="Print time (h)"><input {...b("hours")} /></Field>
          <Field label="Machine rate (₹/h)"><input {...b("machine")} /></Field>
          <Field label="Electricity (₹/h)"><input {...b("power")} /></Field>
          <Field label="Labour & finishing (₹)"><input {...b("labour")} /></Field>
          <Field label="Packaging (₹)"><input {...b("packing")} /></Field>
          <Field label="Margin (%)"><input {...b("margin")} /></Field>
          <Field label="GST (%)"><input {...b("gst")} /></Field>
          <Field label="Quantity"><input {...b("qty")} /></Field>
        </div>
      </Card>
      <Result price={price * v.qty} rows={[["Material", material], ["Machine + power", machine], ["Labour", v.labour], ["Packaging", v.packing], ["Cost per unit", cost], ["Price per unit (ex-GST)", pre], [`Total ×${v.qty}`, price * v.qty]]} />
    </Shell>
  );
}

export function NexRes() {
  const [v, b] = useFields({ ml: 180, perL: rate("resin"), parts: 6, hours: 4, machine: rate("resinMachine"), ipa: rate("ipa"), labour: rate("labour") * 0.8, margin: rate("resinMargin"), gst: rate("gst") });
  const plate = (v.ml / 1000) * v.perL + v.hours * v.machine + v.ipa + v.labour;
  const perPart = plate / Math.max(1, v.parts);
  const pre = perPart * (1 + v.margin / 100), price = pre * (1 + v.gst / 100);
  return (
    <Shell>
      <Card>
        <CardTitle>NexRes · Resin price per plate</CardTitle>
        <div class="grid sm:grid-cols-2 gap-4">
          <Field label="Resin per plate (ml)"><input {...b("ml")} /></Field>
          <Field label="Resin price (₹/L)"><input {...b("perL")} /></Field>
          <Field label="Parts per plate"><input {...b("parts")} /></Field>
          <Field label="Plate time (h)"><input {...b("hours")} /></Field>
          <Field label="Machine rate (₹/h)"><input {...b("machine")} /></Field>
          <Field label="IPA & gloves (₹)"><input {...b("ipa")} /></Field>
          <Field label="Labour & curing (₹)"><input {...b("labour")} /></Field>
          <Field label="Margin (%)"><input {...b("margin")} /></Field>
          <Field label="GST (%)"><input {...b("gst")} /></Field>
        </div>
      </Card>
      <Result price={price} rows={[["Plate cost", plate], ["Cost per part", perPart], ["Price per part (ex-GST)", pre]]} />
    </Shell>
  );
}

export function RatesEditor() {
  const groups = [...new Set(RATE_DEFS.map((r) => r.group))];
  return (
    <>
      <p class="text-xs text-c3">Every price and rate used by the calculators, consumption costs, quotes and alerts. Changes apply immediately and are remembered on this device.</p>
      {groups.map((g) => (
        <Card key={g}>
          <CardTitle>{g}</CardTitle>
          <div class="grid gap-3 grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
            {RATE_DEFS.filter((r) => r.group === g).map((r) => (
              <Field key={r.key} label={`${r.label} (${r.unit})`}>
                <input class={inputCls} type="number" inputMode="decimal" value={ratesSig.value[r.key]} onInput={(e) => setRate(r.key, Number((e.target as HTMLInputElement).value) || 0)} />
              </Field>
            ))}
          </div>
        </Card>
      ))}
      <div><Button variant="outline" onClick={resetRates}>Reset to defaults</Button></div>
    </>
  );
}

export function PricingSettings() {
  return <Page title="Calculator" sub="Rates every quote uses — same list as Settings → Rates & prices" tabs={CALC_TABS}><RatesEditor /></Page>;
}

/* ---- Geometry estimation: STL (binary/ASCII) volume via signed tetrahedra; OBJ via faces. STEP needs the server-side kernel. */
const DENS: Record<string, number> = { PLA: 1.24, PETG: 1.27, TPU: 1.21, ABS: 1.04 };
function volumeOf(buf: ArrayBuffer, name: string): number {
  const tri = (a: number[], b: number[], c: number[]) => (a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6;
  let vol = 0;
  if (/\.obj$/i.test(name)) {
    const t = new TextDecoder().decode(buf); const vs: number[][] = [];
    for (const l of t.split("\n")) { const p = l.trim().split(/\s+/); if (p[0] === "v") vs.push(p.slice(1, 4).map(Number)); if (p[0] === "f") { const ix = p.slice(1).map((x) => vs[Number(x.split("/")[0]) - 1]); for (let i = 1; i < ix.length - 1; i++) vol += tri(ix[0], ix[i], ix[i + 1]); } }
    return Math.abs(vol);
  }
  const dv = new DataView(buf); const n = buf.byteLength > 84 ? dv.getUint32(80, true) : 0;
  if (n && 84 + n * 50 === buf.byteLength) {
    for (let i = 0; i < n; i++) { const o = 84 + i * 50 + 12; const p = (k: number) => [0, 1, 2].map((j) => dv.getFloat32(o + k * 12 + j * 4, true)); vol += tri(p(0), p(1), p(2)); }
  } else {
    const vs = [...new TextDecoder().decode(buf).matchAll(/vertex\s+(\S+)\s+(\S+)\s+(\S+)/g)].map((m) => [Number(m[1]), Number(m[2]), Number(m[3])]);
    for (let i = 0; i + 2 < vs.length; i += 3) vol += tri(vs[i], vs[i + 1], vs[i + 2]);
  }
  return Math.abs(vol);
}
type Part = { name: string; mm3: number; qty: number; infill: number; walls: number; mat: string; on: boolean; unit: number };
function ModelUpload({ onTotal }: { onTotal: (g: number, h: number) => void }) {
  const [parts, setParts] = useState<Part[]>([]);
  const [err, setErr] = useState("");
  const est = (p: Part) => { const cm3 = (p.mm3 * p.unit ** 3) / 1000; const solid = Math.min(1, 0.18 + p.walls * 0.07 + (p.infill / 100) * 0.6); const g = cm3 * solid * (DENS[p.mat] ?? 1.24) * rate("efficiency"); return { g: g * p.qty, h: (g / 11) * p.qty }; };
  const add = (fl: FileList | null) => [...(fl ?? [])].forEach((f) => { if (/\.(step|stp)$/i.test(f.name)) { setErr(`${f.name}: STEP is measured by the server-side kernel — export STL for now.`); return; }
    f.arrayBuffer().then((b) => { const mm3 = volumeOf(b, f.name); setParts((ps) => { const n = [...ps, { name: f.name, mm3, qty: 1, infill: 15, walls: 2, mat: "PLA", on: true, unit: 1 }]; return n; }); }); });
  const tot = parts.filter((p) => p.on).map(est).reduce((a, b) => ({ g: a.g + b.g, h: a.h + b.h }), { g: 0, h: 0 });
  const set = (i: number, p: Partial<Part>) => setParts(parts.map((x, k) => (k === i ? { ...x, ...p } : x)));
  const c = "h-7 px-1.5 rounded-md border border-c3 bg-c0 text-xs";
  return (
    <div class="mb-3">
      <label class="block rounded-xl border-2 border-dashed border-c2 p-3 text-center text-sm text-c3 cursor-pointer">Drop or choose STL / OBJ<input type="file" accept=".stl,.obj,.step,.stp" multiple class="sr-only" onChange={(e) => add((e.target as HTMLInputElement).files)} /></label>
      {err && <p class="text-xs mt-1">{err}</p>}
      <ul class="text-xs mt-2 flex flex-col gap-1">
        {parts.map((p, i) => { const e = est(p); return (
          <li key={i} class="flex flex-wrap items-center gap-2 border-t border-c1 pt-1">
            <input type="checkbox" checked={p.on} onChange={() => set(i, { on: !p.on })} aria-label="Include" /><b class="min-w-0 truncate max-w-[10rem]">{p.name}</b>
            <select class={c} value={p.unit} onChange={(ev) => set(i, { unit: Number((ev.target as HTMLSelectElement).value) })}><option value={1}>mm</option><option value={10}>cm</option><option value={25.4}>in</option></select>
            <select class={c} value={p.mat} onChange={(ev) => set(i, { mat: (ev.target as HTMLSelectElement).value })}>{Object.keys(DENS).map((m) => <option key={m}>{m}</option>)}</select>
            ×<input class={`${c} w-12`} type="number" value={p.qty} onInput={(ev) => set(i, { qty: Number((ev.target as HTMLInputElement).value) || 1 })} />
            <input class={`${c} w-10`} type="number" value={p.walls} aria-label="Walls" onInput={(ev) => set(i, { walls: Number((ev.target as HTMLInputElement).value) || 0 })} />walls
            <input class={`${c} w-12`} type="number" value={p.infill} aria-label="Infill %" onInput={(ev) => set(i, { infill: Number((ev.target as HTMLInputElement).value) || 0 })} />%
            <span class="ml-auto num">{e.g.toFixed(1)} g · {e.h.toFixed(1)} h</span>
          </li>); })}
      </ul>
      {parts.length > 0 && <div class="flex items-center justify-between mt-2 text-sm"><span>Total {parts.filter((p) => p.on).length} files · <b>{tot.g.toFixed(1)} g · {tot.h.toFixed(1)} h</b></span><Button variant="outline" onClick={() => onTotal(tot.g, tot.h)}>Use in price</Button></div>}
      <p class="text-[11px] text-c3 mt-1">Estimate = volume × fill factor (walls + infill) × density × efficiency. PLA calibrated; others approximate.</p>
    </div>
  );
}
