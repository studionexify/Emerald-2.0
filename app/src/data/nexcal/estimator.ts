/**
 * Nexcal — geometry-based weight/time estimator.
 *
 * Ported line-for-line from the standalone Nexcal calculator
 * (`Nexcal - Price Calculator/assets/estimator.js`). Heuristic 3D-printing
 * physics model, calibrated against a 25×25×25mm test cube plus real sliced
 * exports (dragon egg, leopard w/ tree supports, phone stand) on a Bambu
 * Lab P1S in PLA/PETG/ABS/ASA. Pure — no DOM, no localStorage.
 */

import type { MeshAnalysis } from "./geometry";

export interface MaterialPreset {
  /** g/cm³ */
  density: number;
  /** seconds — minimum-layer cooling floor */
  slowDownLayerTime: number;
  calibrated: boolean;
}

/**
 * PLA/PETG/ABS/ASA measured from real sliced exports; the rest are
 * engineering-judgment defaults, not calibrated.
 */
export const MATERIAL_PRESETS: Record<string, MaterialPreset> = {
  PLA: { density: 1.26, slowDownLayerTime: 4, calibrated: true },
  PETG: { density: 1.27, slowDownLayerTime: 12, calibrated: true },
  ABS: { density: 1.04, slowDownLayerTime: 3, calibrated: true },
  ASA: { density: 1.04, slowDownLayerTime: 3, calibrated: true },
  TPU: { density: 1.21, slowDownLayerTime: 8, calibrated: false },
  PC: { density: 1.2, slowDownLayerTime: 5, calibrated: false },
  Nylon: { density: 1.14, slowDownLayerTime: 5, calibrated: false },
  Other: { density: 1.24, slowDownLayerTime: 6, calibrated: false },
};

export interface EstimatorParams {
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

export interface WeightEstimate {
  shellVolumeMm3: number;
  interiorVolumeMm3: number;
  infillVolumeMm3: number;
  totalExtrudedMm3: number;
  weightGrams: number;
}

export function estimateWeight(
  mesh: MeshAnalysis,
  preset: MaterialPreset,
  params: EstimatorParams,
): WeightEstimate {
  const shellVolumeMm3 = mesh.surfaceAreaMm2 * params.wallLoops * params.nozzleDiameter;
  const interiorVolumeMm3 = Math.max(mesh.volumeMm3 - shellVolumeMm3, 0);
  const infillVolumeMm3 = interiorVolumeMm3 * (params.infillPercent / 100);
  const totalExtrudedMm3 = shellVolumeMm3 + infillVolumeMm3;
  const weightGrams = totalExtrudedMm3 * (preset.density / 1000);
  return { shellVolumeMm3, interiorVolumeMm3, infillVolumeMm3, totalExtrudedMm3, weightGrams };
}

export interface TimeEstimate {
  layerCount: number;
  avgFootprintAreaMm2: number;
  avgPerimeterMm: number;
  rawLayerTimeS: number;
  cappedLayerTimeS: number;
  firstLayerTimeS: number;
  totalTimeS: number;
  timeHours: number;
}

export function estimateTime(
  mesh: MeshAnalysis,
  preset: MaterialPreset,
  params: EstimatorParams,
): TimeEstimate {
  const layerCount = Math.max(Math.ceil(mesh.height / params.layerHeight), 1);
  const avgFootprintAreaMm2 = mesh.volumeMm3 / mesh.height;
  const avgPerimeterMm = Math.max(
    (mesh.surfaceAreaMm2 - 2 * avgFootprintAreaMm2) / mesh.height,
    0,
  );

  const wallTimeS =
    avgPerimeterMm / params.outerWallSpeed +
    (avgPerimeterMm * (params.wallLoops - 1)) / params.innerWallSpeed;
  const infillPathMm = (avgFootprintAreaMm2 * (params.infillPercent / 100)) / params.nozzleDiameter;
  const infillTimeS = infillPathMm / params.infillSpeed;
  const rawLayerTimeS = wallTimeS + infillTimeS;

  const cappedLayerTimeS =
    Math.max(rawLayerTimeS * params.speedRealizationFactor, preset.slowDownLayerTime) +
    params.perLayerOverheadSeconds;

  const firstLayerWallTimeS = (avgPerimeterMm * params.wallLoops) / params.firstLayerSpeed;
  const firstLayerInfillPathMm = avgFootprintAreaMm2 / params.nozzleDiameter; // 100% density
  const firstLayerInfillTimeS = firstLayerInfillPathMm / params.firstLayerSpeed;
  const firstLayerTimeS =
    (firstLayerWallTimeS + firstLayerInfillTimeS) * params.speedRealizationFactor +
    params.firstLayerFixedOverheadSeconds;

  const totalTimeS = firstLayerTimeS + (layerCount - 1) * cappedLayerTimeS;

  return {
    layerCount,
    avgFootprintAreaMm2,
    avgPerimeterMm,
    rawLayerTimeS,
    cappedLayerTimeS,
    firstLayerTimeS,
    totalTimeS,
    timeHours: totalTimeS / 3600,
  };
}

/**
 * Calibrated against a real tree-support print (Voronoi leopard, Bambu
 * Studio, PLA): supports add disproportionately more time than material
 * (slower support speeds, interface layers, extra travel), so weight and
 * time get separate multipliers rather than one shared figure. Based on a
 * single reference sample — revisit if support jobs consistently miss.
 *
 * NOTE (carried over from the original): the source UI's "Support (+10%)"
 * label doesn't match these constants — the actual multipliers are
 * +33%/+160%. Reproduced here as-is.
 */
const SUPPORT_WEIGHT_MULTIPLIER = 1.33;
const SUPPORT_TIME_MULTIPLIER = 2.6;

export interface NexcalEstimate {
  weightGrams: number;
  timeHours: number;
  calibrated: boolean;
  supportMultiplier: number;
  breakdown: { weight: WeightEstimate; time: TimeEstimate };
}

export function estimate(
  mesh: MeshAnalysis,
  materialType: string,
  params: EstimatorParams,
): NexcalEstimate {
  const preset = MATERIAL_PRESETS[materialType] || MATERIAL_PRESETS.Other;
  const weight = estimateWeight(mesh, preset, params);
  const time = estimateTime(mesh, preset, params);
  const weightMultiplier = params.supportEnabled ? SUPPORT_WEIGHT_MULTIPLIER : 1;
  const timeMultiplier = params.supportEnabled ? SUPPORT_TIME_MULTIPLIER : 1;
  return {
    weightGrams: weight.weightGrams * weightMultiplier,
    timeHours: time.timeHours * timeMultiplier,
    calibrated: preset.calibrated,
    supportMultiplier: weightMultiplier,
    breakdown: { weight, time },
  };
}
