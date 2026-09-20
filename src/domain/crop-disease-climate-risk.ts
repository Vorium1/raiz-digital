import type { CropPhenologicalStage } from "./crop-climate-risk.ts";

export type DiseaseClimateFactor =
  | "AIR_TEMPERATURE"
  | "RELATIVE_HUMIDITY"
  | "LEAF_WETNESS"
  | "RAINFALL"
  | "WIND"
  | "LOW_RADIATION";

export type DiseaseClimateObservation = {
  airTemperatureC?: number | null;
  relativeHumidityPct?: number | null;
  leafWetnessHours?: number | null;
  rainfallMm?: number | null;
  windKmh?: number | null;
  lowRadiationSignal?: boolean | null;
};

export type DiseaseClimateProfile = {
  id: string;
  cropCode: string;
  diseaseCode: string;
  diseaseName: string;
  region: {
    countryCode: string;
    stateCodes?: string[];
    municipalityCodes?: string[];
  };
  stages: CropPhenologicalStage[];
  /**
   * O perfil representa FAVORABILIDADE climática. Nunca confirma infecção.
   * Regras podem ser parciais quando a fonte não define todos os fatores.
   */
  conditions: {
    temperatureC?: { min?: number; max?: number };
    relativeHumidityPct?: { min?: number; max?: number };
    leafWetnessHours?: { min?: number; max?: number };
    rainfallMm?: { min?: number; max?: number };
    windKmh?: { min?: number; max?: number };
    lowRadiationRequired?: boolean;
  };
  source: {
    institution: string;
    title: string;
    publishedAt?: string | null;
    locator?: string | null;
  };
  status: "HOMOLOGATED" | "RESEARCH_REQUIRED";
};

export type DiseaseClimateAssessmentInput = {
  cropCode: string;
  countryCode: string;
  stateCode: string | null;
  municipalityCode?: string | null;
  stage: CropPhenologicalStage;
  observation: DiseaseClimateObservation;
  profiles: DiseaseClimateProfile[];
  pathogenPresenceStatus?: "CONFIRMED" | "REGIONAL_ALERT" | "UNKNOWN" | "NOT_DETECTED";
};

export type DiseaseClimateAssessment = {
  status: "READY" | "NO_APPLICABLE_PROFILE" | "INSUFFICIENT_WEATHER_DATA";
  cropCode: string;
  stage: CropPhenologicalStage;
  diseaseRisks: Array<{
    diseaseCode: string;
    diseaseName: string;
    profileId: string;
    climateFavorability: "LOW" | "MODERATE" | "HIGH";
    infectionConfirmed: false;
    pathogenPresenceStatus: NonNullable<DiseaseClimateAssessmentInput["pathogenPresenceStatus"]>;
    matchedFactors: DiseaseClimateFactor[];
    missingFactors: DiseaseClimateFactor[];
    rationale: string;
  }>;
  warnings: string[];
};

function normalized(value: string) {
  return value.trim().toUpperCase();
}

function regionMatches(
  profile: DiseaseClimateProfile,
  input: Pick<DiseaseClimateAssessmentInput, "countryCode" | "stateCode" | "municipalityCode">,
) {
  if (normalized(profile.region.countryCode) !== normalized(input.countryCode)) return false;
  if (profile.region.municipalityCodes?.length) {
    if (!input.municipalityCode) return false;
    return profile.region.municipalityCodes.map(normalized).includes(normalized(input.municipalityCode));
  }
  if (profile.region.stateCodes?.length) {
    if (!input.stateCode) return false;
    return profile.region.stateCodes.map(normalized).includes(normalized(input.stateCode));
  }
  return true;
}

function within(value: number | null | undefined, range?: { min?: number; max?: number }) {
  if (!range) return { present: false, matches: false };
  if (value == null || !Number.isFinite(value)) return { present: false, matches: false };
  if (range.min != null && value < range.min) return { present: true, matches: false };
  if (range.max != null && value > range.max) return { present: true, matches: false };
  return { present: true, matches: true };
}

function assessProfile(profile: DiseaseClimateProfile, input: DiseaseClimateAssessmentInput) {
  const matched: DiseaseClimateFactor[] = [];
  const missing: DiseaseClimateFactor[] = [];
  const failed: DiseaseClimateFactor[] = [];

  const checks: Array<{
    factor: DiseaseClimateFactor;
    configured: boolean;
    present: boolean;
    matches: boolean;
  }> = [];

  const t = within(input.observation.airTemperatureC, profile.conditions.temperatureC);
  checks.push({ factor: "AIR_TEMPERATURE", configured: Boolean(profile.conditions.temperatureC), ...t });

  const rh = within(input.observation.relativeHumidityPct, profile.conditions.relativeHumidityPct);
  checks.push({ factor: "RELATIVE_HUMIDITY", configured: Boolean(profile.conditions.relativeHumidityPct), ...rh });

  const wet = within(input.observation.leafWetnessHours, profile.conditions.leafWetnessHours);
  checks.push({ factor: "LEAF_WETNESS", configured: Boolean(profile.conditions.leafWetnessHours), ...wet });

  const rain = within(input.observation.rainfallMm, profile.conditions.rainfallMm);
  checks.push({ factor: "RAINFALL", configured: Boolean(profile.conditions.rainfallMm), ...rain });

  const wind = within(input.observation.windKmh, profile.conditions.windKmh);
  checks.push({ factor: "WIND", configured: Boolean(profile.conditions.windKmh), ...wind });

  if (profile.conditions.lowRadiationRequired != null) {
    const present = typeof input.observation.lowRadiationSignal === "boolean";
    const matches = present && input.observation.lowRadiationSignal === profile.conditions.lowRadiationRequired;
    checks.push({ factor: "LOW_RADIATION", configured: true, present, matches });
  }

  for (const check of checks) {
    if (!check.configured) continue;
    if (!check.present) missing.push(check.factor);
    else if (check.matches) matched.push(check.factor);
    else failed.push(check.factor);
  }

  const configuredCount = checks.filter((item) => item.configured).length;
  const usableCount = matched.length + failed.length;
  const ratio = configuredCount === 0 ? 0 : matched.length / configuredCount;

  let climateFavorability: "LOW" | "MODERATE" | "HIGH" = "LOW";
  if (usableCount > 0 && failed.length === 0 && missing.length === 0) climateFavorability = "HIGH";
  else if (usableCount > 0 && ratio >= 0.5) climateFavorability = "MODERATE";

  return {
    diseaseCode: profile.diseaseCode,
    diseaseName: profile.diseaseName,
    profileId: profile.id,
    climateFavorability,
    infectionConfirmed: false as const,
    pathogenPresenceStatus: input.pathogenPresenceStatus ?? "UNKNOWN",
    matchedFactors: matched,
    missingFactors: missing,
    rationale: climateFavorability === "HIGH"
      ? "As condições meteorológicas observadas atendem aos fatores climáticos configurados para esta doença, cultura, região e estádio. Isso indica favorabilidade climática, não confirmação de infecção."
      : climateFavorability === "MODERATE"
        ? "Parte dos fatores climáticos está favorável, mas há fatores ausentes ou não atendidos. O risco fitossanitário precisa de monitoramento de campo e alerta regional."
        : "As condições atuais não atendem suficientemente ao perfil climático configurado para elevar a favorabilidade desta doença.",
  };
}

/**
 * Avalia FAVORABILIDADE climática de doença.
 *
 * A função nunca diagnostica infecção e nunca recomenda fungicida por clima isolado.
 * Uma decisão fitossanitária posterior deve combinar: favorabilidade + presença/alerta
 * do patógeno + cultivar suscetível + estádio + histórico + monitoramento de campo.
 */
export function assessDiseaseClimateFavorability(
  input: DiseaseClimateAssessmentInput,
): DiseaseClimateAssessment {
  const cropCode = normalized(input.cropCode);
  const candidates = input.profiles.filter((profile) =>
    profile.status === "HOMOLOGATED"
    && normalized(profile.cropCode) === cropCode
    && profile.stages.includes(input.stage)
    && regionMatches(profile, input)
  );

  if (!candidates.length) {
    return {
      status: "NO_APPLICABLE_PROFILE",
      cropCode,
      stage: input.stage,
      diseaseRisks: [],
      warnings: ["CROP_DISEASE_CLIMATE_PROFILE_REQUIRED"],
    };
  }

  const diseaseRisks = candidates.map((profile) => assessProfile(profile, input));
  const hasAnyData = diseaseRisks.some((risk) => risk.matchedFactors.length > 0);
  const allNoUsableData = diseaseRisks.every((risk) =>
    risk.matchedFactors.length === 0
    && risk.missingFactors.length > 0
  );

  return {
    status: allNoUsableData ? "INSUFFICIENT_WEATHER_DATA" : "READY",
    cropCode,
    stage: input.stage,
    diseaseRisks,
    warnings: [
      "CLIMATE_FAVORABILITY_IS_NOT_DISEASE_CONFIRMATION",
      "DO_NOT_TRIGGER_FUNGICIDE_FROM_CLIMATE_ALONE",
      ...(hasAnyData ? [] : ["WEATHER_DATA_INCOMPLETE"]),
    ],
  };
}
