/**
 * Nexcal — Studio Nexify's cost-plus / bulk-tier pricing engine.
 *
 * Ported line-for-line from the standalone Nexcal calculator
 * (`Nexcal - Price Calculator/assets/app.js`). The source file is untouched;
 * this is a copy of its logic, not a link to it. The geometry/file-upload
 * estimator's own math lives in `nexcal-geometry.ts` / `nexcal-estimator.ts`
 * / `nexcal-thumbnail.ts` — this file holds the direct-input calculator plus
 * the settings and upload-aggregation glue shared with upload mode.
 *
 * Pure and storage-agnostic, same as everything else in `lib/domain`: no
 * React, no DOM, no localStorage. The page component owns persistence.
 */

import type { EstimatorParams } from "./estimator";
import type { MeshAnalysis, UpAxis } from "./geometry";

// ---------------------------------------------------------------------------
// Settings — the "Advanced Settings" footer in the original app
// ---------------------------------------------------------------------------

export type PrintTimeRateMode = "auto" | "manual";

export interface BulkTier {
  /** Minimum filament spools consumed to land in this tier. */
  min: number;
}

export interface NexcalSettings {
  /** Multiplier on filament weight for purge/waste/failed prints. */
  materialEfficiencyFactor: number;
  /** ₹/hr — post-processing, print management, fulfilment. */
  labourHourlyRate: number;
  gstPercent: number;
  /** Seeds the margin field when a fresh calculation starts. */
  defaultMarginPercent: number;

  printTimeRateMode: PrintTimeRateMode;
  printTimeRateManual: number;

  printerCost: number;
  additionalUpfrontCost: number;
  annualMaintenance: number;
  estimatedLifeYrs: number;
  estimatedUptimePct: number;
  powerConsumptionW: number;
  electricityCost: number;
  costBufferFactor: number;

  /** Bulk tiers are keyed by spools consumed, auto-mapped to a part-qty range. */
  spoolWeightGrams: number;
  bulkTiers: BulkTier[];

  // Model estimation (geometry-based weight/time from uploaded 3D files).
  // wallLoops/infillPercent/supportEnabled below are only used to seed the
  // per-part defaults for newly uploaded files — each part can override
  // them individually afterwards (see UploadedPart).
  nozzleDiameter: number;
  layerHeight: number;
  wallLoops: number;
  infillPercent: number;
  outerWallSpeed: number;
  innerWallSpeed: number;
  infillSpeed: number;
  firstLayerSpeed: number;
  speedRealizationFactor: number;
  perLayerOverheadSeconds: number;
  firstLayerFixedOverheadSeconds: number;
  supportEnabled: boolean;
}

/** Exact defaults from the Excel source of truth ("Adv. Inputs" sheet). */
export const NEXCAL_DEFAULT_SETTINGS: NexcalSettings = {
  materialEfficiencyFactor: 1.25,
  labourHourlyRate: 200,
  gstPercent: 18,
  defaultMarginPercent: 60,

  printTimeRateMode: "auto",
  printTimeRateManual: 14.39,

  printerCost: 60000,
  additionalUpfrontCost: 15000,
  annualMaintenance: 10000,
  estimatedLifeYrs: 3,
  estimatedUptimePct: 50,
  powerConsumptionW: 200,
  electricityCost: 8,
  costBufferFactor: 1.5,

  spoolWeightGrams: 1000,
  bulkTiers: [{ min: 1 }, { min: 13 }, { min: 25 }, { min: 50 }],

  nozzleDiameter: 0.4,
  layerHeight: 0.2,
  wallLoops: 2,
  infillPercent: 15,
  outerWallSpeed: 200,
  innerWallSpeed: 300,
  infillSpeed: 270,
  firstLayerSpeed: 50,
  speedRealizationFactor: 2.65,
  perLayerOverheadSeconds: 3.65,
  firstLayerFixedOverheadSeconds: 6.6,
  supportEnabled: false,
};

/** Pulls just the estimator-relevant fields out of settings/a part override. */
export function estimatorParams(
  settings: NexcalSettings,
  overrides: Partial<EstimatorParams> = {},
): EstimatorParams {
  return {
    nozzleDiameter: settings.nozzleDiameter,
    layerHeight: settings.layerHeight,
    wallLoops: settings.wallLoops,
    infillPercent: settings.infillPercent,
    outerWallSpeed: settings.outerWallSpeed,
    innerWallSpeed: settings.innerWallSpeed,
    infillSpeed: settings.infillSpeed,
    firstLayerSpeed: settings.firstLayerSpeed,
    speedRealizationFactor: settings.speedRealizationFactor,
    perLayerOverheadSeconds: settings.perLayerOverheadSeconds,
    firstLayerFixedOverheadSeconds: settings.firstLayerFixedOverheadSeconds,
    supportEnabled: settings.supportEnabled,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Uploaded parts — "Upload File" mode
// ---------------------------------------------------------------------------

export type MeshUnit = "mm" | "cm" | "inch";

export interface UploadedPart {
  id: number;
  name: string;
  unit: MeshUnit;
  upAxis: UpAxis;
  wallLoops: number;
  infillPercent: number;
  supportEnabled: boolean;
  scalePercent: number;
  baseMeshAnalysis: MeshAnalysis | null;
  meshAnalysis: MeshAnalysis | null;
  weightGrams: number | null;
  timeHours: number | null;
  qty: number;
  included: boolean;
  thumbnail: string | null;
}

export function newUploadedPart(id: number, name: string, settings: NexcalSettings): UploadedPart {
  return {
    id,
    name,
    unit: "mm",
    upAxis: "Z",
    wallLoops: settings.wallLoops,
    infillPercent: settings.infillPercent,
    supportEnabled: settings.supportEnabled,
    scalePercent: 100,
    baseMeshAnalysis: null,
    meshAnalysis: null,
    weightGrams: null,
    timeHours: null,
    qty: 1,
    included: true,
    thumbnail: null,
  };
}

export function longestDimensionMm(part: UploadedPart): number | null {
  if (!part.meshAnalysis) return null;
  return Math.max(part.meshAnalysis.dimensions.x, part.meshAnalysis.dimensions.y, part.meshAnalysis.dimensions.z);
}

export interface UploadedPartsAggregate {
  fileCount: number;
  totalPartCount: number;
  totalVolumeMm3: number;
  totalSurfaceAreaMm2: number;
  totalTriangleCount: number;
  totalWeightGrams: number;
  totalTimeHours: number;
}

/**
 * Sums up everything the "Total Estimated…" readout box shows, over
 * included parts only — mirrors `renderModelReadout` in the original.
 */
export function aggregateUploadedParts(parts: UploadedPart[]): UploadedPartsAggregate {
  const included = parts.filter((f) => f.included !== false);
  const totalVolumeMm3 = included.reduce(
    (s, f) => s + (f.meshAnalysis ? f.meshAnalysis.volumeMm3 * Math.max(1, f.qty || 1) : 0),
    0,
  );
  const totalSurfaceAreaMm2 = included.reduce(
    (s, f) => s + (f.meshAnalysis ? f.meshAnalysis.surfaceAreaMm2 * Math.max(1, f.qty || 1) : 0),
    0,
  );
  const totalTriangleCount = included.reduce(
    (s, f) => s + (f.meshAnalysis ? f.meshAnalysis.triangleCount : 0),
    0,
  );
  const totalPartCount = included.reduce((s, f) => s + Math.max(1, f.qty || 1), 0);
  const totalWeightGrams = included.reduce(
    (s, f) => s + (f.weightGrams ?? 0) * Math.max(1, f.qty || 1),
    0,
  );
  const totalTimeHours = included.reduce(
    (s, f) => s + (f.timeHours ?? 0) * Math.max(1, f.qty || 1),
    0,
  );

  return {
    fileCount: included.length,
    totalPartCount,
    totalVolumeMm3,
    totalSurfaceAreaMm2,
    totalTriangleCount,
    totalWeightGrams,
    totalTimeHours,
  };
}

/**
 * `applyEstimateToCalculator` from the original: filamentGrams/printHours
 * represent a SINGLE unit — calculateNexcal() multiplies by orderQty to get
 * the whole-order total. The aggregate is already qty-multiplied, so divide
 * back down to a per-unit average here; otherwise quantity would apply
 * twice (once baked into the aggregate, once again via orderQty).
 */
export function applyAggregateToInputs(
  inputs: NexcalInputs,
  aggregate: UploadedPartsAggregate,
): NexcalInputs {
  const totalPartCount = Math.max(1, aggregate.totalPartCount);
  return {
    ...inputs,
    filamentGrams: Math.round((aggregate.totalWeightGrams / totalPartCount) * 100) / 100,
    printHours: Math.round((aggregate.totalTimeHours / totalPartCount) * 100) / 100,
    orderQty: totalPartCount,
  };
}

/**
 * Alphabetical, with "Other" pinned last — it isn't a material, it's the
 * absence of one on the list, so sorting it in among them would file it
 * between Nylon and PC as though it were a filament.
 *
 * The list being alphabetical is not the same as the default being first:
 * emptyNexcalInputs() opens on PLA, per DEFAULT_MATERIAL in domain/library.
 */
export const NEXCAL_MATERIALS = [
  "ABS",
  "ASA",
  "Nylon",
  "PC",
  "PETG",
  "PLA",
  "TPU",
  "Other",
] as const;

// ---------------------------------------------------------------------------
// Line items — Materials Input / Packaging & Shipping tables
// ---------------------------------------------------------------------------

export interface NexcalLineRow {
  id: number;
  name: string;
  qty: number;
  unitCost: number;
}

export interface NexcalInputs {
  material: string;
  /** ₹ per kg */
  filamentCostPerKg: number;
  /** grams, whole part */
  filamentGrams: number;
  printHours: number;
  labourMinutes: number;
  /** Extra bought-in components, beyond the auto "Printed Part" row. */
  materialRows: NexcalLineRow[];
  packagingRows: NexcalLineRow[];
  marginPercent: number;
  orderQty: number;
}

export function emptyNexcalInputs(): NexcalInputs {
  return {
    material: "PLA",
    filamentCostPerKg: 800,
    filamentGrams: 0,
    printHours: 0,
    labourMinutes: 0,
    materialRows: [],
    packagingRows: [],
    marginPercent: NEXCAL_DEFAULT_SETTINGS.defaultMarginPercent,
    orderQty: 1,
  };
}

// ---------------------------------------------------------------------------
// Print time rate — machine cost, auto (printer economics) or manual
// ---------------------------------------------------------------------------

export interface PrintTimeRateBreakdown {
  totalInvestment: number;
  lifetimeCost: number;
  uptimeHrsYr: number;
  capitalCostPerHr: number;
  electricalCostPerHr: number;
  printTimeRate: number;
}

export function computePrintTimeRate(settings: NexcalSettings): PrintTimeRateBreakdown {
  const totalInvestment = settings.printerCost + settings.additionalUpfrontCost;
  const lifetimeCost =
    totalInvestment + settings.annualMaintenance * settings.estimatedLifeYrs;
  const uptimeHrsYr = 8760 * (settings.estimatedUptimePct / 100);
  const capitalCostPerHr =
    uptimeHrsYr > 0 && settings.estimatedLifeYrs > 0
      ? lifetimeCost / (uptimeHrsYr * settings.estimatedLifeYrs)
      : 0;
  const electricalCostPerHr =
    (settings.powerConsumptionW / 1000) * settings.electricityCost;
  const printTimeRate =
    (capitalCostPerHr + electricalCostPerHr) * settings.costBufferFactor;

  return {
    totalInvestment,
    lifetimeCost,
    uptimeHrsYr,
    capitalCostPerHr,
    electricalCostPerHr,
    printTimeRate,
  };
}

export function getPrintTimeRateValue(settings: NexcalSettings): number {
  if (settings.printTimeRateMode === "manual") return settings.printTimeRateManual;
  return computePrintTimeRate(settings).printTimeRate;
}

// ---------------------------------------------------------------------------
// Bulk tiers — spool-count tiers auto-mapped to a part-quantity range
// ---------------------------------------------------------------------------

export interface BulkTierBounds {
  min: number;
  /** null = open-ended (last tier). */
  max: number | null;
  /** Percentage points off margin — +5 per tier level (0, 5, 10, 15…). */
  discount: number;
}

/** Sorts tiers ascending and derives each one's upper bound and discount. */
export function getTiersWithBounds(settings: NexcalSettings): BulkTierBounds[] {
  const sorted = [...settings.bulkTiers].sort((a, b) => a.min - b.min);
  return sorted.map((tier, idx) => ({
    min: tier.min,
    max: idx < sorted.length - 1 ? sorted[idx + 1].min - 1 : null,
    discount: idx * 5,
  }));
}

export interface TierPartRange {
  minParts: number;
  maxParts: number | null;
}

/**
 * Converts a spool-count tier into the equivalent part-quantity range using
 * total filament weight across the tier's spool count, divided by the
 * part's weight — not a per-spool floor multiplied out — so tiers stay
 * correct even when a part weighs more than a single spool.
 */
export function tierPartRange(
  tier: BulkTierBounds,
  gramsPerPart: number,
  settings: NexcalSettings,
): TierPartRange {
  const grams = gramsPerPart > 0 ? gramsPerPart : 1;
  const minParts = Math.floor(((tier.min - 1) * settings.spoolWeightGrams) / grams) + 1;
  const maxPartsRaw =
    tier.max === null ? null : Math.floor((tier.max * settings.spoolWeightGrams) / grams);
  const maxParts = maxPartsRaw !== null && maxPartsRaw < minParts ? minParts : maxPartsRaw;
  return { minParts, maxParts };
}

export interface MatchedBulkTier extends BulkTierBounds, TierPartRange {}

/** The tier (if any) whose auto-mapped part-quantity range contains `qty`. */
export function findBulkTier(
  settings: NexcalSettings,
  gramsPerPart: number,
  qty: number,
): MatchedBulkTier | null {
  for (const tier of getTiersWithBounds(settings)) {
    const { minParts, maxParts } = tierPartRange(tier, gramsPerPart, settings);
    const withinMin = qty >= minParts;
    const withinMax = maxParts === null || qty <= maxParts;
    if (withinMin && withinMax) return { ...tier, minParts, maxParts };
  }
  return null;
}

/** How many whole parts fit on one spool — for the "parts / spool" note. */
export function getPartsPerSpool(settings: NexcalSettings, gramsPerPart: number): number {
  if (!gramsPerPart || gramsPerPart <= 0) return 1;
  return Math.floor(settings.spoolWeightGrams / gramsPerPart);
}

// ---------------------------------------------------------------------------
// Core calculation — mirrors Calculator + Adv. Inputs sheet formulas exactly
// ---------------------------------------------------------------------------

export interface NexcalResult {
  printedPartCost: number;
  materialsRowsTotal: number;
  totalMaterialsCost: number;
  totalLabourCost: number;
  printTimeRate: number;
  machineCost: number;
  totalPackagingCost: number;
  unitLandedCost: number;
  orderQty: number;
  totalLandedCost: number;
  bulkTier: MatchedBulkTier | null;
  bulkDiscount: number;
  marginSafe: number;
  calcPrice: number;
  gstAmount: number;
  finalPrice: number;
  finalPriceRounded: number;
  perUnitPrice: number | null;
}

export function calculateNexcal(
  inputs: NexcalInputs,
  settings: NexcalSettings,
): NexcalResult {
  const printedPartCost =
    (inputs.filamentGrams / 1000) *
    inputs.filamentCostPerKg *
    settings.materialEfficiencyFactor;

  const materialsRowsTotal = inputs.materialRows.reduce(
    (sum, r) => sum + r.qty * r.unitCost,
    0,
  );
  const totalMaterialsCost = printedPartCost + materialsRowsTotal;

  const totalLabourCost = (inputs.labourMinutes / 60) * settings.labourHourlyRate;

  const printTimeRate = getPrintTimeRateValue(settings);
  const machineCost = inputs.printHours * printTimeRate;

  const totalPackagingCost = inputs.packagingRows.reduce(
    (sum, r) => sum + r.qty * r.unitCost,
    0,
  );

  const unitLandedCost =
    totalMaterialsCost + totalLabourCost + machineCost + totalPackagingCost;

  const orderQty = Math.max(1, Math.round(inputs.orderQty) || 1);
  const totalLandedCost = unitLandedCost * orderQty;

  const bulkTier = findBulkTier(settings, inputs.filamentGrams, orderQty);
  const bulkDiscount = bulkTier ? bulkTier.discount : 0;

  const marginSafe = Math.min(Math.max(inputs.marginPercent - bulkDiscount, 0), 95);
  const calcPrice =
    marginSafe < 100 ? totalLandedCost / (1 - marginSafe / 100) : totalLandedCost;

  const gstAmount = calcPrice * (settings.gstPercent / 100);
  const finalPrice = calcPrice + gstAmount;
  const finalPriceRounded = ceilToNearest(finalPrice, 10);

  return {
    printedPartCost: round2(printedPartCost),
    materialsRowsTotal: round2(materialsRowsTotal),
    totalMaterialsCost: round2(totalMaterialsCost),
    totalLabourCost: round2(totalLabourCost),
    printTimeRate: round2(printTimeRate),
    machineCost: round2(machineCost),
    totalPackagingCost: round2(totalPackagingCost),
    unitLandedCost: round2(unitLandedCost),
    orderQty,
    totalLandedCost: round2(totalLandedCost),
    bulkTier,
    bulkDiscount,
    marginSafe,
    calcPrice: round2(calcPrice),
    gstAmount: round2(gstAmount),
    finalPrice: round2(finalPrice),
    finalPriceRounded,
    perUnitPrice: orderQty > 1 ? round2(finalPrice / orderQty) : null,
  };
}

// ---------------------------------------------------------------------------
// Bulk price table — the customer-facing "Price Table" under Bulk Pricing
// ---------------------------------------------------------------------------

export interface BulkPriceRow {
  minParts: number;
  maxParts: number | null;
  discount: number;
  priceExGst: number;
  priceIncGst: number;
  isActive: boolean;
}

/**
 * One row per tier, independent of order qty (per-unit price only depends
 * on unitLandedCost + margin) — plus which tier the current order qty
 * actually falls into, so the UI can highlight it.
 */
export function buildBulkPriceTable(
  inputs: NexcalInputs,
  settings: NexcalSettings,
  unitLandedCost: number,
): BulkPriceRow[] {
  const orderQty = Math.max(1, Math.round(inputs.orderQty) || 1);
  return getTiersWithBounds(settings).map((tier) => {
    const { minParts, maxParts } = tierPartRange(tier, inputs.filamentGrams, settings);
    const isActive = orderQty >= minParts && (maxParts === null || orderQty <= maxParts);

    const marginSafe = Math.min(Math.max(inputs.marginPercent - tier.discount, 0), 95);
    const calcPrice =
      marginSafe < 100 ? unitLandedCost / (1 - marginSafe / 100) : unitLandedCost;
    const priceExGst = ceilToNearest(calcPrice, 10);
    const priceIncGst = ceilToNearest(calcPrice * (1 + settings.gstPercent / 100), 10);

    return { minParts, maxParts, discount: tier.discount, priceExGst, priceIncGst, isActive };
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function ceilToNearest(n: number, step: number): number {
  if (!isFinite(n)) return 0;
  return Math.ceil(n / step) * step;
}

function round2(n: number): number {
  if (!isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}
