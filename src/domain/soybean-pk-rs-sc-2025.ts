import { SOJA_DOSE_TABLE, type GrainDoseTable, type SoilNutrientLevel } from "./fertilizer-dose-engine.ts";

export const SOYBEAN_PK_RS_SC_2025_RULE_ID = "PK-SOJA-RS-SC-2025" as const;
export const SOYBEAN_PK_RS_SC_2025_SOURCE_URL =
  "https://www.alice.cnptia.embrapa.br/alice/bitstream/doc/1183120/1/Indicacoes2025.pdf";

const SOYBEAN_PK_RS_SC_2025_SOURCE =
  "Indicações técnicas para a cultura da soja no Rio Grande do Sul e em Santa Catarina, safras 2025/2026 e 2026/2027, 44ª Reunião de Pesquisa de Soja da Região Sul (2025), item 2.5.2, pp.37-44, Tabelas 2.4-2.8. As Tabelas 2.4, 2.5, 2.7 e 2.8 declaram CQFS-RS/SC (2016) como fonte; a edição regional 2025 mantém os valores de dose e adiciona orientações operacionais atuais.";

/**
 * Perfil corrente da soja RS/SC. Os números da Tabela 2.8 de 2025 são
 * idênticos aos já preservados no perfil histórico CQFS 2016, portanto não
 * reescrevemos o objeto histórico. Este alias versionado troca somente a
 * proveniência corrente usada em novas decisões.
 */
export const SOJA_RS_SC_2025_DOSE_TABLE: GrainDoseTable = Object.freeze({
  ...SOJA_DOSE_TABLE,
  p2o5: { ...SOJA_DOSE_TABLE.p2o5 },
  k2o: { ...SOJA_DOSE_TABLE.k2o },
  source: SOYBEAN_PK_RS_SC_2025_SOURCE,
});

export type SoybeanPkRegion = "RS" | "SC" | "OTHER";
export type SoybeanPkAnalyticalMethod = "MEHLICH_1" | "MEHLICH_3" | "OTHER_OR_UNKNOWN";
export type SoybeanPkNutrient = "P" | "K";

function finiteNonNegative(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function unique(values: string[]) {
  return [...new Set(values)];
}

/**
 * Conversão explicitamente publicada na edição 2025, p.42. Não inferimos o
 * método do laboratório: o chamador precisa declarar MEHLICH_1 ou MEHLICH_3.
 * P por Mehlich-3 exige argila pelo método do densímetro, pois a equação usa
 * esse valor. K por Mehlich-3 usa o fator fixo 0,83.
 */
export function convertSoybeanPkToMehlich1RsSc2025(input: {
  region: SoybeanPkRegion;
  nutrient: SoybeanPkNutrient;
  method: SoybeanPkAnalyticalMethod;
  valueMgDm3: number | null | undefined;
  clayPctByHydrometer?: number | null;
}) {
  const blockers: string[] = [];
  if (input.region === "OTHER") blockers.push("PK_PROFILE_OUTSIDE_RS_SC");
  if (!finiteNonNegative(input.valueMgDm3)) blockers.push("PK_VALUE_MISSING_OR_INVALID");
  if (input.method === "OTHER_OR_UNKNOWN") blockers.push("PK_ANALYTICAL_METHOD_UNSUPPORTED");

  if (blockers.length) {
    return {
      ready: false,
      blockers: unique(blockers),
      valueMehlich1MgDm3: null,
      conversionApplied: false,
      equation: null,
      source: SOYBEAN_PK_RS_SC_2025_SOURCE,
    };
  }

  const value = input.valueMgDm3 as number;
  if (input.method === "MEHLICH_1") {
    return {
      ready: true,
      blockers: [] as string[],
      valueMehlich1MgDm3: value,
      conversionApplied: false,
      equation: "IDENTITY_MEHLICH_1" as const,
      source: SOYBEAN_PK_RS_SC_2025_SOURCE,
    };
  }

  if (input.nutrient === "K") {
    return {
      ready: true,
      blockers: [] as string[],
      valueMehlich1MgDm3: Math.round(value * 0.83 * 1000) / 1000,
      conversionApplied: true,
      equation: "KM1=KM3*0.83" as const,
      source: SOYBEAN_PK_RS_SC_2025_SOURCE,
    };
  }

  const clay = input.clayPctByHydrometer;
  if (!finiteNonNegative(clay) || clay > 100) {
    return {
      ready: false,
      blockers: ["P_MEHLICH3_REQUIRES_VALID_CLAY_BY_HYDROMETER"],
      valueMehlich1MgDm3: null,
      conversionApplied: false,
      equation: "PM1=PM3/[2.0-(0.02*clay)]" as const,
      source: SOYBEAN_PK_RS_SC_2025_SOURCE,
    };
  }

  const denominator = 2 - (0.02 * clay);
  if (!(denominator > 0)) {
    return {
      ready: false,
      blockers: ["P_MEHLICH3_CONVERSION_DENOMINATOR_NOT_POSITIVE"],
      valueMehlich1MgDm3: null,
      conversionApplied: false,
      equation: "PM1=PM3/[2.0-(0.02*clay)]" as const,
      source: SOYBEAN_PK_RS_SC_2025_SOURCE,
    };
  }

  return {
    ready: true,
    blockers: [] as string[],
    valueMehlich1MgDm3: Math.round((value / denominator) * 1000) / 1000,
    conversionApplied: true,
    equation: "PM1=PM3/[2.0-(0.02*clay)]" as const,
    source: SOYBEAN_PK_RS_SC_2025_SOURCE,
  };
}

export type SoybeanPkCorrectionMode = "GRADUAL" | "TOTAL";

/**
 * A publicação 2025 mantém duas estratégias de correção. A RAIZ não escolhe
 * TOTAL automaticamente porque o texto condiciona essa opção também à
 * disponibilidade financeira/relação de troca. Esta função apenas decide se
 * o contexto agronômico permite que TOTAL seja considerado em revisão.
 */
export function evaluateSoybeanPkCorrectionStrategyRsSc2025(input: {
  region: SoybeanPkRegion;
  soilLevel: SoilNutrientLevel;
  requestedMode: SoybeanPkCorrectionMode;
  clayPct: number | null | undefined;
  ctcPh7CmolcDm3: number | null | undefined;
  economicContextReviewed: boolean;
}) {
  const blockers: string[] = [];
  const warnings: string[] = [];

  if (input.region === "OTHER") blockers.push("PK_PROFILE_OUTSIDE_RS_SC");
  if (input.requestedMode === "TOTAL") {
    if (input.soilLevel !== "Muito Baixo" && input.soilLevel !== "Baixo") {
      blockers.push("TOTAL_CORRECTION_ONLY_FOR_VERY_LOW_OR_LOW");
    }
    if (!finiteNonNegative(input.clayPct) || !finiteNonNegative(input.ctcPh7CmolcDm3)) {
      blockers.push("TOTAL_CORRECTION_REQUIRES_CLAY_AND_CTC");
    } else if (input.clayPct < 20 || input.ctcPh7CmolcDm3 < 7.5) {
      blockers.push("TOTAL_CORRECTION_AVOID_SANDY_OR_LOW_CTC");
    }
    if (!input.economicContextReviewed) {
      blockers.push("TOTAL_CORRECTION_REQUIRES_ECONOMIC_REVIEW");
    }
  } else if (input.soilLevel === "Muito Baixo" || input.soilLevel === "Baixo" || input.soilLevel === "Médio") {
    warnings.push("GRADUAL_CORRECTION_SUPPORTED_BY_CURRENT_PROFILE");
  }

  return {
    allowedForProfessionalPlan: blockers.length === 0,
    automaticModeSelectionAllowed: false as const,
    blockers: unique(blockers),
    warnings: unique(warnings),
    source: SOYBEAN_PK_RS_SC_2025_SOURCE,
  };
}

export type SoybeanPkFurrowPlacement =
  | "OFFSET_5_CM_BELOW_AND_5_CM_SIDE_CONFIRMED"
  | "NO_OFFSET_OR_UNKNOWN"
  | "NOT_APPLIED_IN_FURROW";

/**
 * Gate de segurança da aplicação no sulco (p.40). Quando a semeadora não
 * permite afastar o fertilizante da semente, a fonte limita a 120 kg/ha de
 * P2O5 e 80 kg/ha de K2O na linha; o restante deve ser deslocado para
 * cultivos posteriores. Isto é limite de POSICIONAMENTO, não mudança da
 * necessidade agronômica total calculada.
 */
export function evaluateSoybeanPkFurrowPlacementRsSc2025(input: {
  region: SoybeanPkRegion;
  placement: SoybeanPkFurrowPlacement;
  plannedP2O5KgHa: number | null | undefined;
  plannedK2OKgHa: number | null | undefined;
}) {
  const blockers: string[] = [];
  const warnings: string[] = [];
  if (input.region === "OTHER") blockers.push("PK_PROFILE_OUTSIDE_RS_SC");
  if (!finiteNonNegative(input.plannedP2O5KgHa)) blockers.push("P2O5_PLANNED_DOSE_INVALID");
  if (!finiteNonNegative(input.plannedK2OKgHa)) blockers.push("K2O_PLANNED_DOSE_INVALID");

  if (blockers.length === 0 && input.placement === "NO_OFFSET_OR_UNKNOWN") {
    if ((input.plannedP2O5KgHa as number) > 120) blockers.push("FURROW_P2O5_EXCEEDS_120_WITHOUT_SAFE_OFFSET");
    if ((input.plannedK2OKgHa as number) > 80) blockers.push("FURROW_K2O_EXCEEDS_80_WITHOUT_SAFE_OFFSET");
    warnings.push("REMAINDER_SHOULD_BE_MOVED_TO_LATER_CROPS_WHEN_CAP_IS_EXCEEDED");
  }

  if (input.placement === "OFFSET_5_CM_BELOW_AND_5_CM_SIDE_CONFIRMED") {
    warnings.push("CURRENT_PROFILE_ALLOWS_INTEGRAL_FURROW_APPLICATION_WITH_CONFIRMED_5X5_OFFSET");
  }

  return {
    placementAllowed: blockers.length === 0,
    blockers: unique(blockers),
    warnings: unique(warnings),
    limitsWithoutSafeOffsetKgHa: { P2O5: 120, K2O: 80 },
    source: SOYBEAN_PK_RS_SC_2025_SOURCE,
  };
}

/**
 * A p.43 admite variações de ±10 kg/ha nas quantidades da Tabela 2.8 para
 * acomodar formulações disponíveis. A RAIZ só aceita essa flexibilidade se a
 * restrição comercial estiver documentada; ela NÃO amplia silenciosamente o
 * validador central de dose e não autoriza a IA a escolher qualquer número.
 */
export function evaluateSoybeanPkMarketAdjustmentRsSc2025(input: {
  deterministicDoseKgHa: number;
  proposedDoseKgHa: number;
  commercialFormulationConstraintDocumented: boolean;
}) {
  const validNumbers = Number.isFinite(input.deterministicDoseKgHa)
    && input.deterministicDoseKgHa >= 0
    && Number.isFinite(input.proposedDoseKgHa)
    && input.proposedDoseKgHa >= 0;
  const differenceKgHa = validNumbers
    ? Math.round((input.proposedDoseKgHa - input.deterministicDoseKgHa) * 1000) / 1000
    : null;
  const withinPublishedAdjustment = differenceKgHa !== null && Math.abs(differenceKgHa) <= 10;

  return {
    allowed: validNumbers && input.commercialFormulationConstraintDocumented && withinPublishedAdjustment,
    differenceKgHa,
    publishedAdjustmentKgHa: 10,
    requiresCommercialFormulationContext: true as const,
    automaticAiAdjustmentAllowed: false as const,
    blocker: !validNumbers
      ? "PK_MARKET_ADJUSTMENT_INVALID_DOSE"
      : !input.commercialFormulationConstraintDocumented
        ? "PK_MARKET_ADJUSTMENT_REQUIRES_DOCUMENTED_FORMULATION_CONSTRAINT"
        : !withinPublishedAdjustment
          ? "PK_MARKET_ADJUSTMENT_EXCEEDS_PLUS_MINUS_10"
          : null,
    source: SOYBEAN_PK_RS_SC_2025_SOURCE,
  };
}

export const SOYBEAN_PK_RS_SC_2025_POLICY = Object.freeze({
  ruleId: SOYBEAN_PK_RS_SC_2025_RULE_ID,
  referenceYieldTonPerHa: 3,
  extraPerTonKgHa: { P2O5: 15, K2O: 25 },
  maintenanceAtReferenceYieldKgHa: { P2O5: 45, K2O: 75 },
  totalCorrectionReferenceKgHa: {
    "Muito Baixo": { P2O5: 160, K2O: 120 },
    Baixo: { P2O5: 80, K2O: 60 },
    Médio: { P2O5: 40, K2O: 30 },
  },
  totalCorrectionAutomaticSelectionAllowed: false,
  marketAdjustmentAutomaticWithoutContextAllowed: false,
  source: SOYBEAN_PK_RS_SC_2025_SOURCE,
});
