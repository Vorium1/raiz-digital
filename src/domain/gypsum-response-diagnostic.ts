export type GypsumCrop =
  | "MAIZE"
  | "WHEAT"
  | "WHITE_OAT"
  | "BARLEY"
  | "RICE"
  | "SOYBEAN";

export type GypsumResponseClass =
  | "HIGHER_RESPONSE_LIKELIHOOD"
  | "CRITERION_NOT_MET"
  | "INSUFFICIENT_CONTEXT"
  | "OUTSIDE_EVIDENCE_DOMAIN";

export type GypsumDiagnosticWarning =
  | "DOSE_NOT_HOMOLOGATED"
  | "SURFACE_MAGNESIUM_LOW"
  | "SURFACE_POTASSIUM_LOW"
  | "COARSE_ULTISOL_LOW_CEC_NEGATIVE_RESPONSE_RISK"
  | "SOYBEAN_WATER_DEFICIT_REQUIRED_BY_META_ANALYSIS"
  | "GYPSUM_IS_NOT_LIME"
  | "SULFUR_RESPONSE_CAN_CONFOUND_AMENDMENT_RESPONSE";

export type NutrientStatus = "LOW" | "ADEQUATE" | "UNKNOWN";

export type GypsumResponseDiagnosticInput = {
  crop: GypsumCrop;
  managementSystem: "NO_TILL" | "OTHER" | "UNKNOWN";
  diagnosticLayer: "20_40_CM" | "OTHER" | "UNKNOWN";
  alSaturationPct: number | null;
  alSaturationSourceValidated: boolean;
  waterDeficiency: boolean | null;
  surfaceMagnesiumStatus?: NutrientStatus;
  surfacePotassiumStatus?: NutrientStatus;
  sulfurStatus?: NutrientStatus;
  soilOrder?: "OXISOL" | "ULTISOL" | "OTHER" | "UNKNOWN";
  textureGroup?: "COARSE" | "MEDIUM" | "FINE" | "UNKNOWN";
  effectiveCecCmolcDm3?: number | null;
  lowSubsurfaceAcidityValidated?: boolean | null;
};

export type GypsumResponseDiagnostic = {
  responseClass: GypsumResponseClass;
  cropGroup: "CEREAL" | "SOYBEAN";
  criterion: {
    layer: "20_40_CM";
    alSaturationThresholdPct: 5 | 10;
    comparison: ">";
    requiresWaterDeficiency: boolean;
  };
  evidenceObservation: {
    positiveResponseProbabilityPct: { min: number; max: number } | null;
    averageYieldIncreasePct: number | null;
    statisticNature: "META_ANALYSIS_GROUP_OBSERVATION_NOT_SITE_PREDICTION";
  };
  warnings: GypsumDiagnosticWarning[];
  blockers: string[];
  gypsumDoseKgHa: null;
  gypsumDoseStatus: "BLOCKED_REQUIRES_SEPARATE_HOMOLOGATION";
  source: {
    ruleId: "GYPSUM-NT-RESPONSE-META-2020";
    title: "Does gypsum increase crop grain yield on no-tilled acid soils? A meta-analysis";
    doi: "10.1002/agj2.20125";
    year: 2020;
  };
  policy: {
    diagnosticOnly: true;
    yieldGuaranteeAllowed: false;
    automaticDoseAllowed: false;
    gypsumSubstitutesLime: false;
    professionalReviewRecommended: true;
  };
};

const CEREALS = new Set<GypsumCrop>(["MAIZE", "WHEAT", "WHITE_OAT", "BARLEY", "RICE"]);

function finiteNonNegative(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function unique<T extends string>(values: T[]): T[] {
  return [...new Set(values)];
}

/**
 * Diagnostic evidence gate derived from Pias et al. (2020), Agronomy Journal
 * 112:675-692, DOI 10.1002/agj2.20125.
 *
 * This function estimates whether the FIELD CONTEXT matches the conditions in
 * which the meta-analysis observed a higher probability of yield response. It
 * does not prescribe gypsum, does not calculate a dose, and does not guarantee
 * a yield response.
 */
export function evaluateGypsumResponseDiagnostic(
  input: GypsumResponseDiagnosticInput,
): GypsumResponseDiagnostic {
  const cropGroup: "CEREAL" | "SOYBEAN" = CEREALS.has(input.crop) ? "CEREAL" : "SOYBEAN";
  const threshold = cropGroup === "CEREAL" ? 5 : 10;
  const requiresWaterDeficiency = cropGroup === "SOYBEAN";
  const blockers: string[] = [];
  const warnings: GypsumDiagnosticWarning[] = ["DOSE_NOT_HOMOLOGATED", "GYPSUM_IS_NOT_LIME"];

  if (input.managementSystem === "UNKNOWN") blockers.push("MANAGEMENT_SYSTEM_MISSING");
  else if (input.managementSystem !== "NO_TILL") blockers.push("OUTSIDE_NO_TILL_EVIDENCE_DOMAIN");

  if (input.diagnosticLayer === "UNKNOWN") blockers.push("DIAGNOSTIC_LAYER_MISSING");
  else if (input.diagnosticLayer !== "20_40_CM") blockers.push("DIAGNOSTIC_LAYER_NOT_20_40_CM");

  if (!finiteNonNegative(input.alSaturationPct)) blockers.push("AL_SATURATION_MISSING_OR_INVALID");
  if (!input.alSaturationSourceValidated) blockers.push("AL_SATURATION_SOURCE_NOT_VALIDATED");

  if (cropGroup === "SOYBEAN" && input.waterDeficiency === null) {
    blockers.push("WATER_DEFICIENCY_CONTEXT_MISSING_FOR_SOYBEAN");
  }

  if (input.surfaceMagnesiumStatus === "LOW") warnings.push("SURFACE_MAGNESIUM_LOW");
  if (input.surfacePotassiumStatus === "LOW") warnings.push("SURFACE_POTASSIUM_LOW");
  if (input.sulfurStatus === "LOW") warnings.push("SULFUR_RESPONSE_CAN_CONFOUND_AMENDMENT_RESPONSE");

  if (
    input.soilOrder === "ULTISOL" &&
    input.textureGroup === "COARSE" &&
    finiteNonNegative(input.effectiveCecCmolcDm3) &&
    input.effectiveCecCmolcDm3! < 7.5 &&
    input.lowSubsurfaceAcidityValidated === true
  ) {
    warnings.push("COARSE_ULTISOL_LOW_CEC_NEGATIVE_RESPONSE_RISK");
  }

  let responseClass: GypsumResponseClass;
  let positiveResponseProbabilityPct: { min: number; max: number } | null = null;
  let averageYieldIncreasePct: number | null = null;

  const outsideDomain = blockers.some((blocker) => blocker.startsWith("OUTSIDE_") || blocker === "DIAGNOSTIC_LAYER_NOT_20_40_CM");
  const missingContext = blockers.some((blocker) =>
    blocker.includes("_MISSING") ||
    blocker.includes("MISSING_OR_INVALID") ||
    blocker.includes("NOT_VALIDATED"),
  );

  if (outsideDomain) {
    responseClass = "OUTSIDE_EVIDENCE_DOMAIN";
  } else if (missingContext) {
    responseClass = "INSUFFICIENT_CONTEXT";
  } else if (input.alSaturationPct! > threshold) {
    if (cropGroup === "SOYBEAN") {
      if (input.waterDeficiency === true) {
        responseClass = "HIGHER_RESPONSE_LIKELIHOOD";
        positiveResponseProbabilityPct = { min: 88, max: 88 };
        averageYieldIncreasePct = 12;
      } else {
        responseClass = "CRITERION_NOT_MET";
        warnings.push("SOYBEAN_WATER_DEFICIT_REQUIRED_BY_META_ANALYSIS");
      }
    } else {
      responseClass = "HIGHER_RESPONSE_LIKELIHOOD";
      positiveResponseProbabilityPct = { min: 77, max: 97 };
      averageYieldIncreasePct = input.waterDeficiency === true ? 14 : input.waterDeficiency === false ? 7 : null;
    }
  } else {
    responseClass = "CRITERION_NOT_MET";
    if (cropGroup === "SOYBEAN" && input.waterDeficiency !== true) {
      warnings.push("SOYBEAN_WATER_DEFICIT_REQUIRED_BY_META_ANALYSIS");
    }
  }

  return {
    responseClass,
    cropGroup,
    criterion: {
      layer: "20_40_CM",
      alSaturationThresholdPct: threshold,
      comparison: ">",
      requiresWaterDeficiency,
    },
    evidenceObservation: {
      positiveResponseProbabilityPct,
      averageYieldIncreasePct,
      statisticNature: "META_ANALYSIS_GROUP_OBSERVATION_NOT_SITE_PREDICTION",
    },
    warnings: unique(warnings),
    blockers: unique(blockers),
    gypsumDoseKgHa: null,
    gypsumDoseStatus: "BLOCKED_REQUIRES_SEPARATE_HOMOLOGATION",
    source: {
      ruleId: "GYPSUM-NT-RESPONSE-META-2020",
      title: "Does gypsum increase crop grain yield on no-tilled acid soils? A meta-analysis",
      doi: "10.1002/agj2.20125",
      year: 2020,
    },
    policy: {
      diagnosticOnly: true,
      yieldGuaranteeAllowed: false,
      automaticDoseAllowed: false,
      gypsumSubstitutesLime: false,
      professionalReviewRecommended: true,
    },
  };
}
