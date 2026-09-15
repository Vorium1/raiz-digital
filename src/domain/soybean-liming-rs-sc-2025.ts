import { computeLimingDoseBySmpIndex } from "./liming-engine.ts";

export const SOYBEAN_LIMING_RS_SC_2025_SOURCE_URL =
  "https://www.alice.cnptia.embrapa.br/alice/bitstream/doc/1183120/1/Indicacoes2025.pdf";

export const SOYBEAN_LIMING_RS_SC_2025_MINUTES_URL =
  "https://www.infoteca.cnptia.embrapa.br/infoteca/bitstream/doc/1183119/1/Atas-e-Resumos-2025.pdf";

export const SOYBEAN_LIMING_RULE_IDS = Object.freeze({
  conventional: "LIMING-SOYBEAN-RS-SC-2025-CONVENTIONAL",
  noTillEstablishment: "LIMING-SOYBEAN-RS-SC-2025-NO-TILL-ESTABLISHMENT",
  noTillConsolidated: "LIMING-SOYBEAN-RS-SC-2025-NO-TILL-CONSOLIDATED",
} as const);

const SOURCE = Object.freeze({
  title: "Indicações técnicas para a cultura da soja no Rio Grande do Sul e em Santa Catarina, safras 2025/2026 e 2026/2027",
  institution: "44ª Reunião de Pesquisa de Soja da Região Sul / Embrapa Trigo / Universidade de Passo Fundo",
  year: 2025,
  locator: "item 2.3, pp.22-29; Tabelas 2.2 e 2.3",
  url: SOYBEAN_LIMING_RS_SC_2025_SOURCE_URL,
});

const OFFICIAL_MINUTES_CLARIFICATION = Object.freeze({
  title: "44ª Reunião de Pesquisa de Soja da Região Sul — Atas e Resumos 2025",
  institution: "44ª Reunião de Pesquisa de Soja da Região Sul / Embrapa Trigo",
  year: 2025,
  locator: "item 7.4, Atualizações das indicações técnicas — Capítulo 2, Calagem e adubação",
  url: SOYBEAN_LIMING_RS_SC_2025_MINUTES_URL,
  resolves: [
    "NO_TILL_CONSOLIDATED_NO_RESTRICTIONS_HALF_SMP_PH6",
    "NO_TILL_CONSOLIDATED_WITH_RESTRICTIONS_AL_THRESHOLD_10_PCT",
  ] as const,
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
  yearsSinceLastLiming?: number | null;
  restrictionAssessment?: SoybeanLimingRestrictionAssessment | null;
};

type ApplicationMode = "INCORPORATED" | "SURFACE" | null;
type RuleStatus = "READY_FOR_IMPLEMENTATION" | "REQUIRES_AGRONOMIST_REVIEW";
type Decision =
  | "APPLY"
  | "DO_NOT_APPLY"
  | "BLOCKED_CONTEXT"
  | "BLOCKED_SOURCE_CONFLICT"
  | "BLOCKED_SOURCE_DOMAIN"
  | "BLOCKED_PROFESSIONAL_REVIEW";

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
function fullSmpDoseToPh6(smp: number) {
  return computeLimingDoseBySmpIndex(smp, "6.0").doseTonPerHaPrnt100;
}

function ruleFor(system: SoybeanLimingSystem) {
  if (system === "CONVENTIONAL") return { ruleId: SOYBEAN_LIMING_RULE_IDS.conventional, status: "READY_FOR_IMPLEMENTATION" as RuleStatus };
  if (system === "NO_TILL_ESTABLISHMENT") return { ruleId: SOYBEAN_LIMING_RULE_IDS.noTillEstablishment, status: "READY_FOR_IMPLEMENTATION" as RuleStatus };
  if (system === "NO_TILL_CONSOLIDATED_NO_10_20_RESTRICTIONS") {
    return { ruleId: SOYBEAN_LIMING_RULE_IDS.noTillConsolidated, status: "READY_FOR_IMPLEMENTATION" as RuleStatus };
  }
  return { ruleId: SOYBEAN_LIMING_RULE_IDS.noTillConsolidated, status: "REQUIRES_AGRONOMIST_REVIEW" as RuleStatus };
}

function resultBase(system: SoybeanLimingSystem) {
  const rule = ruleFor(system);
  return {
    ruleId: rule.ruleId,
    ruleStatus: rule.status,
    source: SOURCE,
    sourceClarifications: [OFFICIAL_MINUTES_CLARIFICATION],
    policy: {
      commercialPrntConversionAllowedHere: false as const,
      productSelectionAllowedHere: false as const,
      sourceConflictCanBeAutoResolved: false as const,
      sourceDomainGapCanBeAutoResolved: false as const,
      historicalResultMustNotBeRewritten: true as const,
    },
  };
}

function buildBlocked(
  system: SoybeanLimingSystem,
  blockers: string[],
  decision: Extract<Decision, "BLOCKED_CONTEXT" | "BLOCKED_SOURCE_CONFLICT" | "BLOCKED_SOURCE_DOMAIN" | "BLOCKED_PROFESSIONAL_REVIEW">,
  warnings: string[] = [],
  evidenceConflict: Record<string, unknown> | null = null,
) {
  return {
    ...resultBase(system),
    contextReady: false,
    decision,
    automaticDoseAllowed: false,
    recommendedDoseTonHaPrnt100: null,
    rawSmpDoseTonHaPrnt100: null,
    applicationMode: null as ApplicationMode,
    incorporatedDepthCm: null as { from: number; to: number } | null,
    surfaceCapApplied: false,
    blockers: unique(blockers),
    warnings: unique(warnings),
    evidenceConflict,
    reason: null,
  };
}

function buildNoApply(system: SoybeanLimingSystem, reason: string, warnings: string[] = []) {
  return {
    ...resultBase(system),
    contextReady: true,
    decision: "DO_NOT_APPLY" as Decision,
    automaticDoseAllowed: true,
    recommendedDoseTonHaPrnt100: 0,
    rawSmpDoseTonHaPrnt100: 0,
    applicationMode: null as ApplicationMode,
    incorporatedDepthCm: null as { from: number; to: number } | null,
    surfaceCapApplied: false,
    blockers: [] as string[],
    warnings: unique(warnings),
    evidenceConflict: null,
    reason,
  };
}

function buildApply(system: SoybeanLimingSystem, input: {
  smpDose: number;
  multiplier?: number;
  applicationMode: Exclude<ApplicationMode, null>;
  incorporatedDepthCm?: { from: number; to: number } | null;
  surfaceCapTonHaPrnt100?: number | null;
  warnings?: string[];
}) {
  if (!(input.smpDose > 0)) {
    return buildBlocked(
      system,
      ["LIMING_NEEDED_BUT_SMP_TABLE_RETURNS_ZERO_USE_LOW_BUFFERING_FORMULA_OR_REVIEW"],
      "BLOCKED_PROFESSIONAL_REVIEW",
      input.warnings,
    );
  }
  const multiplier = input.multiplier ?? 1;
  const scaled = input.smpDose * multiplier;
  const cap = input.surfaceCapTonHaPrnt100 ?? null;
  const surfaceCapApplied = cap !== null && scaled > cap;
  const recommended = cap === null ? scaled : Math.min(scaled, cap);
  const warnings = [...(input.warnings ?? [])];
  if (surfaceCapApplied) warnings.push("SURFACE_APPLICATION_CAPPED_AT_5_T_HA_PRNT100");
  return {
    ...resultBase(system),
    contextReady: true,
    decision: "APPLY" as Decision,
    automaticDoseAllowed: true,
    recommendedDoseTonHaPrnt100: Math.round(recommended * 100) / 100,
    rawSmpDoseTonHaPrnt100: Math.round(input.smpDose * 100) / 100,
    applicationMode: input.applicationMode,
    incorporatedDepthCm: input.incorporatedDepthCm ?? null,
    surfaceCapApplied,
    blockers: [] as string[],
    warnings: unique(warnings),
    evidenceConflict: null,
    reason: null,
  };
}

/**
 * Equações explicitadas no item 2.3.1 para solos de baixo poder tampão,
 * sobretudo arenosos, quando SMP indicar dose muito pequena apesar de pH baixo.
 * Retorna NC em t/ha para PRNT 100%. Valor matemático <=0 é tratado como
 * conflito de contexto, nunca como recomendação negativa/zero silenciosa.
 */
export function computeSoybeanLowBufferingLiming2025(input: {
  targetPh: "5.5" | "6.0";
  organicMatterPct: number;
  exchangeableAlCmolcDm3: number;
}) {
  if (!finite(input.organicMatterPct) || input.organicMatterPct < 0) throw new Error("ORGANIC_MATTER_INVALID");
  if (!finite(input.exchangeableAlCmolcDm3) || input.exchangeableAlCmolcDm3 < 0) throw new Error("EXCHANGEABLE_AL_INVALID");
  const raw = input.targetPh === "5.5"
    ? -0.653 + 0.480 * input.organicMatterPct + 1.937 * input.exchangeableAlCmolcDm3
    : -0.516 + 0.805 * input.organicMatterPct + 2.435 * input.exchangeableAlCmolcDm3;
  return {
    targetPh: input.targetPh,
    rawDoseTonHaPrnt100: Math.round(raw * 1000) / 1000,
    recommendedDoseTonHaPrnt100: raw > 0 ? Math.round(raw * 100) / 100 : null,
    ready: raw > 0,
    blocker: raw > 0 ? null : "LOW_BUFFERING_FORMULA_NON_POSITIVE_REVIEW_REQUIRED",
    source: { ...SOURCE, locator: "item 2.3.1, p.25: equações de NC para pH 5,5 e 6,0" },
  };
}

/** Ajuste algébrico da dose-base PRNT100 para um corretivo cujo PRNT foi medido/declarado. */
export function adjustSoybeanLimeDoseForPrnt2025(doseTonHaPrnt100: number, prntPct: number) {
  if (!finite(doseTonHaPrnt100) || doseTonHaPrnt100 < 0) throw new Error("LIME_DOSE_INVALID");
  if (!finite(prntPct) || prntPct <= 0) throw new Error("PRNT_INVALID");
  return Math.round((doseTonHaPrnt100 * 100 / prntPct) * 100) / 100;
}

function classifyConventionalVAl(v: number, al: number) {
  // O texto da seção 2.3.2 autoriza positivamente V<65 E Al>10; a nota (1)
  // da Tabela 2.2 define um caso negativo V>=65 E Al<10. A nota negativa não
  // é o inverso lógico da regra positiva. Quadrantes mistos e Al=10 ficam fora
  // do domínio explicitamente autorizado pela fonte e, por segurança, bloqueiam.
  if (v < 65 && al > 10) return "APPLY" as const;
  if (v >= 65 && al < 10) return "DO_NOT_APPLY" as const;
  return "UNSPECIFIED_SOURCE_DOMAIN" as const;
}

export function evaluateSoybeanLimingRsSc2025(input: SoybeanLimingRsSc2025Input) {
  const system = input.system;
  if (input.region === "OTHER") return buildBlocked(system, ["LIMING_PROFILE_OUTSIDE_RS_SC"], "BLOCKED_CONTEXT");

  if (system === "CONVENTIONAL") {
    const blockers: string[] = [];
    if (!validPh(input.phWater0To20)) blockers.push("PH_WATER_0_20_MISSING_OR_INVALID");
    if (!validPercent(input.baseSaturation0To20Pct)) blockers.push("BASE_SATURATION_0_20_MISSING_OR_INVALID");
    if (!validPercent(input.aluminumSaturation0To20Pct)) blockers.push("AL_SATURATION_0_20_MISSING_OR_INVALID");
    if (!validSmp(input.smp0To20)) blockers.push("SMP_0_20_MISSING_OR_INVALID");
    if (blockers.length) return buildBlocked(system, blockers, "BLOCKED_CONTEXT");
    if ((input.phWater0To20 as number) >= 5.5) return buildNoApply(system, "PH_WATER_AT_OR_ABOVE_5_5");
    const criteria = classifyConventionalVAl(input.baseSaturation0To20Pct as number, input.aluminumSaturation0To20Pct as number);
    if (criteria === "DO_NOT_APPLY") return buildNoApply(system, "V_AT_LEAST_65_AND_AL_BELOW_10");
    if (criteria === "UNSPECIFIED_SOURCE_DOMAIN") {
      return buildBlocked(
        system,
        ["V_AL_COMBINATION_NOT_EXPLICITLY_AUTHORIZED_BY_SOURCE"],
        "BLOCKED_SOURCE_DOMAIN",
        ["TABLE_2_2_NOTE_IS_ONE_WAY_NON_APPLICATION_EXCEPTION"],
      );
    }
    return buildApply(system, {
      smpDose: fullSmpDoseToPh6(input.smp0To20 as number),
      applicationMode: "INCORPORATED",
      incorporatedDepthCm: { from: 0, to: 20 },
      warnings: ["IF_P_OR_K_BELOW_CRITICAL_USE_CORRECTION_FERTILIZATION_WITH_INCORPORATION"],
    });
  }

  if (system === "NO_TILL_ESTABLISHMENT") {
    const blockers: string[] = [];
    if (!validPh(input.phWater0To20)) blockers.push("PH_WATER_0_20_MISSING_OR_INVALID");
    if (!validSmp(input.smp0To20)) blockers.push("SMP_0_20_MISSING_OR_INVALID");
    if (blockers.length) return buildBlocked(system, blockers, "BLOCKED_CONTEXT");
    if ((input.phWater0To20 as number) >= 5.5) return buildNoApply(system, "PH_WATER_AT_OR_ABOVE_5_5");
    return buildApply(system, {
      smpDose: fullSmpDoseToPh6(input.smp0To20 as number),
      applicationMode: "INCORPORATED",
      incorporatedDepthCm: { from: 0, to: 20 },
      warnings: ["FIELD_OR_NATURAL_GRASSLAND_PRECONDITION_MUST_MATCH_SOURCE_CONTEXT"],
    });
  }

  // A Ata oficial da 44ª RPSRS (item 7.4) resolve duas divergências editoriais
  // da publicação 2025: 1/2 SMP (e não 1/4) no SPD consolidado sem restrições,
  // e Al>=10% (e não 30%) no SPD consolidado com restrições. Já os quadrantes
  // V/Al mistos não são explicitamente autorizados pela fonte e permanecem
  // fail-closed como lacuna de domínio, não como conflito lógico entre trechos.
  if (finite(input.yearsSinceLastLiming) && (input.yearsSinceLastLiming as number) < 3) {
    return buildBlocked(system, ["RECENT_LIMING_CAN_MASK_SMP_RESPONSE_REVIEW_BEFORE_REAPPLICATION"], "BLOCKED_PROFESSIONAL_REVIEW", [
      "SECTION_2_3_3_NOTES_CORRECTIVE_MAY_TAKE_ABOUT_THREE_YEARS_TO_DISSOLVE_COMPLETELY",
    ]);
  }

  if (system === "NO_TILL_CONSOLIDATED_NO_10_20_RESTRICTIONS") {
    const blockers: string[] = [];
    if (input.noRestrictions10To20Confirmed !== true) blockers.push("ABSENCE_OF_10_20_RESTRICTIONS_NOT_CONFIRMED");
    if (!validPh(input.phWater0To10)) blockers.push("PH_WATER_0_10_MISSING_OR_INVALID");
    if (!validPercent(input.baseSaturation0To10Pct)) blockers.push("BASE_SATURATION_0_10_MISSING_OR_INVALID");
    if (!validPercent(input.aluminumSaturation0To10Pct)) blockers.push("AL_SATURATION_0_10_MISSING_OR_INVALID");
    if (!validSmp(input.smp0To10)) blockers.push("SMP_0_10_MISSING_OR_INVALID");
    if (blockers.length) return buildBlocked(system, blockers, "BLOCKED_CONTEXT");
    if ((input.phWater0To10 as number) >= 5.5) return buildNoApply(system, "PH_WATER_0_10_AT_OR_ABOVE_5_5");
    const criteria = classifyConventionalVAl(input.baseSaturation0To10Pct as number, input.aluminumSaturation0To10Pct as number);
    if (criteria === "DO_NOT_APPLY") return buildNoApply(system, "V_AT_LEAST_65_AND_AL_BELOW_10");
    if (criteria === "UNSPECIFIED_SOURCE_DOMAIN") {
      return buildBlocked(
        system,
        ["V_AL_COMBINATION_NOT_EXPLICITLY_AUTHORIZED_BY_SOURCE"],
        "BLOCKED_SOURCE_DOMAIN",
        ["TABLE_2_2_NOTE_IS_ONE_WAY_NON_APPLICATION_EXCEPTION"],
      );
    }
    return buildApply(system, {
      smpDose: fullSmpDoseToPh6(input.smp0To10 as number),
      multiplier: 0.5,
      applicationMode: "SURFACE",
      surfaceCapTonHaPrnt100: 5,
      warnings: ["OFFICIAL_44_RPSRS_MINUTES_RESOLVE_HALF_SMP_FOR_CONSOLIDATED_NO_RESTRICTIONS"],
    });
  }

  const blockers: string[] = [];
  if (!validPh(input.phWater10To20)) blockers.push("PH_WATER_10_20_MISSING_OR_INVALID");
  if (!validPercent(input.aluminumSaturation10To20Pct)) blockers.push("AL_SATURATION_10_20_MISSING_OR_INVALID");
  if (!validSmp(input.smp0To10)) blockers.push("SMP_0_10_MISSING_OR_INVALID");
  if (!validSmp(input.smp10To20)) blockers.push("SMP_10_20_MISSING_OR_INVALID");
  const assessment = input.restrictionAssessment;
  if (!assessment) blockers.push("RESTRICTION_ASSESSMENT_10_20_MISSING");
  else {
    if (typeof assessment.yieldBelowLocalAverageEspeciallyInDrought !== "boolean") blockers.push("YIELD_RESTRICTION_10_20_NOT_ASSESSED");
    if (typeof assessment.compactionRestrictsRootGrowthAtDepth !== "boolean") blockers.push("COMPACTION_RESTRICTION_10_20_NOT_ASSESSED");
    if (typeof assessment.phosphorus10To20BelowCritical !== "boolean") blockers.push("PHOSPHORUS_RESTRICTION_10_20_NOT_ASSESSED");
  }
  if (blockers.length) return buildBlocked(system, blockers, "BLOCKED_CONTEXT");
  if ((input.phWater10To20 as number) >= 5.5) return buildNoApply(system, "PH_WATER_10_20_AT_OR_ABOVE_5_5");
  const al = input.aluminumSaturation10To20Pct as number;
  if (al < 10) return buildNoApply(system, "AL_SATURATION_10_20_BELOW_10");

  if (assessment?.agronomistConfirmedIncorporationDecision !== true) {
    return buildBlocked(system, ["INCORPORATION_DECISION_REQUIRES_AGRONOMIST_CONFIRMATION"], "BLOCKED_PROFESSIONAL_REVIEW", [
      "REVIEW_YIELD_DROUGHT_COMPACTION_P_10_20_AND_EROSION_RISK",
      "OFFICIAL_44_RPSRS_MINUTES_RESOLVE_AL_THRESHOLD_AT_10_PCT",
    ]);
  }

  const averageSmp = ((input.smp0To10 as number) + (input.smp10To20 as number)) / 2;
  const applied = buildApply(system, {
    smpDose: fullSmpDoseToPh6(averageSmp),
    applicationMode: "INCORPORATED",
    incorporatedDepthCm: { from: 0, to: 20 },
    warnings: [
      "AGRONOMIST_CONFIRMED_INCORPORATION_DECISION",
      "OFFICIAL_44_RPSRS_MINUTES_RESOLVE_AL_THRESHOLD_AT_10_PCT",
      ...(assessment?.phosphorus10To20BelowCritical ? ["P_10_20_BELOW_CRITICAL_CONSIDER_CORRECTION_FERTILIZATION_WITH_INCORPORATION"] : []),
    ],
  });
  return {
    ...applied,
    reviewedSmpMean: Math.round(averageSmp * 1000) / 1000,
  };
}
