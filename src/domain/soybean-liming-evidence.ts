import { normalizeManagementSystem, type CanonicalManagementSystem } from "./management-system.ts";
import {
  evaluateSoybeanLimingRsSc2025,
  type SoybeanLimingRestrictionAssessment,
} from "./soybean-liming-rs-sc-2025.ts";

export type SoybeanLimingLabResult = {
  sampleCode: string;
  parameterCode: string;
  value: number;
  unit: string;
  depthFromCm?: number | null;
  depthToCm?: number | null;
};

export type SoybeanLimingSampleDecision = {
  sampleCode: string;
  depthFromCm: number;
  depthToCm: number;
  decision: "APPLY" | "DO_NOT_APPLY" | "BLOCKED";
  automaticDoseAllowed: boolean;
  recommendedDoseTonHaPrnt100: number | null;
  applicationMode: "INCORPORATED" | "SURFACE" | null;
  incorporatedDepthCm: { from: number; to: number } | null;
  phWater: number | null;
  smp: number | null;
  baseSaturationPct: number | null;
  aluminumSaturationPct: number | null;
  derivedBaseSaturation: boolean;
  derivedAluminumSaturation: boolean;
  ruleId: string | null;
  blockers: string[];
  warnings: string[];
};

export type SoybeanLimingUniformDecision = {
  cropCode: string | null;
  region: "RS" | "SC" | "OTHER";
  managementSystem: CanonicalManagementSystem;
  status: "NOT_APPLICABLE" | "BLOCKED" | "UNIFORM_APPLY" | "UNIFORM_NO_APPLY" | "SPATIAL";
  automaticUniformDoseAllowed: boolean;
  uniformDoseTonHaPrnt100: number | null;
  applicationMode: "INCORPORATED" | "SURFACE" | null;
  incorporatedDepthCm: { from: number; to: number } | null;
  sampleDecisions: SoybeanLimingSampleDecision[];
  blockers: string[];
  warnings: string[];
};

function unique(values: string[]) {
  return [...new Set(values)];
}

function round(value: number, decimals = 2) {
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function regionFromState(state: string | null | undefined): "RS" | "SC" | "OTHER" {
  const normalized = (state ?? "").trim().toUpperCase();
  if (normalized === "RS") return "RS";
  if (normalized === "SC") return "SC";
  return "OTHER";
}

function normalizedUnit(unit: string | null | undefined) {
  return (unit ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/³/g, "3")
    .replace(/²/g, "2")
    .replace(/\s+/g, "")
    .toLowerCase();
}

function isCmolcUnit(unit: string | null | undefined) {
  const normalized = normalizedUnit(unit);
  return normalized.includes("cmolc/dm3") || normalized.includes("cmolcdm-3") || normalized.includes("cmolc.dm-3");
}

function isMgDm3Unit(unit: string | null | undefined) {
  const normalized = normalizedUnit(unit);
  return normalized.includes("mg/dm3") || normalized.includes("mgdm-3") || normalized.includes("mg.dm-3");
}

function sameDepth(row: SoybeanLimingLabResult, from: number, to: number) {
  return row.depthFromCm === from && row.depthToCm === to;
}

function resultAtDepth(
  rows: SoybeanLimingLabResult[],
  parameterCode: string,
  from: number,
  to: number,
): { row: SoybeanLimingLabResult | null; conflict: boolean } {
  const matching = rows.filter(
    (row) => row.parameterCode.toUpperCase() === parameterCode && sameDepth(row, from, to),
  );
  if (matching.length === 0) return { row: null, conflict: false };
  const first = matching[0];
  const conflict = matching.some(
    (row) => Math.abs(row.value - first.value) > 1e-9 || normalizedUnit(row.unit) !== normalizedUnit(first.unit),
  );
  return { row: conflict ? null : first, conflict };
}

function potassiumCmolc(row: SoybeanLimingLabResult | null, blockers: string[]) {
  if (!row || !Number.isFinite(row.value) || row.value < 0) {
    blockers.push("K_MISSING_OR_INVALID");
    return null;
  }
  if (isCmolcUnit(row.unit)) return row.value;
  if (isMgDm3Unit(row.unit)) return row.value / 391;
  blockers.push("K_UNIT_NOT_SUPPORTED_FOR_LIMING");
  return null;
}

function cmolcValue(row: SoybeanLimingLabResult | null, code: string, blockers: string[]) {
  if (!row || !Number.isFinite(row.value) || row.value < 0) {
    blockers.push(`${code}_MISSING_OR_INVALID`);
    return null;
  }
  if (!isCmolcUnit(row.unit)) {
    blockers.push(`${code}_UNIT_NOT_SUPPORTED_FOR_LIMING`);
    return null;
  }
  return row.value;
}

function percentValue(row: SoybeanLimingLabResult | null) {
  if (!row || !Number.isFinite(row.value) || row.value < 0 || row.value > 100) return null;
  return row.value;
}

function deriveAcidityContext(
  rows: SoybeanLimingLabResult[],
  from: number,
  to: number,
  blockers: string[],
) {
  const vResult = resultAtDepth(rows, "V", from, to);
  const mResult = resultAtDepth(rows, "M", from, to);
  const altMResult = resultAtDepth(rows, "AL_SAT", from, to);
  const caResult = resultAtDepth(rows, "CA", from, to);
  const mgResult = resultAtDepth(rows, "MG", from, to);
  const kResult = resultAtDepth(rows, "K", from, to);
  const alResult = resultAtDepth(rows, "AL", from, to);
  const ctcResult = resultAtDepth(rows, "CTC", from, to);

  for (const [code, entry] of Object.entries({ V: vResult, M: mResult, AL_SAT: altMResult, CA: caResult, MG: mgResult, K: kResult, AL: alResult, CTC: ctcResult })) {
    if (entry.conflict) blockers.push(`${code}_DUPLICATE_CONFLICT`);
  }

  let baseSaturationPct = percentValue(vResult.row);
  let aluminumSaturationPct = percentValue(mResult.row) ?? percentValue(altMResult.row);
  let derivedBaseSaturation = false;
  let derivedAluminumSaturation = false;

  const localBlockers: string[] = [];
  const ca = cmolcValue(caResult.row, "CA", localBlockers);
  const mg = cmolcValue(mgResult.row, "MG", localBlockers);
  const k = potassiumCmolc(kResult.row, localBlockers);

  if (baseSaturationPct == null) {
    const ctc = cmolcValue(ctcResult.row, "CTC", localBlockers);
    if (ca != null && mg != null && k != null && ctc != null && ctc > 0) {
      baseSaturationPct = round(((ca + mg + k) / ctc) * 100, 2);
      derivedBaseSaturation = true;
    } else {
      blockers.push("BASE_SATURATION_MISSING_AND_NOT_DERIVABLE");
    }
  }

  if (aluminumSaturationPct == null) {
    const al = cmolcValue(alResult.row, "AL", localBlockers);
    if (ca != null && mg != null && k != null && al != null && ca + mg + k + al > 0) {
      aluminumSaturationPct = round((al / (ca + mg + k + al)) * 100, 2);
      derivedAluminumSaturation = true;
    } else {
      blockers.push("ALUMINUM_SATURATION_MISSING_AND_NOT_DERIVABLE");
    }
  }

  // Só propaga problemas de unidade/ausência dos cátions quando a derivação era necessária.
  if (derivedBaseSaturation || derivedAluminumSaturation || baseSaturationPct == null || aluminumSaturationPct == null) {
    blockers.push(...localBlockers);
  }

  return {
    baseSaturationPct,
    aluminumSaturationPct,
    derivedBaseSaturation,
    derivedAluminumSaturation,
  };
}

function sampleRows(results: SoybeanLimingLabResult[]) {
  const grouped = new Map<string, SoybeanLimingLabResult[]>();
  for (const row of results) {
    if (!row.sampleCode?.trim()) continue;
    const current = grouped.get(row.sampleCode) ?? [];
    current.push(row);
    grouped.set(row.sampleCode, current);
  }
  return [...grouped.entries()].map(([sampleCode, rows]) => ({ sampleCode, rows }));
}

function blockedSample(
  sampleCode: string,
  from: number,
  to: number,
  blockers: string[],
  partial?: Partial<SoybeanLimingSampleDecision>,
): SoybeanLimingSampleDecision {
  return {
    sampleCode,
    depthFromCm: from,
    depthToCm: to,
    decision: "BLOCKED",
    automaticDoseAllowed: false,
    recommendedDoseTonHaPrnt100: null,
    applicationMode: null,
    incorporatedDepthCm: null,
    phWater: null,
    smp: null,
    baseSaturationPct: null,
    aluminumSaturationPct: null,
    derivedBaseSaturation: false,
    derivedAluminumSaturation: false,
    ruleId: null,
    blockers: unique(blockers),
    warnings: [],
    ...partial,
  };
}

function evaluateSample(input: {
  sampleCode: string;
  rows: SoybeanLimingLabResult[];
  region: "RS" | "SC" | "OTHER";
  system: Exclude<CanonicalManagementSystem, "OTHER">;
  yearsSinceLastLiming?: number | null;
  restrictionAssessment?: SoybeanLimingRestrictionAssessment | null;
}) {
  const { sampleCode, rows, region, system } = input;
  const depth = system === "NO_TILL_CONSOLIDATED_NO_10_20_RESTRICTIONS"
    ? { from: 0, to: 10 }
    : system === "NO_TILL_CONSOLIDATED_WITH_10_20_RESTRICTIONS"
      ? { from: 10, to: 20 }
      : { from: 0, to: 20 };

  const blockers: string[] = [];
  const phResult = resultAtDepth(rows, "PH", depth.from, depth.to);
  if (phResult.conflict) blockers.push("PH_DUPLICATE_CONFLICT");
  const ph = phResult.row?.value;
  if (typeof ph !== "number" || !Number.isFinite(ph) || ph < 0 || ph > 14) blockers.push(`PH_${depth.from}_${depth.to}_MISSING_OR_INVALID`);

  const smpDepth = system === "NO_TILL_CONSOLIDATED_WITH_10_20_RESTRICTIONS"
    ? [{ from: 0, to: 10 }, { from: 10, to: 20 }]
    : [depth];
  const smpRows = smpDepth.map((item) => resultAtDepth(rows, "SMP", item.from, item.to));
  if (smpRows.some((item) => item.conflict)) blockers.push("SMP_DUPLICATE_CONFLICT");
  const smpValues = smpRows.map((item) => item.row?.value ?? null);
  if (smpValues.some((value) => typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 14)) {
    blockers.push(system === "NO_TILL_CONSOLIDATED_WITH_10_20_RESTRICTIONS" ? "SMP_0_10_AND_10_20_REQUIRED" : `SMP_${depth.from}_${depth.to}_MISSING_OR_INVALID`);
  }

  let acidity = {
    baseSaturationPct: null as number | null,
    aluminumSaturationPct: null as number | null,
    derivedBaseSaturation: false,
    derivedAluminumSaturation: false,
  };

  if (system !== "NO_TILL_ESTABLISHMENT") {
    acidity = deriveAcidityContext(rows, depth.from, depth.to, blockers);
  }

  if (blockers.length > 0) {
    return blockedSample(sampleCode, depth.from, depth.to, blockers, {
      phWater: typeof ph === "number" && Number.isFinite(ph) ? ph : null,
      smp: typeof smpValues[0] === "number" ? smpValues[0] : null,
      ...acidity,
    });
  }

  const baseInput = {
    region,
    system,
    yearsSinceLastLiming: input.yearsSinceLastLiming ?? null,
  } as const;

  const engine = system === "CONVENTIONAL"
    ? evaluateSoybeanLimingRsSc2025({
        ...baseInput,
        phWater0To20: ph as number,
        baseSaturation0To20Pct: acidity.baseSaturationPct as number,
        aluminumSaturation0To20Pct: acidity.aluminumSaturationPct as number,
        smp0To20: smpValues[0] as number,
      })
    : system === "NO_TILL_ESTABLISHMENT"
      ? evaluateSoybeanLimingRsSc2025({
          ...baseInput,
          phWater0To20: ph as number,
          smp0To20: smpValues[0] as number,
        })
      : system === "NO_TILL_CONSOLIDATED_NO_10_20_RESTRICTIONS"
        ? evaluateSoybeanLimingRsSc2025({
            ...baseInput,
            noRestrictions10To20Confirmed: true,
            phWater0To10: ph as number,
            baseSaturation0To10Pct: acidity.baseSaturationPct as number,
            aluminumSaturation0To10Pct: acidity.aluminumSaturationPct as number,
            smp0To10: smpValues[0] as number,
          })
        : evaluateSoybeanLimingRsSc2025({
            ...baseInput,
            phWater10To20: ph as number,
            aluminumSaturation10To20Pct: acidity.aluminumSaturationPct as number,
            smp0To10: smpValues[0] as number,
            smp10To20: smpValues[1] as number,
            restrictionAssessment: input.restrictionAssessment ?? null,
          });

  const blocked = engine.decision.startsWith("BLOCKED");
  return {
    sampleCode,
    depthFromCm: depth.from,
    depthToCm: depth.to,
    decision: blocked ? "BLOCKED" as const : engine.decision,
    automaticDoseAllowed: engine.automaticDoseAllowed,
    recommendedDoseTonHaPrnt100: engine.recommendedDoseTonHaPrnt100,
    applicationMode: engine.applicationMode,
    incorporatedDepthCm: engine.incorporatedDepthCm,
    phWater: ph as number,
    smp: typeof smpValues[0] === "number" ? smpValues[0] : null,
    baseSaturationPct: acidity.baseSaturationPct,
    aluminumSaturationPct: acidity.aluminumSaturationPct,
    derivedBaseSaturation: acidity.derivedBaseSaturation,
    derivedAluminumSaturation: acidity.derivedAluminumSaturation,
    ruleId: engine.ruleId,
    blockers: blocked ? engine.blockers : [],
    warnings: engine.warnings,
  } satisfies SoybeanLimingSampleDecision;
}

function sameIncorporationDepth(
  a: { from: number; to: number } | null,
  b: { from: number; to: number } | null,
) {
  if (a === null || b === null) return a === b;
  return a.from === b.from && a.to === b.to;
}

/**
 * Converte o laudo em decisão de calagem da soja sem criar média agronômica.
 *
 * - Cada amostra é decidida separadamente.
 * - V% e m% só são derivados quando os cátions/CTC necessários estão presentes
 *   na mesma amostra e profundidade, com unidades compatíveis.
 * - Dose uniforme só é liberada quando TODOS os pontos têm a mesma decisão,
 *   mesma dose e mesmo modo de aplicação.
 * - Variação entre pontos vira SPATIAL, nunca média simples.
 */
export function evaluateSoybeanLimingFromEvidence(input: {
  cropCode: string | null;
  state: string | null;
  managementSystem: string | null;
  results: SoybeanLimingLabResult[];
  yearsSinceLastLiming?: number | null;
  restrictionAssessment?: SoybeanLimingRestrictionAssessment | null;
}): SoybeanLimingUniformDecision {
  const region = regionFromState(input.state);
  const managementSystem = normalizeManagementSystem(input.managementSystem);

  if (input.cropCode !== "SOJA") {
    return {
      cropCode: input.cropCode,
      region,
      managementSystem,
      status: "NOT_APPLICABLE",
      automaticUniformDoseAllowed: false,
      uniformDoseTonHaPrnt100: null,
      applicationMode: null,
      incorporatedDepthCm: null,
      sampleDecisions: [],
      blockers: [],
      warnings: [],
    };
  }

  if (region === "OTHER") {
    return {
      cropCode: input.cropCode,
      region,
      managementSystem,
      status: "BLOCKED",
      automaticUniformDoseAllowed: false,
      uniformDoseTonHaPrnt100: null,
      applicationMode: null,
      incorporatedDepthCm: null,
      sampleDecisions: [],
      blockers: ["LIMING_PROFILE_OUTSIDE_RS_SC"],
      warnings: [],
    };
  }

  if (managementSystem === "OTHER") {
    return {
      cropCode: input.cropCode,
      region,
      managementSystem,
      status: "BLOCKED",
      automaticUniformDoseAllowed: false,
      uniformDoseTonHaPrnt100: null,
      applicationMode: null,
      incorporatedDepthCm: null,
      sampleDecisions: [],
      blockers: ["MANAGEMENT_SYSTEM_REQUIRED_FOR_LIMING"],
      warnings: [],
    };
  }

  const grouped = sampleRows(input.results);
  if (grouped.length === 0) {
    return {
      cropCode: input.cropCode,
      region,
      managementSystem,
      status: "BLOCKED",
      automaticUniformDoseAllowed: false,
      uniformDoseTonHaPrnt100: null,
      applicationMode: null,
      incorporatedDepthCm: null,
      sampleDecisions: [],
      blockers: ["LIMING_SAMPLE_RESULTS_REQUIRED"],
      warnings: [],
    };
  }

  const sampleDecisions = grouped.map(({ sampleCode, rows }) =>
    evaluateSample({
      sampleCode,
      rows,
      region,
      system: managementSystem,
      yearsSinceLastLiming: input.yearsSinceLastLiming,
      restrictionAssessment: input.restrictionAssessment,
    }),
  );
  const blockers = unique(sampleDecisions.flatMap((item) => item.blockers));
  const warnings = unique(sampleDecisions.flatMap((item) => item.warnings));

  if (sampleDecisions.some((item) => item.decision === "BLOCKED")) {
    return {
      cropCode: input.cropCode,
      region,
      managementSystem,
      status: "BLOCKED",
      automaticUniformDoseAllowed: false,
      uniformDoseTonHaPrnt100: null,
      applicationMode: null,
      incorporatedDepthCm: null,
      sampleDecisions,
      blockers,
      warnings,
    };
  }

  if (sampleDecisions.every((item) => item.decision === "DO_NOT_APPLY")) {
    return {
      cropCode: input.cropCode,
      region,
      managementSystem,
      status: "UNIFORM_NO_APPLY",
      automaticUniformDoseAllowed: true,
      uniformDoseTonHaPrnt100: 0,
      applicationMode: null,
      incorporatedDepthCm: null,
      sampleDecisions,
      blockers: [],
      warnings,
    };
  }

  if (sampleDecisions.every((item) => item.decision === "APPLY")) {
    const first = sampleDecisions[0];
    const uniform = sampleDecisions.every((item) =>
      item.recommendedDoseTonHaPrnt100 != null
      && first.recommendedDoseTonHaPrnt100 != null
      && Math.abs(item.recommendedDoseTonHaPrnt100 - first.recommendedDoseTonHaPrnt100) <= 0.01
      && item.applicationMode === first.applicationMode
      && sameIncorporationDepth(item.incorporatedDepthCm, first.incorporatedDepthCm),
    );
    if (uniform) {
      return {
        cropCode: input.cropCode,
        region,
        managementSystem,
        status: "UNIFORM_APPLY",
        automaticUniformDoseAllowed: true,
        uniformDoseTonHaPrnt100: first.recommendedDoseTonHaPrnt100,
        applicationMode: first.applicationMode,
        incorporatedDepthCm: first.incorporatedDepthCm,
        sampleDecisions,
        blockers: [],
        warnings,
      };
    }
  }

  return {
    cropCode: input.cropCode,
    region,
    managementSystem,
    status: "SPATIAL",
    automaticUniformDoseAllowed: false,
    uniformDoseTonHaPrnt100: null,
    applicationMode: null,
    incorporatedDepthCm: null,
    sampleDecisions,
    blockers: ["LIMING_NO_UNIFORM_DOSE_ACROSS_SAMPLES"],
    warnings,
  };
}
