import { useState } from "preact/hooks";
import { CALC_TABS } from "../nav";
import { Card, CardTitle, Field, inputCls, Page } from "../ui";
import { inr } from "../data";

type Fields = Record<string, number>;
function useFields(init: Fields) {
  const [v, setV] = useState(init);
  const bind = (k: string) => ({ value: v[k], type: "number" as const, inputMode: "decimal" as const, class: inputCls,
    onInput: (e: Event) => setV({ ...v, [k]: Number((e.target as HTMLInputElement).value) || 0 }) });
  return [v, bind] as const;
}

function Result({ rows, price }: { rows: [string, number][]; price: number }) {
  return (
    <Card dark class="lg:sticky lg:top-6 self-start">
      <div class="text-sm opacity-80">Suggested price (incl. GST)</div>
      <div class="num text-4xl xl:text-5xl font-semibold mt-1 mb-3">{inr(price)}</div>
      <ul class="flex flex-col gap-2 text-sm">
        {rows.map(([l, n]) => <li key={l} class="flex justify-between border-t border-c3 pt-2"><span class="opacity-80">{l}</span><span class="num">{inr(n)}</span></li>)}
      </ul>
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
  const [v, b] = useFields({ grams: 120, perKg: 1250, hours: 5, machine: 25, power: 8, labour: 50, packing: 30, margin: 60, gst: 18, qty: 1 });
  const material = (v.grams / 1000) * v.perKg, machine = v.hours * (v.machine + v.power);
  const cost = material + machine + v.labour + v.packing;
  const pre = cost * (1 + v.margin / 100), price = pre * (1 + v.gst / 100);
  return (
    <Shell>
      <Card>
        <CardTitle>Nexcal · FDM</CardTitle>
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
  const [v, b] = useFields({ ml: 180, perL: 2400, parts: 6, hours: 4, machine: 40, ipa: 25, labour: 80, margin: 70, gst: 18 });
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
