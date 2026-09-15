export type SoybeanGypsumRegion = "RS" | "SC" | "OTHER";
export type SoybeanGypsumManagement = "NO_TILL" | "OTHER" | "UNKNOWN";
export type SoybeanGypsumLayer = "20_40_CM" | "OTHER" | "UNKNOWN";
export type SoybeanGypsumWaterContext = "DEFICIT_PRESENT" | "NO_DEFICIT" | "UNKNOWN";
export type SoybeanGypsumSoilOrder = "OXISOL" | "ULTISOL" | "LOWLAND_SOIL" | "OTHER" | "UNKNOWN";
export type SoybeanGypsumMgStatus = "LOW" | "ADEQUATE" | "UNKNOWN";

export type SoybeanGypsumResponseClass =
  | "HIGH_RESPONSE_CONTEXT"
  | "LOW_OR_NULL_RESPONSE_CONTEXT"
  | "INTERMEDIATE_REVIEW_CONTEXT"
  | "INSUFFICIENT_CONTEXT"
  | "OUTSIDE_REGIONAL_PROFILE";

export type SoybeanGypsumInput = {
  region: SoybeanGypsumRegion;
  managementSystem: SoybeanGypsumManagement;
  diagnosticLayer: SoybeanGypsumLayer;
  alSaturationPct: number | null;
  alSaturationSourceValidated: boolean;
  exchangeableCaCmolcDm3?: number | null;
  waterContext: SoybeanGypsumWaterContext;
  soilOrder: SoybeanGypsumSoilOrder;
  clayPct: number | null;
  surfaceMagnesiumStatus: SoybeanGypsumMgStatus;
  limingCompletedBeforeGypsum: boolean | null;
};

const RULE_ID = "GYPSUM-SOYBEAN-RS-SC-2025" as const;
const REGIONAL_SOURCE_URL = "https://www.alice.cnptia.embrapa.br/alice/handle/doc/1183120";
const META_DOI = "10.1002/agj2.20125";

function finiteRange(value: number | null | undefined, min: number, max: number) {
  return typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;
}

function round(value: number, decimals = 2) {
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function unique(values: string[]) {
  return [...new Set(values)];
}

/**
 * Pacote de revisão para gessagem de soja em RS/SC.
 *
 * Fonte normativa regional corrente: Indicações Técnicas da 44ª Reunião de Pesquisa de Soja
 * da Região Sul (2025), seção 2.4. A meta-análise de Pias et al. (2020) é mantida como
 * evidência científica de apoio, sem apagar diferenças de métrica entre as fontes.
 *
 * IMPORTANTE: esta função NÃO prescreve gesso. Ela classifica o contexto, reproduz referências
 * publicadas e mantém a dose oficial nula até homologação profissional explícita.
 */
export function buildSoybeanGypsumRsSc2025Review(input: SoybeanGypsumInput) {
  const blockers: string[] = [];
  const warnings: string[] = [];

  if (input.region === "OTHER") blockers.push("REGIONAL_PROFILE_OUTSIDE_RS_SC");

  if (input.managementSystem === "UNKNOWN") blockers.push("MANAGEMENT_SYSTEM_MISSING");
  else if (input.managementSystem !== "NO_TILL") blockers.push("OUTSIDE_NO_TILL_EVIDENCE_DOMAIN");

  if (input.diagnosticLayer === "UNKNOWN") blockers.push("DIAGNOSTIC_LAYER_MISSING");
  else if (input.diagnosticLayer !== "20_40_CM") blockers.push("DIAGNOSTIC_LAYER_NOT_20_40_CM");

  if (!finiteRange(input.alSaturationPct, 0, 100)) blockers.push("AL_SATURATION_MISSING_OR_INVALID");
  if (!input.alSaturationSourceValidated) blockers.push("AL_SATURATION_SOURCE_NOT_VALIDATED");
  if (input.waterContext === "UNKNOWN") blockers.push("WATER_CONTEXT_MISSING");

  if (input.limingCompletedBeforeGypsum === null) blockers.push("LIMING_PREREQUISITE_UNKNOWN");
  else if (input.limingCompletedBeforeGypsum === false) blockers.push("LIMING_MUST_PRECEDE_GYPSUM");

  if (input.clayPct !== null && !finiteRange(input.clayPct, 0, 100)) blockers.push("CLAY_PCT_INVALID");
  if (input.clayPct === null) blockers.push("CLAY_PCT_MISSING_FOR_DOSE_REFERENCE");

  if (input.soilOrder === "LOWLAND_SOIL") {
    warnings.push("LOWLAND_SOIL_HAS_HIGHER_EVIDENCE_UNCERTAINTY");
  } else if (input.soilOrder === "UNKNOWN") {
    warnings.push("SOIL_ORDER_UNKNOWN");
  }

  if (input.clayPct !== null && input.clayPct < 15 && input.surfaceMagnesiumStatus === "LOW") {
    blockers.push("LOW_CLAY_LOW_MAGNESIUM_NEGATIVE_RESPONSE_RISK");
  } else if (input.surfaceMagnesiumStatus === "LOW") {
    warnings.push("LOW_MAGNESIUM_LEACHING_OR_DEFICIENCY_RISK");
  } else if (input.surfaceMagnesiumStatus === "UNKNOWN") {
    warnings.push("SURFACE_MAGNESIUM_STATUS_UNKNOWN");
  }

  if (input.exchangeableCaCmolcDm3 !== undefined && input.exchangeableCaCmolcDm3 !== null) {
    if (!Number.isFinite(input.exchangeableCaCmolcDm3) || input.exchangeableCaCmolcDm3 < 0) {
      blockers.push("SUBSURFACE_CA_INVALID");
    }
  }

  const outsideDomain = blockers.some((blocker) =>
    blocker === "REGIONAL_PROFILE_OUTSIDE_RS_SC" ||
    blocker === "OUTSIDE_NO_TILL_EVIDENCE_DOMAIN" ||
    blocker === "DIAGNOSTIC_LAYER_NOT_20_40_CM",
  );
  const missingCritical = blockers.some((blocker) =>
    blocker.includes("MISSING") ||
    blocker.includes("NOT_VALIDATED") ||
    blocker.includes("UNKNOWN") ||
    blocker.endsWith("_INVALID"),
  );

  let responseClass: SoybeanGypsumResponseClass;
  let responseCriterion: string | null = null;
  let regionalProbabilityPositiveResponsePct: number | null = null;
  let metaAnalysisProbabilityPositiveResponsePct: number | null = null;
  let averageYieldIncreasePct: number | null = null;

  if (outsideDomain) {
    responseClass = "OUTSIDE_REGIONAL_PROFILE";
  } else if (missingCritical) {
    responseClass = "INSUFFICIENT_CONTEXT";
  } else {
    const al = input.alSaturationPct!;

    if (al < 5) {
      responseClass = "LOW_OR_NULL_RESPONSE_CONTEXT";
      responseCriterion = "Saturação por Al <5% em 20-40 cm: a indicação regional 2025 considera muito baixa ou nula a probabilidade de resposta para mitigação de toxidez por Al.";
    } else if (input.waterContext === "DEFICIT_PRESENT" && al > 10) {
      responseClass = "HIGH_RESPONSE_CONTEXT";
      regionalProbabilityPositiveResponsePct = 97;
      metaAnalysisProbabilityPositiveResponsePct = 88;
      averageYieldIncreasePct = 12;
      responseCriterion = "Déficit hídrico + saturação por Al >10% em 20-40 cm atende ao contexto de maior resposta descrito para soja.";
      warnings.push("POSITIVE_RESPONSE_PROBABILITY_DIFFERS_BY_SOURCE_METRIC");
    } else if (input.waterContext === "NO_DEFICIT" && al > 40) {
      responseClass = "HIGH_RESPONSE_CONTEXT";
      regionalProbabilityPositiveResponsePct = 40;
      averageYieldIncreasePct = 5;
      responseCriterion = "Sem deficiência hídrica + saturação por Al >40% em 20-40 cm atende ao contexto regional de resposta mais restrito.";
    } else {
      responseClass = "INTERMEDIATE_REVIEW_CONTEXT";
      responseCriterion = "O contexto não atinge um limiar regional de maior resposta com segurança suficiente; exige interpretação profissional.";
    }
  }

  const clayFormulaReferenceKgHa = input.clayPct === null || !finiteRange(input.clayPct, 0, 100)
    ? null
    : round(input.clayPct * 50, 0);

  const oxisolPublishedRangeKgHa = input.soilOrder === "OXISOL"
    ? { min: 2000, max: 3000, statedTarget: "UP_TO_95_PERCENT_MAXIMUM_YIELD" as const }
    : null;

  warnings.push("GYPSUM_DOES_NOT_REPLACE_LIMING");
  warnings.push("CLAY_X_50_IS_REFERENCE_NOT_AUTOMATIC_PRESCRIPTION");
  warnings.push("OXISOL_2_TO_3_T_HA_RANGE_IS_STUDY_SYNTHESIS_NOT_SITE_GUARANTEE");

  return {
    ruleId: RULE_ID,
    ruleStatus: "REQUIRES_AGRONOMIST_REVIEW" as const,
    source: {
      title: "Indicações técnicas para a cultura da soja no Rio Grande do Sul e em Santa Catarina, safras 2025/2026 e 2026/2027",
      year: 2025,
      locator: "seção 2.4 Gessagem, pp.30-31",
      url: REGIONAL_SOURCE_URL,
      supportingMetaAnalysisDoi: META_DOI,
      supportingMetaAnalysisYear: 2020,
    },
    responseClass,
    responseCriterion,
    evidenceObservation: {
      regionalProbabilityPositiveResponsePct,
      metaAnalysisProbabilityPositiveResponsePct,
      averageYieldIncreasePct,
      probabilityMetricConflictPreserved:
        regionalProbabilityPositiveResponsePct !== null &&
        metaAnalysisProbabilityPositiveResponsePct !== null &&
        regionalProbabilityPositiveResponsePct !== metaAnalysisProbabilityPositiveResponsePct,
      nature: "GROUP_EVIDENCE_NOT_SITE_GUARANTEE" as const,
    },
    doseEvidence: {
      clayFormulaReferenceKgHa,
      formula: "clay_pct_x_50_kg_ha" as const,
      oxisolPublishedRangeKgHa,
      automaticDoseKgHa: null,
      automaticPrescriptionAllowed: false as const,
    },
    blockers: unique(blockers),
    warnings: unique(warnings),
    safety: {
      limingMustPrecedeGypsum: true as const,
      lowClayLowMgHardBlock:
        input.clayPct !== null && input.clayPct < 15 && input.surfaceMagnesiumStatus === "LOW",
      professionalReviewRequired: true as const,
      applicationBlocked: blockers.length > 0,
      gypsumSubstitutesLime: false as const,
    },
  };
}
