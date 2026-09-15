import { computeLimingDoseBySmpIndex } from "./liming-engine.ts";

export const SOYBEAN_LIMING_RS_SC_2025_RULE_ID = "LIMING-SOYBEAN-RS-SC-2025" as const;
export const SOYBEAN_LIMING_RS_SC_2025_SOURCE_URL =
  "https://www.alice.cnptia.embrapa.br/alice/bitstream/doc/1183120/1/Indicacoes2025.pdf";

const SOURCE = Object.freeze({
  title: "Indicações técnicas para a cultura da soja no Rio Grande do Sul e em Santa Catarina, safras 2025/2026 e 2026/2027",
  institution: "44ª Reunião de Pesquisa de Soja da Região Sul / Embrapa Trigo / Universidade de Passo Fundo",
  year: 2025,
  locator: "item 2.3 Calagem; Tabelas 2.2 e 2.3",
  url: SOYBEAN_LIMING_RS_SC_2025_SOURCE_URL,
});

export type SoybeanLimingRegion = "RS" | "SC" | "OTHER";
export type SoybeanLimingSystem =
  | "CONVENTIONAL"
  | "NO_TILL_ESTABLISHMENT"
  | "NO_TILL_CONSOLIDATED_NO_10_20_RESTRICTIONS"
  | "NO_TILL_CONSOLIDATED_WITH_10_20_RESTRICTIONS";

export type SoybeanLimingRestrictionAssessment = {
  yieldBelowLocalAverageEspeciallyInDrought: boolean | null;
  compactionRestrictsRootGrowthAtDepth: boolean | null;
  phosphorus10To20BelowCritical: boolean | null;
  agronomistConfirmedIncorporationDecision: boolean;
};

export type SoybeanLimingRsSc2025Input = {
  region: SoybeanLimingRegion;
  system: SoybeanLimingSystem;
  phWater0To20?: number | null;
  phWater0To10?: number | null;
  phWater10To20?: number | null;
  baseSaturation0To20Pct?: number | null;
  baseSaturation0To10Pct?: number | null;
  aluminumSaturation0To20Pct?: number | null;
  aluminumSaturation0To10Pct?: number | null;
  aluminumSaturation10To20Pct?: number | null;
  smp0To20?: number | null;
  smp0To10?: number | null;
  smp10To20?: number | null;
  noRestrictions10To20Confirmed?: boolean;
  restrictionAssessment?: SoybeanLimingRestrictionAssessment | null;
};

type Decision = "APPLY" | "DO_NOT_APPLY" | "BLOCKED_CONTEXT" | "BLOCKED_PROFESSIONAL_REVIEW";
type ApplicationMode = "INCORPORATED" | "SURFACE" | null;

function finite(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function validPh(value: number | null | undefined): value is number {
  return finite(value) && value >= 0 && value <= 14;
}

function validPercent(value: number | null | undefined): value is number {
  return finite(value) && value >= 0 && value <= 100;
}

function validSmp(value: number | null | undefined): value is number {
  return finite(value) && value >= 0 && value <= 14;
}

function unique(values: string[]) {
  return [...new Set(values)];
}

function noLimeExceptionByVAndAl(vPct: number, alSatPct: number) {
  // Nota (1), Tabela 2.2: não aplicar quando V >=65% E saturação por Al <10%.
  return vPct >= 65 && alSatPct < 10;
}

function fullSmpDoseToPh6(smp: number) {
  return computeLimingDoseBySmpIndex(smp, "6.0").doseTonPerHaPrnt100;
}

function buildNoApply(reason: string, warnings: string[] = []) {
  return {
    ruleId: SOYBEAN_LIMING_RS_SC_2025_RULE_ID,
    ruleStatus: "READY_FOR_IMPLEMENTATION" as const,
    contextReady: true,
    decision: "DO_NOT_APPLY" as const,
    automaticDoseAllowed: true,
    recommendedDoseTonHaPrnt100: 0,
    rawSmpDoseTonHaPrnt100: 0,
    applicationMode: null as ApplicationMode,
    incorporatedDepthCm: null as { from: number; to: number } | null,
    surfaceCapApplied: false,
    blockers: [] as string[],
    warnings: unique(warnings),
    reason,
    source: SOURCE,
    policy: {
      commercialPrntConversionAllowedHere: false as const,
      productSelectionAllowedHere: false as const,
      alternativeLowBufferingMethodImplementedHere: false as const,
    },
  };
}

function buildBlocked(blockers: string[], professionalReview = false, warnings: string[] = []) {
  return {
    ruleId: SOYBEAN_LIMING_RS_SC_2025_RULE_ID,
    ruleStatus: "READY_FOR_IMPLEMENTATION" as const,
    contextReady: false,
    decision: professionalReview ? "BLOCKED_PROFESSIONAL_REVIEW" as const : "BLOCKED_CONTEXT" as const,
    automaticDoseAllowed: false,
    recommendedDoseTonHaPrnt100: null,
    rawSmpDoseTonHaPrnt100: null,
    applicationMode: null as ApplicationMode,
    incorporatedDepthCm: null as { from: number; to: number } | null,
    surfaceCapApplied: false,
    blockers: unique(blockers),
    warnings: unique(warnings),
    reason: null,
    source: SOURCE,
    policy: {
      commercialPrntConversionAllowedHere: false as const,
      productSelectionAllowedHere: false as const,
      alternativeLowBufferingMethodImplementedHere: false as const,
    },
  };
}

function buildApply(input: {
  smpDose: number;
  multiplier: number;
  applicationMode: Exclude<ApplicationMode, null>;
  incorporatedDepthCm?: { from: number; to: number } | null;
  surfaceCapTonHaPrnt100?: number | null;
  warnings?: string[];
}) {
  const blockers: string[] = [];
  const warnings = [...(input.warnings ?? [])];

  // Se a tomada de decisão diz "calagem necessária", mas a tabela SMP retorna zero,
  // não publicamos dose zero. O próprio histórico técnico da soja alerta para solos de
  // baixo tamponamento em que SMP pode subestimar a necessidade; o método alternativo
  // deve ser homologado separadamente antes de virar cálculo automático.
  if (!(input.smpDose > 0)) {
    blockers.push("LIMING_NEEDED_BUT_SMP_TABLE_RETURNS_ZERO_ALTERNATIVE_METHOD_REQUIRED");
    return buildBlocked(blockers, true, warnings);
  }

  const scaled = input.smpDose * input.multiplier;
  const cap = input.surfaceCapTonHaPrnt100 ?? null;
  const surfaceCapApplied = cap !== null && scaled > cap;
  const recommended = cap !== null ? Math.min(scaled, cap) : scaled;
  if (surfaceCapApplied) warnings.push("SURFACE_APPLICATION_CAPPED_AT_5_T_HA_PRNT100");

  return {
    ruleId: SOYBEAN_LIMING_RS_SC_2025_RULE_ID,
    ruleStatus: "READY_FOR_IMPLEMENTATION" as const,
    contextReady: true,
    decision: "APPLY" as const,
    automaticDoseAllowed: true,
    recommendedDoseTonHaPrnt100: Math.round(recommended * 100) / 100,
    rawSmpDoseTonHaPrnt100: Math.round(input.smpDose * 100) / 100,
    applicationMode: input.applicationMode,
    incorporatedDepthCm: input.incorporatedDepthCm ?? null,
    surfaceCapApplied,
    blockers: [] as string[],
    warnings: unique(warnings),
    reason: null,
    source: SOURCE,
    policy: {
      commercialPrntConversionAllowedHere: false as const,
      productSelectionAllowedHere: false as const,
      alternativeLowBufferingMethodImplementedHere: false as const,
    },
  };
}

/**
 * Gate corrente de calagem da soja RS/SC segundo a Tabela 2.2 (2025).
 * A função decide necessidade, fração de SMP e modo de aplicação. A dose SMP
 * usa a tabela já auditada no `liming-engine`, cujos valores são os mesmos
 * reproduzidos na Tabela 2.3 da publicação 2025 (fonte CQFS-RS/SC 2016).
 *
 * Importante: o perfil 2025 mudou critérios operacionais frente a edições
 * antigas da recomendação de soja. Em SPD consolidado sem restrições usa 1/2
 * SMP para pH 6,0; no perfil com restrições em 10-20 cm a Tabela 2.2 atual usa
 * saturação por Al >=10%. Esses valores não devem ser substituídos por 1/4 SMP
 * ou 30% de Al de documentos antigos.
 */
export function evaluateSoybeanLimingRsSc2025(input: SoybeanLimingRsSc2025Input) {
  const commonBlockers: string[] = [];
  if (input.region === "OTHER") commonBlockers.push("LIMING_PROFILE_OUTSIDE_RS_SC");
  if (commonBlockers.length) return buildBlocked(commonBlockers);

  if (input.system === "CONVENTIONAL") {
    const blockers: string[] = [];
    if (!validPh(input.phWater0To20)) blockers.push("PH_WATER_0_20_MISSING_OR_INVALID");
    if (!validPercent(input.baseSaturation0To20Pct)) blockers.push("BASE_SATURATION_0_20_MISSING_OR_INVALID");
    if (!validPercent(input.aluminumSaturation0To20Pct)) blockers.push("AL_SATURATION_0_20_MISSING_OR_INVALID");
    if (!validSmp(input.smp0To20)) blockers.push("SMP_0_20_MISSING_OR_INVALID");
    if (blockers.length) return buildBlocked(blockers);

    const ph = input.phWater0To20 as number;
    const v = input.baseSaturation0To20Pct as number;
    const al = input.aluminumSaturation0To20Pct as number;
    if (ph >= 5.5) return buildNoApply("PH_WATER_AT_OR_ABOVE_5_5");
    if (noLimeExceptionByVAndAl(v, al)) {
      return buildNoApply("TABLE_2_2_EXCEPTION_V_AT_LEAST_65_AND_AL_BELOW_10");
    }

    return buildApply({
      smpDose: fullSmpDoseToPh6(input.smp0To20 as number),
      multiplier: 1,
      applicationMode: "INCORPORATED",
      incorporatedDepthCm: { from: 0, to: 20 },
      warnings: ["IF_P_OR_K_BELOW_CRITICAL_USE_SOIL_MOBILIZATION_TO_INCORPORATE_CORRECTION_FERTILIZATION"],
    });
  }

  if (input.system === "NO_TILL_ESTABLISHMENT") {
    const blockers: string[] = [];
    if (!validPh(input.phWater0To20)) blockers.push("PH_WATER_0_20_MISSING_OR_INVALID");
    if (!validSmp(input.smp0To20)) blockers.push("SMP_0_20_MISSING_OR_INVALID");
    if (blockers.length) return buildBlocked(blockers);

    if ((input.phWater0To20 as number) >= 5.5) return buildNoApply("PH_WATER_AT_OR_ABOVE_5_5");
    return buildApply({
      smpDose: fullSmpDoseToPh6(input.smp0To20 as number),
      multiplier: 1,
      applicationMode: "INCORPORATED",
      incorporatedDepthCm: { from: 0, to: 20 },
      warnings: ["IF_P_OR_K_BELOW_CRITICAL_USE_SOIL_MOBILIZATION_TO_INCORPORATE_CORRECTION_FERTILIZATION"],
    });
  }

  if (input.system === "NO_TILL_CONSOLIDATED_NO_10_20_RESTRICTIONS") {
    const blockers: string[] = [];
    if (input.noRestrictions10To20Confirmed !== true) blockers.push("ABSENCE_OF_10_20_RESTRICTIONS_NOT_CONFIRMED");
    if (!validPh(input.phWater0To10)) blockers.push("PH_WATER_0_10_MISSING_OR_INVALID");
    if (!validPercent(input.baseSaturation0To10Pct)) blockers.push("BASE_SATURATION_0_10_MISSING_OR_INVALID");
    if (!validPercent(input.aluminumSaturation0To10Pct)) blockers.push("AL_SATURATION_0_10_MISSING_OR_INVALID");
    if (!validSmp(input.smp0To10)) blockers.push("SMP_0_10_MISSING_OR_INVALID");
    if (blockers.length) return buildBlocked(blockers);

    const ph = input.phWater0To10 as number;
    const v = input.baseSaturation0To10Pct as number;
    const al = input.aluminumSaturation0To10Pct as number;
    if (ph >= 5.5) return buildNoApply("PH_WATER_AT_OR_ABOVE_5_5");
    if (noLimeExceptionByVAndAl(v, al)) {
      return buildNoApply("TABLE_2_2_EXCEPTION_V_AT_LEAST_65_AND_AL_BELOW_10");
    }

    return buildApply({
      smpDose: fullSmpDoseToPh6(input.smp0To10 as number),
      multiplier: 0.5,
      applicationMode: "SURFACE",
      surfaceCapTonHaPrnt100: 5,
    });
  }

  const blockers: string[] = [];
  if (!validPh(input.phWater10To20)) blockers.push("PH_WATER_10_20_MISSING_OR_INVALID");
  if (!validPercent(input.aluminumSaturation10To20Pct)) blockers.push("AL_SATURATION_10_20_MISSING_OR_INVALID");
  if (!validSmp(input.smp0To10)) blockers.push("SMP_0_10_MISSING_OR_INVALID");
  if (!validSmp(input.smp10To20)) blockers.push("SMP_10_20_MISSING_OR_INVALID");

  const assessment = input.restrictionAssessment;
  if (!assessment) {
    blockers.push("RESTRICTION_ASSESSMENT_10_20_MISSING");
  } else {
    if (typeof assessment.yieldBelowLocalAverageEspeciallyInDrought !== "boolean") {
      blockers.push("YIELD_RESTRICTION_10_20_NOT_ASSESSED");
    }
    if (typeof assessment.compactionRestrictsRootGrowthAtDepth !== "boolean") {
      blockers.push("COMPACTION_RESTRICTION_10_20_NOT_ASSESSED");
    }
    if (typeof assessment.phosphorus10To20BelowCritical !== "boolean") {
      blockers.push("PHOSPHORUS_RESTRICTION_10_20_NOT_ASSESSED");
    }
  }
  if (blockers.length) return buildBlocked(blockers);

  const ph = input.phWater10To20 as number;
  const al = input.aluminumSaturation10To20Pct as number;
  if (ph >= 5.5) return buildNoApply("PH_WATER_10_20_AT_OR_ABOVE_5_5");
  if (al < 10) return buildNoApply("AL_SATURATION_10_20_BELOW_10");

  if (assessment?.agronomistConfirmedIncorporationDecision !== true) {
    return buildBlocked(["INCORPORATION_DECISION_REQUIRES_AGRONOMIST_CONFIRMATION"], true, [
      "TABLE_2_2_REQUIRES_CONTEXTUAL_REVIEW_OF_YIELD_COMPACTION_AND_P_10_20",
    ]);
  }

  const averageSmp = ((input.smp0To10 as number) + (input.smp10To20 as number)) / 2;
  const warnings = ["INCORPORATION_CAN_INCREASE_EROSION_RISK_AND_REQUIRES_CONSERVATION_REVIEW"];
  if (assessment.phosphorus10To20BelowCritical) {
    warnings.push("P_10_20_BELOW_CRITICAL_CORRECTION_FERTILIZATION_WITH_INCORPORATION_SHOULD_BE_CONSIDERED");
  }

  return buildApply({
    smpDose: fullSmpDoseToPh6(averageSmp),
    multiplier: 1,
    applicationMode: "INCORPORATED",
    incorporatedDepthCm: { from: 0, to: 20 },
    warnings,
  });
}
