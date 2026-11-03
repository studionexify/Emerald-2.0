/** Every price and rate in the app — editable in Settings → Rates & prices. Persisted per device until the backend exists. */

export type RateDef = { key: string; label: string; unit: string; group: string; value: number };
export const RATE_DEFS: RateDef[] = [
  { group: "Materials", key: "pla", label: "PLA", unit: "₹/kg", value: 1250 },
  { group: "Materials", key: "petg", label: "PETG", unit: "₹/kg", value: 1350 },
  { group: "Materials", key: "tpu", label: "TPU", unit: "₹/kg", value: 2200 },
  { group: "Materials", key: "abs", label: "ABS", unit: "₹/kg", value: 1400 },
  { group: "Materials", key: "resin", label: "Resin", unit: "₹/L", value: 2400 },
  { group: "Materials", key: "efficiency", label: "Material efficiency", unit: "×", value: 1.25 },
  { group: "Machine & labour", key: "machine", label: "FDM machine rate", unit: "₹/h", value: 25 },
  { group: "Machine & labour", key: "resinMachine", label: "Resin machine rate", unit: "₹/h", value: 40 },
  { group: "Machine & labour", key: "power", label: "Electricity", unit: "₹/h", value: 8 },
  { group: "Machine & labour", key: "labour", label: "Labour", unit: "₹/h", value: 100 },
  { group: "Machine & labour", key: "ipa", label: "IPA & gloves per plate", unit: "₹", value: 25 },
  { group: "Pricing", key: "margin", label: "Default margin FDM", unit: "%", value: 60 },
  { group: "Pricing", key: "resinMargin", label: "Default margin resin", unit: "%", value: 70 },
  { group: "Pricing", key: "gst", label: "GST", unit: "%", value: 18 },
  { group: "Pricing", key: "bulk1", label: "Bulk discount ≥1 spool", unit: "%", value: 5 },
  { group: "Pricing", key: "bulk5", label: "Bulk discount ≥5 spools", unit: "%", value: 12 },
  { group: "Pricing", key: "packingDefault", label: "Default packaging per order", unit: "₹", value: 30 },
  { group: "Shipping & terms", key: "freight", label: "Freight default per parcel", unit: "₹", value: 99 },
  { group: "Shipping & terms", key: "terms", label: "Payment terms", unit: "days", value: 30 },
  { group: "Shipping & terms", key: "quoteValid", label: "Quotation valid for", unit: "days", value: 7 },
  { group: "Alerts", key: "failRate", label: "Floor failure-rate alert", unit: "%", value: 15 },
  { group: "Alerts", key: "reorderFilament", label: "Filament reorder point", unit: "g", value: 1000 },
  { group: "Alerts", key: "stuckDays", label: "Order stuck alert after", unit: "days", value: 3 },
];
import { persisted } from "./store";
const base = () => Object.fromEntries(RATE_DEFS.map((r) => [r.key, r.value]));
export const ratesSig = persisted<Record<string, number>>("rates", base());
if (Object.keys(ratesSig.value).length < RATE_DEFS.length) ratesSig.value = { ...base(), ...ratesSig.value };
export const rate = (k: string) => ratesSig.value[k] ?? 0;
export function setRate(k: string, v: number) {
  ratesSig.value = { ...ratesSig.value, [k]: v };
}
export function resetRates() { ratesSig.value = base(); }
