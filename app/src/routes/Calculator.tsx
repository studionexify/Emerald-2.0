import { useState } from "preact/hooks";
import { CALC_TABS } from "../nav";
import { Button, Card, CardTitle, Field, inputCls, Page, SubTabs } from "../ui";
import { inr, rate, RATE_DEFS, ratesSig, resetRates, setRate } from "../data";

type Fields = Record<string, number>;
function useFields(init: Fields) {
  const [v, setV] = useState(init);
  const bind = (k: string) => ({ value: v[k], type: "number" as const, inputMode: "decimal" as const, class: inputCls,
    onInput: (e: Event) => setV({ ...v, [k]: Number((e.target as HTMLInputElement).value) || 0 }) });
  return [v, bind] as const;
}

function Result({ rows, price }: { rows: [string, number][]; price: number }) {
  return (
    <Card dark class="self-start">
      <div class="text-sm opacity-80">Suggested price (incl. GST)</div>
      <div class="num text-3xl xl:text-5xl font-semibold mt-1 mb-2">{inr(price)}</div>
      <ul class="flex flex-col gap-2 text-sm">
        {rows.map(([l, n]) => <li key={l} class="flex justify-between border-t border-c3 pt-2"><span class="opacity-80">{l}</span><span class="num">{inr(n)}</span></li>)}
      </ul>
      <Button variant="outline" class="mt-3 w-full">Use in quotation</Button>
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
  const [v, b] = useFields({ grams: 120, perKg: rate("pla"), hours: 5, machine: rate("machine"), power: rate("power"), labour: rate("labour") / 2, packing: rate("packingDefault"), margin: rate("margin"), gst: rate("gst"), qty: 1 });
  const material = (v.grams / 1000) * v.perKg, machine = v.hours * (v.machine + v.power);
  const cost = material + machine + v.labour + v.packing;
  const pre = cost * (1 + v.margin / 100), price = pre * (1 + v.gst / 100);
  return (
    <Shell>
      <Card>
        <CardTitle>Nexcal · FDM</CardTitle>
        <div class="mb-3"><SubTabs value={mode} onChange={setMode} items={[["direct", "Direct input"], ["upload", "Upload models"]]} /></div>
        {mode === "upload" && <div class="rounded-xl border-2 border-dashed border-c2 p-4 text-center text-sm text-c3 mb-3">Drop STL / OBJ / STEP — weight and time are estimated per file (units, axis, qty, walls, infill, supports)</div>}
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
