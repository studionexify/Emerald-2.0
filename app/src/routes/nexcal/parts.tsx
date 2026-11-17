/** Pieces of the Nexcal calculator that are plain lists and forms: bill-of-materials rows and the advanced settings. */
import { ask, Button, Field, Icon, inputCls, SubTabs } from "../../ui";
import { inr } from "../../data";
import { nexcalSig, NEXCAL_DEFAULTS, type NexcalSettings } from "../../data/pricing";
import { computePrintTimeRate, type NexcalLineRow } from "../../data/nexcal/engine";

let seq = 1;
export const rid = () => seq++;
export const matRows = (): NexcalLineRow[] => [{ id: rid(), name: "", qty: 1, unitCost: 0 }, { id: rid(), name: "", qty: 1, unitCost: 0 }];
export const packRows = (): NexcalLineRow[] => [{ id: rid(), name: "Packaging", qty: 1, unitCost: 0 }, { id: rid(), name: "Postage / Shipping", qty: 1, unitCost: 0 }];
export const num = (e: Event) => Number((e.target as HTMLInputElement).value) || 0;
export const sm = `${inputCls} !h-7 !px-2 text-[12px] num`;
export const dec = (n: number) => inr(Math.round(n * 100) / 100);

export function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return <div class={`flex justify-between gap-3 py-1 text-[13px] ${strong ? "font-semibold border-t border-line mt-1 pt-2" : ""}`}><span class={strong ? "" : "text-c3"}>{label}</span><span class="num">{value}</span></div>;
}

/* ---------------------------------------------------------------- line items */
export function Lines({ title, rows, locked, total, onChange, add }: { title: string; rows: NexcalLineRow[]; locked?: [string, number]; total: number; onChange: (r: NexcalLineRow[]) => void; add: string }) {
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
export function Advanced() {
  const s = nexcalSig.value, pr = computePrintTimeRate(s);
  return (
    <div class="grid gap-6 pt-3">
      <div class="flex flex-col gap-5">
        <div><div class="t-section mb-2">General rates</div><div class="grid grid-cols-2 gap-3">
          <SetNum label="Material efficiency factor" k="materialEfficiencyFactor" /><SetNum label="Labour rate (₹/hr)" k="labourHourlyRate" />
          <SetNum label="GST (%)" k="gstPercent" /><SetNum label="Default margin (%)" k="defaultMarginPercent" /><SetNum label="Margin floor (%)" k="marginFloorPct" />
        </div></div>
        <div><div class="t-section mb-1">Model estimation</div><div class="grid grid-cols-2 gap-3">
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
        <Button class="mt-4" variant="outline" onClick={async () => { if (await ask("Reset all Nexcal settings to the Excel defaults?", { ok: "Reset", danger: true })) nexcalSig.value = { ...NEXCAL_DEFAULTS }; }}>Reset to Excel defaults</Button>
      </div>
    </div>
  );
}

