/** Pricing engines — pure maths (Emerald blueprint 10 + NexRes engine spec). Settings live in signals; functions take them as input. */
import { persisted } from "./store";

const r2 = (n: number) => Math.round(n * 100) / 100;
const div = (a: number, b: number) => (b ? a / b : 0);
/** Margin is a % of selling price, never markup on cost; clamped so the division can't blow up. */
export const priceFromMargin = (cost: number, marginPct: number) => cost / (1 - Math.min(94, Math.max(0, marginPct)) / 100);
export const marginPct = (price: number, cost: number) => (price > 0 ? r2(((price - cost) / price) * 100) : 0);

/* ------------------------------------------------------------- Nexcal · FDM */
/* The engine is Nexcal's own (data/nexcal/engine.ts, ported unchanged); this adds Emerald's margin floor. */
import { NEXCAL_DEFAULT_SETTINGS, getPrintTimeRateValue, type NexcalSettings as EngineSettings } from "./nexcal/engine";
export type NexcalSettings = EngineSettings & { marginFloorPct: number };
export const NEXCAL_DEFAULTS: NexcalSettings = { ...NEXCAL_DEFAULT_SETTINGS, marginFloorPct: 40 };
export const nexcalSig = persisted<NexcalSettings>("nexcalSettings", NEXCAL_DEFAULTS);
/* Older saved settings lack the model-estimation fields: fill them from the defaults. */
if (Object.keys(NEXCAL_DEFAULTS).some((k) => !(k in nexcalSig.value))) nexcalSig.value = { ...NEXCAL_DEFAULTS, ...nexcalSig.value };

/** ₹/h derived from the printer's own economics (auto) or typed (manual). */
export const machineRate = (s: NexcalSettings) => r2(getPrintTimeRateValue(s));

/* ------------------------------------------------------------- NexRes · resin */
export type NexResSettings = {
  machineCost: number; machineLife: number; lcdCost: number; lcdLife: number; fepCost: number; fepLife: number; printW: number; kwh: number;
  stationCost: number; stationLife: number; ipaPrice: number; ipaTank: number; ipaLife: number; cureW: number; cureHrs: number; misc: number;
  labourRate: number; setupMin: number; minPerMl: number; packOrder: number; packUnit: number; wastePct: number; failPct: number; overheadPct: number; gstPct: number;
  defaultMarginPercent: number; marginFloorPct: number; resins: { name: string; priceL: number }[]; discountTiers: { fromQty: number; discountPct: number }[];
};
export const NEXRES_DEFAULTS: NexResSettings = {
  machineCost: 45000, machineLife: 4000, lcdCost: 9000, lcdLife: 2000, fepCost: 800, fepLife: 30, printW: 120, kwh: 8,
  stationCost: 12000, stationLife: 1500, ipaPrice: 350, ipaTank: 3, ipaLife: 40, cureW: 60, cureHrs: 0.35, misc: 15,
  labourRate: 250, setupMin: 10, minPerMl: 0.35, packOrder: 40, packUnit: 5, wastePct: 5, failPct: 12, overheadPct: 8, gstPct: 18, defaultMarginPercent: 65, marginFloorPct: 40,
  resins: [{ name: "Standard", priceL: 2200 }, { name: "Water washable", priceL: 2500 }, { name: "ABS-like / tough", priceL: 3000 }, { name: "Transparent", priceL: 3200 }, { name: "High temp", priceL: 4500 }, { name: "Flexible", priceL: 5000 }],
  discountTiers: [{ fromQty: 24, discountPct: 3 }, { fromQty: 50, discountPct: 6 }, { fromQty: 100, discountPct: 10 }],
};
export const nexresSig = persisted<NexResSettings>("nexresSettings", NEXRES_DEFAULTS);

export type NexResIn = { ml: number; hrs: number; resinPriceL: number; unitsPerPlate: number; qty: number; marginPct: number };
export function nexresPlate(s: NexResSettings, i: Pick<NexResIn, "ml" | "hrs" | "resinPriceL">) {
  const labourMin = s.setupMin + i.ml * s.minPerMl;
  const lines = {
    resin: i.ml * (1 + s.wastePct / 100) * (i.resinPriceL / 1000), labour: labourMin * (s.labourRate / 60),
    printer: i.hrs * div(s.machineCost, s.machineLife), lcd: i.hrs * div(s.lcdCost, s.lcdLife), fep: div(s.fepCost, s.fepLife), station: div(s.stationCost, s.stationLife),
    ipa: div(s.ipaPrice * s.ipaTank, s.ipaLife), power: i.hrs * (s.printW / 1000) * s.kwh + s.cureHrs * (s.cureW / 1000) * s.kwh, misc: s.misc,
  };
  return { lines, plateDirect: Object.values(lines).reduce((a, b) => a + b, 0) };
}
export function nexres(s: NexResSettings, i: NexResIn) {
  const qty = Math.max(1, i.qty), upp = Math.max(1, i.unitsPerPlate);
  const { lines, plateDirect } = nexresPlate(s, i);
  const plates = Math.ceil(qty / upp);
  const packaging = s.packOrder + qty * s.packUnit;
  const orderDirect = plates * plateDirect + packaging;
  const failure = orderDirect * (s.failPct / 100), overhead = (orderDirect + failure) * (s.overheadPct / 100);
  const totalCost = orderDirect + failure + overhead;
  const listPrice = priceFromMargin(totalCost, i.marginPct);
  const discountPct = s.discountTiers.filter((t) => qty >= t.fromQty).reduce((m, t) => Math.max(m, t.discountPct), 0);
  const price = listPrice * (1 - discountPct / 100);
  const capacity = plates * upp;
  return { lines, plateDirect: r2(plateDirect), plates, packaging: r2(packaging), failure: r2(failure), overhead: r2(overhead), totalCost: r2(totalCost), costPerItem: r2(totalCost / qty),
    listPrice: r2(listPrice), discountPct, price: r2(price), pricePerItem: r2(price / qty), actualMargin: marginPct(price, totalCost), withGst: r2(price * (1 + s.gstPct / 100)),
    capacity, wastedSlots: capacity - qty, floor: s.marginFloorPct };
}
/** The quantity ladder: unitsPerPlate × [1,2,3,5,10,20,50]. */
export const ladder = (s: NexResSettings, i: NexResIn) => [...new Set([1, 2, 3, 5, 10, 20, 50].map((k) => k * Math.max(1, i.unitsPerPlate)))].map((qty) => ({ qty, ...nexres(s, { ...i, qty }) }));
