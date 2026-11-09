import { useState } from "preact/hooks";
import { CALC_TABS } from "../nav";
import { Button, Card, CardTitle, Field, Icon, inputCls, isPhone, KV, Page, Sheet } from "../ui";
import { navigate } from "../router";
import { Reveal } from "../ui/disclose";
import { createOrder, type Delivery, inr, spoolsSig, rate, RATE_DEFS, ratesSig, resetRates, setRate } from "../data";
import { ladder, machineRate, nexcalSig, nexres, nexresSig, NEXCAL_DEFAULTS, NEXRES_DEFAULTS, type NexcalSettings, type NexResSettings } from "../data/pricing";

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

export type Quote = { customer: string; item: string; due: string; delivery: Delivery; supports: boolean; material?: string; colour?: string };
export const blankQ = (): Quote => ({ customer: "", item: "", due: "", delivery: { method: "pickup" }, supports: false });
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

export function ClientFields({ q, setQ }: { q: Quote; setQ: (q: Quote) => void }) {
  return (
    <div class="grid grid-cols-1 md:grid-cols-2 gap-x-3 gap-y-2.5 mb-2.5">
      <Field label="Client"><input class={inputCls} autoComplete="organization" enterKeyHint="next" value={q.customer} placeholder="New client" onInput={(e) => setQ({ ...q, customer: (e.target as HTMLInputElement).value })} /></Field>
      <Field label="Item"><input class={inputCls} enterKeyHint="next" value={q.item} placeholder="Calculated item" onInput={(e) => setQ({ ...q, item: (e.target as HTMLInputElement).value })} /></Field>
      <Field label="Deliver by"><input class={inputCls} type="date" value={q.due} onInput={(e) => setQ({ ...q, due: (e.target as HTMLInputElement).value })} /></Field>
    </div>
  );
}

/** Material picker: real spools in stock set the ₹/kg. */
export function SpoolPick({ onPick }: { onPick: (costKg: number, material?: string, colour?: string) => void }) {
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
export function DeliveryFields({ q, setQ }: { q: Quote; setQ: (q: Quote) => void }) {
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

function Shell({ children, bar }: { children: preact.ComponentChildren; bar: preact.ComponentChildren }) {
  return (
    <Page title="Calculator" sub="Price a job before you quote it" tabs={CALC_TABS} actions={isPhone.value ? bar : undefined}>
      <div class="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px] items-start">{children}</div>
    </Page>
  );
}

export { Nexcal } from "./Nexcal";

export function NexRes() {
  const [q, setQ] = useState<Quote>(blankQ);
  const rs = nexresSig.value;
  const [v, b] = useFields({ ml: 150, perL: rs.resins[0]?.priceL ?? rate("resin"), upp: 12, hours: 6, qty: 12, margin: rs.defaultMarginPercent });
  const inp = { ml: v.ml, hrs: v.hours, resinPriceL: v.perL, unitsPerPlate: v.upp, qty: v.qty, marginPct: v.margin };
  const r = nexres(rs, inp);
  const atCap = r.wastedSlots > 0 ? nexres(rs, { ...inp, qty: r.capacity }) : null;
  const rows: Rows = [["Resin + waste", r.lines.resin * r.plates], ["Labour", r.lines.labour * r.plates], ["Machine, LCD, FEP, station, IPA, power, misc", (r.plateDirect - r.lines.resin - r.lines.labour) * r.plates],
    ["Packaging", r.packaging], [`Failure allowance ${rs.failPct}% (estimated)`, r.failure], [`Overhead ${rs.overheadPct}%`, r.overhead], ["Total cost", r.totalCost],
    ...(r.discountPct ? [[`Tier discount −${r.discountPct}%`, r.price - r.listPrice] as [string, number]] : []), [`Margin ${r.actualMargin}%${r.actualMargin < r.floor ? " ⚠ below floor" : ""}`, r.price - r.totalCost], [`Total ×${v.qty} incl. GST`, r.withGst]];
  const create = useQuote(r.withGst / Math.max(1, v.qty), v.qty);
  return (
    <Shell bar={<PhoneTotal rows={rows} price={r.withGst} q={q} create={create} />}>
      <Card>
        <CardTitle>NexRes · Resin</CardTitle>
        <Steps steps={[
          ["Client & plate", `${q.customer || "New client"} · ${v.ml} ml · ${v.hours} h`, <>
            <ClientFields q={q} setQ={setQ} />
            <div class="grid grid-cols-2 gap-x-3 gap-y-2.5">
              <U label="Resin per plate" unit="ml" b={b("ml")} />
              <U label="Plate print time" unit="h" b={b("hours")} />
              <Field label="Resin"><select class={inputCls} onChange={(e) => b("perL").onInput({ target: { value: (e.target as HTMLSelectElement).value } } as any)}>{rs.resins.map((x) => <option key={x.name} value={x.priceL} selected={x.priceL === v.perL}>{x.name} · ₹{x.priceL}/L</option>)}</select></Field>
              <U label="Resin price" unit="₹/L" b={b("perL")} />
            </div>
          </>],
          ["Quantity", `${v.qty} pcs · ${v.upp}/plate · ${r.plates} plate${r.plates > 1 ? "s" : ""}`, <>
            <div class="grid grid-cols-3 gap-x-3 gap-y-2.5">
              <U label="Units per plate" unit="pcs" b={b("upp", "numeric")} />
              <U label="Quantity" unit="pcs" b={b("qty", "numeric")} />
              <U label="Margin (of price)" unit="%" b={b("margin")} />
            </div>
            {atCap && <p class="mt-2 text-xs rounded-xl bg-c1 p-2"><b>{r.wastedSlots} empty plate slot{r.wastedSlots > 1 ? "s" : ""}.</b> At {r.capacity} pcs the price per item drops from {inr(r.pricePerItem)} to {inr(atCap.pricePerItem)} — free, not a discount.</p>}
          </>],
          ["Quantity ladder", `cost/item ${inr(r.costPerItem)} · price/item ${inr(r.pricePerItem)}`, (
            <table class="w-full text-xs num"><thead><tr class="text-left t-meta"><th>Qty</th><th class="text-right">Cost/item</th><th class="text-right">Price/item</th><th class="text-right">Margin</th></tr></thead>
              <tbody>{ladder(rs, inp).map((l) => <tr key={l.qty}><td>{l.qty}</td><td class="text-right">{inr(l.costPerItem)}</td><td class="text-right">{inr(l.pricePerItem)}</td><td class="text-right">{l.actualMargin}%</td></tr>)}</tbody></table>
          )],
        ]} />
        <p class="t-meta mt-2">Failure {rs.failPct}% and finishing {rs.minPerMl} min/ml are estimates, not measurements — edit in Pricing settings.</p>
      </Card>
      <Result price={r.withGst} rows={rows} q={q} create={create} />
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

function NumGrid<T extends Record<string, any>>({ sig, defaults, title }: { sig: { value: T }; defaults: T; title: string }) {
  const keys = Object.keys(defaults).filter((k) => typeof defaults[k] === "number");
  return (
    <Card>
      <CardTitle>{title}</CardTitle>
      <div class="grid gap-3 grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
        {keys.map((k) => <Field key={k} label={k.replace(/([A-Z])/g, " $1").toLowerCase()}><input class={inputCls} type="number" inputMode="decimal" value={sig.value[k] ?? defaults[k]} onInput={(e) => (sig.value = { ...sig.value, [k]: Number((e.target as HTMLInputElement).value) || 0 })} /></Field>)}
      </div>
      <Button class="mt-3" variant="outline" onClick={() => (sig.value = defaults)}>Reset {title}</Button>
    </Card>
  );
}
export function PricingSettings() {
  const ns = nexcalSig.value;
  return (
    <Page title="Calculator" sub="Engine settings, then the rates every quote and consumption cost uses" tabs={CALC_TABS}>
      <label class="flex items-center gap-2 text-sm"><input type="checkbox" checked={ns.printTimeRateMode === "manual"} onChange={() => (nexcalSig.value = { ...ns, printTimeRateMode: ns.printTimeRateMode === "manual" ? "auto" : "manual" })} /> Type the FDM machine rate by hand (otherwise derived: ₹{machineRate(ns)}/h)</label>
      <NumGrid<NexcalSettings> sig={nexcalSig} defaults={NEXCAL_DEFAULTS} title="Nexcal · FDM" />
      <NumGrid<NexResSettings> sig={nexresSig} defaults={NEXRES_DEFAULTS} title="NexRes · Resin" />
      <RatesEditor />
    </Page>
  );
}
