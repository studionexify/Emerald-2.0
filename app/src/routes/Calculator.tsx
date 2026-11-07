import { useState } from "preact/hooks";
import { CALC_TABS } from "../nav";
import { Button, Card, CardTitle, Field, Icon, inputCls, isPhone, KV, Page, Sheet, SubTabs } from "../ui";
import { navigate } from "../router";
import { Reveal } from "../ui/disclose";
import { createOrder, type Delivery, inr, spoolsSig, rate, RATE_DEFS, ratesSig, resetRates, setRate } from "../data";

type Fields = Record<string, number>;
function useFields(init: Fields) {
  const [v, setV] = useState(init);
  const bind = (k: string, im: "decimal" | "numeric" = "decimal") => ({ value: v[k], type: "number" as const, inputMode: im, step: "any", enterKeyHint: "next" as const, class: inputCls,
    onInput: (e: Event) => setV({ ...v, [k]: Number((e.target as HTMLInputElement).value) || 0 }) });
  return [v, bind, setV] as const;
}

/** Unit-suffixed compact input: label above, unit inside the field. */
function U({ label, unit, b }: { label: string; unit?: string; b: ReturnType<ReturnType<typeof useFields>[1]> }) {
  return (
    <Field label={label}>
      <span class="relative block"><input {...b} class={`${inputCls} num ${unit ? "pr-10" : ""}`} />{unit && <span class="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 t-meta">{unit}</span>}</span>
    </Field>
  );
}

type Quote = { customer: string; item: string; due: string; delivery: Delivery; supports: boolean; material?: string; colour?: string };
const blankQ = (): Quote => ({ customer: "", item: "", due: "", delivery: { method: "pickup" }, supports: false });
type Rows = [string, number][];

/** Create the quotation order (shared by desktop card and phone review sheet). */
function useQuote(price: number, qty: number) {
  return (q: Quote) => {
    createOrder({ type: "client", customer: q.customer.trim() || "New client", item: q.item.trim() || "Calculated item", qty, price: Math.round(price), medium: "Instagram", due: q.due,
      delivery: q.delivery.method === "courier" ? q.delivery : { method: q.delivery.method }, supports: q.supports, material: q.material, colour: q.colour });
    navigate("/work/orders");
  };
}

function Breakdown({ rows }: { rows: Rows }) {
  return <div>{rows.map(([l, n], i) => <KV key={l} label={l} value={inr(n)} strong={i === rows.length - 1} />)}</div>;
}

/** Desktop/tablet: live result card beside the inputs. */
function Result({ rows, price, q, create }: { rows: Rows; price: number; q: Quote; create: (q: Quote) => void }) {
  return (
    <Card class="hidden md:block lg:sticky lg:top-0 self-start">
      <div class="t-section">Quotation</div>
      <div class="t-meta mt-2">Suggested price incl. GST</div>
      <div class="num text-[28px] font-semibold leading-tight tracking-tight mb-1">{inr(price)}</div>
      <div class="border-y border-line"><Reveal label="Cost breakdown"><Breakdown rows={rows} /></Reveal></div>
      <Button class="mt-3 w-full" onClick={() => create(q)}>Use in quotation</Button>
    </Card>
  );
}

/** Phone: sticky total + Review & send → bottom sheet with the breakdown. */
function PhoneTotal({ rows, price, q, create }: { rows: Rows; price: number; q: Quote; create: (q: Quote) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <div class="flex flex-col justify-center min-w-0 !flex-none pr-1">
        <span class="t-meta leading-none">Quote incl. GST</span>
        <span class="num text-[20px] font-semibold leading-tight" aria-live="polite">{inr(price)}</span>
      </div>
      <Button onClick={() => setOpen(true)}>Review & send</Button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Review quotation"
        footer={<Button onClick={() => { setOpen(false); create(q); }}>Create quotation</Button>}>
        <div class="text-[15px] font-semibold">{q.customer || "New client"} <span class="text-c2 font-normal">· {q.item || "Calculated item"}</span></div>
        <div class="num text-[28px] font-semibold tracking-tight my-2">{inr(price)}</div>
        <div class="border-t border-line"><Reveal label="Cost breakdown"><Breakdown rows={rows} /></Reveal></div>
      </Sheet>
    </>
  );
}

/** Steps: open sections on tablet/desktop; one-at-a-time accordion on phone. */
function Steps({ steps }: { steps: [string, string, preact.ComponentChildren][] }) {
  const [cur, setCur] = useState(0);
  const phone = isPhone.value;
  return (
    <div class="flex flex-col">
      {steps.map(([title, meta, body], i) => {
        const open = !phone || cur === i;
        return (
          <section key={title} class={i ? "border-t border-line mt-3 pt-3" : ""}>
            <button type="button" onClick={() => phone && setCur(open ? -1 : i)} aria-expanded={open} disabled={!phone}
              class="w-full flex items-center gap-3 text-left disabled:cursor-default cursor-pointer min-h-11 md:min-h-0 md:mb-2">
              <span class={`w-6 h-6 shrink-0 rounded-full text-[12px] font-semibold flex items-center justify-center ${open ? "bg-c4 text-c0" : "bg-c1 text-c3"}`}>{i + 1}</span>
              <span class="flex-1 min-w-0"><span class="block text-[15px] md:text-[13px] font-semibold">{title}</span>{phone && !open && <span class="block t-meta truncate">{meta}</span>}</span>
              {phone && <span class={`chev text-c2 transition-transform ${open ? "rotate-90" : ""}`}><Icon name="right" size={14} /></span>}
            </button>
            {open && <div class="pt-2 md:pt-0">{body}{phone && i < steps.length - 1 && <Button variant="outline" class="mt-3 w-full" onClick={() => setCur(i + 1)}>Next</Button>}</div>}
          </section>
        );
      })}
    </div>
  );
}

function ClientFields({ q, setQ }: { q: Quote; setQ: (q: Quote) => void }) {
  return (
    <div class="grid grid-cols-1 md:grid-cols-2 gap-x-3 gap-y-2.5 mb-2.5">
      <Field label="Client"><input class={inputCls} autoComplete="organization" enterKeyHint="next" value={q.customer} placeholder="New client" onInput={(e) => setQ({ ...q, customer: (e.target as HTMLInputElement).value })} /></Field>
      <Field label="Item"><input class={inputCls} enterKeyHint="next" value={q.item} placeholder="Calculated item" onInput={(e) => setQ({ ...q, item: (e.target as HTMLInputElement).value })} /></Field>
      <Field label="Deliver by"><input class={inputCls} type="date" value={q.due} onInput={(e) => setQ({ ...q, due: (e.target as HTMLInputElement).value })} /></Field>
    </div>
  );
}

/** Material picker: real spools in stock set the ₹/kg. */
function SpoolPick({ onPick }: { onPick: (costKg: number, material?: string, colour?: string) => void }) {
  const spools = spoolsSig.value.filter((s) => s.active !== false && s.grams > 0);
  if (!spools.length) return null;
  return (
    <Field label="Material from stock">
      <select class={inputCls} onChange={(e) => { const s = spools.find((x) => x.id === (e.target as HTMLSelectElement).value); if (s) onPick(s.costKg ?? rate("pla"), s.material, s.colour); }}>
        <option value="">Custom price</option>
        {spools.map((s) => <option key={s.id} value={s.id}>{s.material} {s.colour} · {s.spoolNo} · {s.grams} g</option>)}
      </select>
    </Field>
  );
}

/** Courier → address fields appear; pickup/hand delivery need none. */
function DeliveryFields({ q, setQ }: { q: Quote; setQ: (q: Quote) => void }) {
  const d = q.delivery, set = (p: Partial<Delivery>) => setQ({ ...q, delivery: { ...d, ...p } });
  return (
    <div class="flex flex-col gap-2.5 mb-3">
      <Field label="Delivery">
        <select class={inputCls} value={d.method} onChange={(e) => set({ method: (e.target as HTMLSelectElement).value as Delivery["method"] })}>
          <option value="pickup">Studio pickup</option><option value="hand">Hand delivery</option><option value="courier">Courier / shipping</option>
        </select>
      </Field>
      {d.method === "courier" && (
        <div class="grid grid-cols-2 gap-x-3 gap-y-2.5">
          <div class="col-span-2"><Field label="Ship to"><textarea class={`${inputCls} h-16 py-2`} autoComplete="street-address" value={d.address ?? ""} onInput={(e) => set({ address: (e.target as HTMLTextAreaElement).value })} /></Field></div>
          <Field label="PIN code"><input class={inputCls} inputMode="numeric" autoComplete="postal-code" maxLength={6} value={d.pincode ?? ""} onInput={(e) => set({ pincode: (e.target as HTMLInputElement).value })} /></Field>
          <Field label="Freight charged (₹)"><input class={`${inputCls} num`} type="number" inputMode="decimal" value={d.freight ?? 0} onInput={(e) => set({ freight: Number((e.target as HTMLInputElement).value) || 0 })} /></Field>
        </div>
      )}
    </div>
  );
}

/** Machine/power/GST change rarely: kept off the form, edited in a sheet. */
function RatesSheet({ children, summary }: { children: preact.ComponentChildren; summary: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} class="w-full min-h-11 md:min-h-8 flex items-center justify-between gap-2 text-[13px] cursor-pointer">
        <span class="font-semibold">Adjust machine rates</span><span class="t-meta num whitespace-nowrap inline-flex items-center gap-1">{summary}<Icon name="right" size={11} /></span>
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Machine rates · this quote" footer={<Button onClick={() => setOpen(false)}>Done</Button>}>
        <div class="grid grid-cols-2 gap-x-3 gap-y-2.5">{children}</div>
        <p class="t-meta mt-3">Changes here apply to this quote only. <a class="underline" href="/calculator/settings">Edit studio defaults</a></p>
      </Sheet>
    </>
  );
}

function Shell({ children, bar }: { children: preact.ComponentChildren; bar: preact.ComponentChildren }) {
  return (
    <Page title="Calculator" sub="Price a job before you quote it" tabs={CALC_TABS} actions={isPhone.value ? bar : undefined}>
      <div class="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px] items-start">{children}</div>
    </Page>
  );
}

export function Nexcal() {
  const [mode, setMode] = useState<"direct" | "upload">("direct");
  const [q, setQ] = useState<Quote>(blankQ);
  const [v, b, setV] = useFields({ grams: 120, perKg: rate("pla"), hours: 5, machine: rate("machine"), power: rate("power"), labour: rate("labour") / 2, packing: rate("packingDefault"), margin: rate("margin"), gst: rate("gst"), qty: 1, support: 15 });
  const g = v.grams * (q.supports ? 1 + v.support / 100 : 1);
  const material = (g / 1000) * v.perKg, machine = v.hours * (v.machine + v.power);
  const cost = material + machine + v.labour + v.packing;
  const pre = cost * (1 + v.margin / 100), price = pre * (1 + v.gst / 100);
  const freight = q.delivery.method === "courier" ? q.delivery.freight ?? 0 : 0;
  const total = price * v.qty + freight;
  const rows: Rows = [[q.supports ? `Material (incl. ${v.support}% supports)` : "Material", material], ["Machine + power", machine], ["Labour & finishing", v.labour], ["Packaging", v.packing], ["Cost per unit", cost], [`Margin ${v.margin}%`, pre - cost], [`GST ${v.gst}%`, price - pre], ...(freight ? [["Freight", freight] as [string, number]] : []), [`Total ×${v.qty}`, total]];
  const create = useQuote(price, v.qty);
  return (
    <Shell bar={<PhoneTotal rows={rows} price={total} q={q} create={create} />}>
      <Card>
        <CardTitle>Nexcal · FDM</CardTitle>
        <Steps steps={[
          ["Client & model", `${q.customer || "New client"} · ${v.grams} g · ${v.hours} h`, <>
            <ClientFields q={q} setQ={setQ} />
            <div class="mb-3"><SubTabs value={mode} onChange={setMode} items={[["direct", "Enter weight & time"], ["upload", "Upload STL / OBJ"]]} /></div>
            {mode === "upload" && <ModelUpload onTotal={(gr, h) => setV({ ...v, grams: Math.round(gr), hours: Math.round(h * 10) / 10 })} />}
            <div class="grid grid-cols-3 gap-x-3 gap-y-2.5">
              <U label="Filament" unit="g" b={b("grams")} />
              <U label="Print time" unit="h" b={b("hours")} />
              <U label="Quantity" unit="pcs" b={b("qty", "numeric")} />
            </div>
          </>],
          ["Material", `${q.material ? `${q.material} ${q.colour}` : `₹${v.perKg}/kg`}${q.supports ? " · supports" : ""}`, <>
            <div class="grid grid-cols-2 gap-x-3 gap-y-2.5">
              <div class="col-span-2"><SpoolPick onPick={(c, m, col) => { setV({ ...v, perKg: c }); setQ({ ...q, material: m, colour: col }); }} /></div>
              <U label="Filament price" unit="₹/kg" b={b("perKg")} />
            </div>
            <label class="mt-3 flex items-center gap-2 min-h-11 md:min-h-8 text-[13px] font-semibold cursor-pointer">
              <input type="checkbox" class="w-4 h-4" checked={q.supports} onChange={() => setQ({ ...q, supports: !q.supports })} /> Generate supports
            </label>
            {q.supports && <div class="grid grid-cols-2 gap-x-3"><U label="Support material" unit="% of part" b={b("support")} /></div>}
          </>],
          ["Delivery & price", `${({ pickup: "Pickup", hand: "Hand delivery", courier: "Courier" })[q.delivery.method]} · ${v.margin}% margin`, <>
            <DeliveryFields q={q} setQ={setQ} />
            <div class="grid grid-cols-3 gap-x-3 gap-y-2.5">
              <U label="Labour" unit="₹" b={b("labour")} />
              <U label="Packaging" unit="₹" b={b("packing")} />
              <U label="Margin" unit="%" b={b("margin")} />
            </div>
            <div class="mt-2 border-t border-line">
              <RatesSheet summary={`₹${v.machine + v.power}/h · GST ${v.gst}%`}>
                <U label="Machine depreciation" unit="₹/h" b={b("machine")} />
                <U label="Electricity" unit="₹/h" b={b("power")} />
                <U label="GST" unit="%" b={b("gst")} />
              </RatesSheet>
            </div>
          </>],
        ]} />
      </Card>
      <Result price={total} rows={rows} q={q} create={create} />
    </Shell>
  );
}

export function NexRes() {
  const [q, setQ] = useState<Quote>(blankQ);
  const [v, b] = useFields({ ml: 180, perL: rate("resin"), parts: 6, hours: 4, machine: rate("resinMachine"), ipa: rate("ipa"), labour: rate("labour") * 0.8, margin: rate("resinMargin"), gst: rate("gst") });
  const plate = (v.ml / 1000) * v.perL + v.hours * v.machine + v.ipa + v.labour;
  const perPart = plate / Math.max(1, v.parts);
  const pre = perPart * (1 + v.margin / 100), price = pre * (1 + v.gst / 100);
  const rows: Rows = [["Plate cost", plate], ["Cost per part", perPart], ["Price per part (ex-GST)", pre]];
  const create = useQuote(price, 1);
  return (
    <Shell bar={<PhoneTotal rows={rows} price={price} q={q} create={create} />}>
      <Card>
        <CardTitle>NexRes · Resin price per plate</CardTitle>
        <Steps steps={[
          ["Client & specs", `${q.customer || "New client"} · ${v.ml} ml`, <>
            <ClientFields q={q} setQ={setQ} />
            <div class="grid grid-cols-2 gap-x-3 gap-y-2.5">
              <U label="Resin per plate" unit="ml" b={b("ml")} />
              <U label="Resin price" unit="₹/L" b={b("perL")} />
            </div>
          </>],
          ["Print parameters", `${v.parts} parts · ${v.hours} h`, (
            <div class="grid grid-cols-2 gap-x-3 gap-y-2.5">
              <U label="Parts per plate" unit="pcs" b={b("parts", "numeric")} />
              <U label="Plate time" unit="h" b={b("hours")} />
              <U label="Machine depreciation" unit="₹/h" b={b("machine")} />
            </div>
          )],
          ["Pricing & commercials", `${v.margin}% margin · ${v.gst}% GST`, <>
            <div class="grid grid-cols-2 gap-x-3 gap-y-2.5">
              <U label="IPA & gloves" unit="₹" b={b("ipa")} />
              <U label="Labour & curing" unit="₹" b={b("labour")} />
              <U label="Margin" unit="%" b={b("margin")} />
              <U label="GST" unit="%" b={b("gst")} />
            </div>
            <div class="md:hidden mt-3"><Breakdown rows={rows} /></div>
          </>],
        ]} />
      </Card>
      <Result price={price} rows={rows} q={q} create={create} />
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
/** Presets drive the only slicing inputs the estimate uses: walls and infill. */
const PRESETS = { Draft: { walls: 2, infill: 10 }, Standard: { walls: 3, infill: 15 }, Fine: { walls: 4, infill: 25 } };
type Part = { name: string; mm3: number; qty: number; infill: number; walls: number; mat: string; on: boolean; unit: number };
function ModelUpload({ onTotal }: { onTotal: (g: number, h: number) => void }) {
  const [parts, setParts] = useState<Part[]>([]);
  const [err, setErr] = useState("");
  const [showAdv, setAdv] = useState(false);
  const est = (p: Part) => { const cm3 = (p.mm3 * p.unit ** 3) / 1000; const solid = Math.min(1, 0.18 + p.walls * 0.07 + (p.infill / 100) * 0.6); const g = cm3 * solid * (DENS[p.mat] ?? 1.24) * rate("efficiency"); return { g: g * p.qty, h: (g / 11) * p.qty }; };
  const add = (fl: FileList | null) => [...(fl ?? [])].forEach((f) => { if (/\.(step|stp)$/i.test(f.name)) { setErr(`${f.name}: STEP is measured by the server-side kernel — export STL for now.`); return; }
    f.arrayBuffer().then((b) => { const mm3 = volumeOf(b, f.name); setParts((ps) => { const n = [...ps, { name: f.name, mm3, qty: 1, ...PRESETS[preset], mat: "PLA", on: true, unit: 1 }]; return n; }); }); });
  const tot = parts.filter((p) => p.on).map(est).reduce((a, b) => ({ g: a.g + b.g, h: a.h + b.h }), { g: 0, h: 0 });
  const set = (i: number, p: Partial<Part>) => setParts(parts.map((x, k) => (k === i ? { ...x, ...p } : x)));
  const c = "h-7 px-1.5 rounded-md border border-c3 bg-c0 text-xs";
  const [preset, setPreset] = useState<keyof typeof PRESETS>("Standard");
  const pick = (k: keyof typeof PRESETS) => { setPreset(k); setParts(parts.map((x) => ({ ...x, ...PRESETS[k] }))); };
  const adv = (p: Part, i: number) => <>
    <select class={c} value={p.unit} aria-label="Units" onChange={(ev) => set(i, { unit: Number((ev.target as HTMLSelectElement).value) })}><option value={1}>mm</option><option value={10}>cm</option><option value={25.4}>in</option></select>
    <input class={`${c} w-10`} type="number" value={p.walls} aria-label="Walls" onInput={(ev) => set(i, { walls: Number((ev.target as HTMLInputElement).value) || 0 })} />walls
    <input class={`${c} w-12`} type="number" value={p.infill} aria-label="Infill %" onInput={(ev) => set(i, { infill: Number((ev.target as HTMLInputElement).value) || 0 })} />%
  </>;
  return (
    <div class="mb-3">
      <div class="flex flex-wrap items-center gap-2 mb-2"><span class="t-meta">Quality</span><SubTabs value={preset} onChange={pick} items={(Object.keys(PRESETS) as (keyof typeof PRESETS)[]).map((k) => [k, `${k} · ${PRESETS[k].walls}w ${PRESETS[k].infill}%`])} /></div>
      <label class="block rounded-xl border-2 border-dashed border-c2 p-3 text-center text-sm text-c3 cursor-pointer">Drop or choose STL / OBJ<input type="file" accept=".stl,.obj,.step,.stp" multiple class="sr-only" onChange={(e) => add((e.target as HTMLInputElement).files)} /></label>
      {err && <p class="text-xs mt-1">{err}</p>}
      <ul class="text-xs mt-2 flex flex-col gap-1">
        {parts.map((p, i) => { const e = est(p); return (
          <li key={i} class="flex flex-wrap items-center gap-2 border-t border-line pt-1">
            <input type="checkbox" checked={p.on} onChange={() => set(i, { on: !p.on })} aria-label="Include" /><b class="min-w-0 truncate max-w-[10rem]">{p.name}</b>
            <select class={c} value={p.mat} onChange={(ev) => set(i, { mat: (ev.target as HTMLSelectElement).value })}>{Object.keys(DENS).map((m) => <option key={m}>{m}</option>)}</select>
            ×<input class={`${c} w-12`} type="number" value={p.qty} onInput={(ev) => set(i, { qty: Number((ev.target as HTMLInputElement).value) || 1 })} />
            {showAdv && adv(p, i)}
            <span class="ml-auto num">{e.g.toFixed(1)} g · {e.h.toFixed(1)} h</span>
          </li>); })}
      </ul>
      {parts.length > 0 && <label class="mt-2 flex items-center gap-2 text-xs font-semibold cursor-pointer"><input type="checkbox" checked={showAdv} onChange={() => setAdv(!showAdv)} />Show advanced parameters (units, walls, infill per file)</label>}
      {parts.length > 0 && <div class="flex items-center justify-between mt-2 text-sm"><span>Total {parts.filter((p) => p.on).length} files · <b>{tot.g.toFixed(1)} g · {tot.h.toFixed(1)} h</b></span><Button variant="outline" onClick={() => onTotal(tot.g, tot.h)}>Use in price</Button></div>}
      <p class="text-[11px] text-c3 mt-1">Estimate = volume × fill factor (walls + infill) × density × efficiency. PLA calibrated; others approximate.</p>
    </div>
  );
}
