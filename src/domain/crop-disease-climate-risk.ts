import type { CropPhenologicalStage } from "./crop-climate-risk.ts";

export type DiseaseClimateFactor =
  | "AIR_TEMPERATURE"
  | "NIGHT_TEMPERATURE"
  | "DEW_POINT"
  | "RELATIVE_HUMIDITY"
  | "VPD"
  | "LEAF_WETNESS"
  | "RAINFALL"
  | "RAINFALL_INTENSITY"
  | "CONSECUTIVE_WET_DAYS"
  | "SOIL_MOISTURE"
  | "WIND"
  | "WIND_GUST"
  | "SUNSHINE"
  | "CLOUD_COVER"
  | "LOW_RADIATION";

export type DiseaseFieldFactor =
  | "CANOPY_DENSITY"
  | "IRRIGATION_METHOD"
  | "DRAINAGE"
  | "RESIDUE_LEVEL"
  | "RECENT_DISEASE_HISTORY"
  | "CROP_ROTATION_BREAK";

export type DiseaseFieldContext = {
  canopyDensity?: "OPEN" | "MODERATE" | "DENSE" | null;
  irrigationMethod?: "NONE" | "DRIP" | "FURROW" | "SPRINKLER" | "CENTER_PIVOT" | "MICROSPRINKLER" | "OTHER" | null;
  drainage?: "GOOD" | "MODERATE" | "POOR" | null;
  residueLevel?: "LOW" | "MEDIUM" | "HIGH" | null;
  recentDiseaseHistory?: boolean | null;
  cropRotationBreak?: boolean | null;
};

export type DiseaseClimateObservation = {
  airTemperatureC?: number | null;
  nightTemperatureC?: number | null;
  dewPointC?: number | null;
  relativeHumidityPct?: number | null;
  vpdKpa?: number | null;
  leafWetnessHours?: number | null;
  rainfallMm?: number | null;
  rainfallIntensityMmH?: number | null;
  consecutiveWetDays?: number | null;
  soilMoisturePct?: number | null;
  windKmh?: number | null;
  windGustKmh?: number | null;
  sunshineHours?: number | null;
  cloudCoverPct?: number | null;
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
    technicalRegionCodes?: string[];
  };
  stages: CropPhenologicalStage[];
  /**
   * O perfil representa FAVORABILIDADE climática. Nunca confirma infecção.
   * Regras podem ser parciais quando a fonte não define todos os fatores.
   */
  conditions: {
    temperatureC?: { min?: number; max?: number };
    nightTemperatureC?: { min?: number; max?: number };
    dewPointC?: { min?: number; max?: number };
    relativeHumidityPct?: { min?: number; max?: number };
    vpdKpa?: { min?: number; max?: number };
    leafWetnessHours?: { min?: number; max?: number };
    rainfallMm?: { min?: number; max?: number };
    rainfallIntensityMmH?: { min?: number; max?: number };
    consecutiveWetDays?: { min?: number; max?: number };
    soilMoisturePct?: { min?: number; max?: number };
    windKmh?: { min?: number; max?: number };
    windGustKmh?: { min?: number; max?: number };
    sunshineHours?: { min?: number; max?: number };
    cloudCoverPct?: { min?: number; max?: number };
    lowRadiationRequired?: boolean;
  };
  /**
   * Modificadores de microclima/manejo são doença-específicos. Só participam
   * quando o próprio perfil técnico declara a condição.
   */
  fieldContextConditions?: {
    canopyDensityIn?: Array<NonNullable<DiseaseFieldContext["canopyDensity"]>>;
    irrigationMethodIn?: Array<NonNullable<DiseaseFieldContext["irrigationMethod"]>>;
    drainageIn?: Array<NonNullable<DiseaseFieldContext["drainage"]>>;
    residueLevelIn?: Array<NonNullable<DiseaseFieldContext["residueLevel"]>>;
    recentDiseaseHistory?: boolean;
    cropRotationBreak?: boolean;
  };
  source: {
    institution: string;
    title: string;
    publishedAt?: string | null;
    locator?: string | null;
  };
  status: "HOMOLOGATED" | "RESEARCH_REQUIRED";
};

export type HostDiseaseSusceptibility =
  | "RESISTANT"
  | "MODERATELY_RESISTANT"
  | "INTERMEDIATE"
  | "SUSCEPTIBLE"
  | "HIGHLY_SUSCEPTIBLE"
  | "UNKNOWN";

export type DiseaseClimateAssessmentInput = {
  cropCode: string;
  countryCode: string;
  stateCode: string | null;
  municipalityCode?: string | null;
  technicalRegionCodes?: string[];
  stage: CropPhenologicalStage;
  observation: DiseaseClimateObservation;
  profiles: DiseaseClimateProfile[];
  pathogenPresenceStatus?: "CONFIRMED" | "REGIONAL_ALERT" | "UNKNOWN" | "NOT_DETECTED";
  hostSusceptibility?: HostDiseaseSusceptibility;
  fieldContext?: DiseaseFieldContext;
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
    hostSusceptibility: HostDiseaseSusceptibility;
    monitoringPriority: "LOW" | "MEDIUM" | "HIGH";
    treatmentAutomaticallyAuthorized: false;
    matchedFactors: DiseaseClimateFactor[];
    missingFactors: DiseaseClimateFactor[];
    fieldContextAlignment: "NOT_CONFIGURED" | "MATCHED" | "PARTIAL" | "NOT_MATCHED" | "INSUFFICIENT_DATA";
    matchedFieldFactors: DiseaseFieldFactor[];
    missingFieldFactors: DiseaseFieldFactor[];
    rationale: string;
  }>;
  warnings: string[];
};

function normalized(value: string) {
  return value.trim().toUpperCase();
}

function regionMatches(
  profile: DiseaseClimateProfile,
  input: Pick<DiseaseClimateAssessmentInput, "countryCode" | "stateCode" | "municipalityCode" | "technicalRegionCodes">,
) {
  if (normalized(profile.region.countryCode) !== normalized(input.countryCode)) return false;
  if (profile.region.technicalRegionCodes?.length) {
    const resolved = new Set((input.technicalRegionCodes ?? []).map(normalized));
    return profile.region.technicalRegionCodes.map(normalized).some((code) => resolved.has(code));
  }
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

function assessFieldContext(profile: DiseaseClimateProfile, context?: DiseaseFieldContext) {
  const conditions = profile.fieldContextConditions;
  if (!conditions || Object.keys(conditions).length === 0) {
    return {
      alignment: "NOT_CONFIGURED" as const,
      matched: [] as DiseaseFieldFactor[],
      missing: [] as DiseaseFieldFactor[],
    };
  }

  const matched: DiseaseFieldFactor[] = [];
  const missing: DiseaseFieldFactor[] = [];
  const failed: DiseaseFieldFactor[] = [];
  const checks: Array<{ factor: DiseaseFieldFactor; configured: boolean; present: boolean; matches: boolean }> = [];

  checks.push({
    factor: "CANOPY_DENSITY",
    configured: Boolean(conditions.canopyDensityIn?.length),
    present: context?.canopyDensity != null,
    matches: context?.canopyDensity != null && Boolean(conditions.canopyDensityIn?.includes(context.canopyDensity)),
  });
  checks.push({
    factor: "IRRIGATION_METHOD",
    configured: Boolean(conditions.irrigationMethodIn?.length),
    present: context?.irrigationMethod != null,
    matches: context?.irrigationMethod != null && Boolean(conditions.irrigationMethodIn?.includes(context.irrigationMethod)),
  });
  checks.push({
    factor: "DRAINAGE",
    configured: Boolean(conditions.drainageIn?.length),
    present: context?.drainage != null,
    matches: context?.drainage != null && Boolean(conditions.drainageIn?.includes(context.drainage)),
  });
  checks.push({
    factor: "RESIDUE_LEVEL",
    configured: Boolean(conditions.residueLevelIn?.length),
    present: context?.residueLevel != null,
    matches: context?.residueLevel != null && Boolean(conditions.residueLevelIn?.includes(context.residueLevel)),
  });
  checks.push({
    factor: "RECENT_DISEASE_HISTORY",
    configured: conditions.recentDiseaseHistory != null,
    present: typeof context?.recentDiseaseHistory === "boolean",
    matches: typeof context?.recentDiseaseHistory === "boolean"
      && context.recentDiseaseHistory === conditions.recentDiseaseHistory,
  });
  checks.push({
    factor: "CROP_ROTATION_BREAK",
    configured: conditions.cropRotationBreak != null,
    present: typeof context?.cropRotationBreak === "boolean",
    matches: typeof context?.cropRotationBreak === "boolean"
      && context.cropRotationBreak === conditions.cropRotationBreak,
  });

  for (const check of checks) {
    if (!check.configured) continue;
    if (!check.present) missing.push(check.factor);
    else if (check.matches) matched.push(check.factor);
    else failed.push(check.factor);
  }

  const configuredCount = checks.filter((check) => check.configured).length;
  if (!configuredCount) {
    return { alignment: "NOT_CONFIGURED" as const, matched, missing };
  }
  if (missing.length === configuredCount) {
    return { alignment: "INSUFFICIENT_DATA" as const, matched, missing };
  }
  if (failed.length === 0 && missing.length === 0) {
    return { alignment: "MATCHED" as const, matched, missing };
  }
  if (matched.length > 0) {
    return { alignment: "PARTIAL" as const, matched, missing };
  }
  return { alignment: "NOT_MATCHED" as const, matched, missing };
}

function monitoringPriority(input: {
  climateFavorability: "LOW" | "MODERATE" | "HIGH";
  pathogenPresenceStatus: "CONFIRMED" | "REGIONAL_ALERT" | "UNKNOWN" | "NOT_DETECTED";
  hostSusceptibility: HostDiseaseSusceptibility;
}) {
  const susceptible = input.hostSusceptibility === "SUSCEPTIBLE" || input.hostSusceptibility === "HIGHLY_SUSCEPTIBLE";
  const resistant = input.hostSusceptibility === "RESISTANT" || input.hostSusceptibility === "MODERATELY_RESISTANT";
  const pathogenSupported = input.pathogenPresenceStatus === "CONFIRMED" || input.pathogenPresenceStatus === "REGIONAL_ALERT";

  if (input.climateFavorability === "HIGH" && pathogenSupported && susceptible) return "HIGH" as const;
  if (input.climateFavorability === "HIGH" && (pathogenSupported || susceptible)) return "MEDIUM" as const;
  if (input.climateFavorability === "MODERATE" && pathogenSupported && !resistant) return "MEDIUM" as const;
  return "LOW" as const;
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

  const nightT = within(input.observation.nightTemperatureC, profile.conditions.nightTemperatureC);
  checks.push({ factor: "NIGHT_TEMPERATURE", configured: Boolean(profile.conditions.nightTemperatureC), ...nightT });

  const dew = within(input.observation.dewPointC, profile.conditions.dewPointC);
  checks.push({ factor: "DEW_POINT", configured: Boolean(profile.conditions.dewPointC), ...dew });

  const rh = within(input.observation.relativeHumidityPct, profile.conditions.relativeHumidityPct);
  checks.push({ factor: "RELATIVE_HUMIDITY", configured: Boolean(profile.conditions.relativeHumidityPct), ...rh });

  const vpd = within(input.observation.vpdKpa, profile.conditions.vpdKpa);
  checks.push({ factor: "VPD", configured: Boolean(profile.conditions.vpdKpa), ...vpd });

  const wet = within(input.observation.leafWetnessHours, profile.conditions.leafWetnessHours);
  checks.push({ factor: "LEAF_WETNESS", configured: Boolean(profile.conditions.leafWetnessHours), ...wet });

  const rain = within(input.observation.rainfallMm, profile.conditions.rainfallMm);
  checks.push({ factor: "RAINFALL", configured: Boolean(profile.conditions.rainfallMm), ...rain });

  const rainIntensity = within(input.observation.rainfallIntensityMmH, profile.conditions.rainfallIntensityMmH);
  checks.push({ factor: "RAINFALL_INTENSITY", configured: Boolean(profile.conditions.rainfallIntensityMmH), ...rainIntensity });

  const wetDays = within(input.observation.consecutiveWetDays, profile.conditions.consecutiveWetDays);
  checks.push({ factor: "CONSECUTIVE_WET_DAYS", configured: Boolean(profile.conditions.consecutiveWetDays), ...wetDays });

  const soilMoisture = within(input.observation.soilMoisturePct, profile.conditions.soilMoisturePct);
  checks.push({ factor: "SOIL_MOISTURE", configured: Boolean(profile.conditions.soilMoisturePct), ...soilMoisture });

  const wind = within(input.observation.windKmh, profile.conditions.windKmh);
  checks.push({ factor: "WIND", configured: Boolean(profile.conditions.windKmh), ...wind });

  const gust = within(input.observation.windGustKmh, profile.conditions.windGustKmh);
  checks.push({ factor: "WIND_GUST", configured: Boolean(profile.conditions.windGustKmh), ...gust });

  const sunshine = within(input.observation.sunshineHours, profile.conditions.sunshineHours);
  checks.push({ factor: "SUNSHINE", configured: Boolean(profile.conditions.sunshineHours), ...sunshine });

  const cloud = within(input.observation.cloudCoverPct, profile.conditions.cloudCoverPct);
  checks.push({ factor: "CLOUD_COVER", configured: Boolean(profile.conditions.cloudCoverPct), ...cloud });

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

  const pathogenPresenceStatus = input.pathogenPresenceStatus ?? "UNKNOWN";
  const hostSusceptibility = input.hostSusceptibility ?? "UNKNOWN";
  const fieldContext = assessFieldContext(profile, input.fieldContext);

  return {
    diseaseCode: profile.diseaseCode,
    diseaseName: profile.diseaseName,
    profileId: profile.id,
    climateFavorability,
    infectionConfirmed: false as const,
    pathogenPresenceStatus,
    hostSusceptibility,
    monitoringPriority: monitoringPriority({
      climateFavorability,
      pathogenPresenceStatus,
      hostSusceptibility,
    }),
    treatmentAutomaticallyAuthorized: false as const,
    matchedFactors: matched,
    missingFactors: missing,
    fieldContextAlignment: fieldContext.alignment,
    matchedFieldFactors: fieldContext.matched,
    missingFieldFactors: fieldContext.missing,
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
 * do patógeno + suscetibilidade do material + estádio + histórico + monitoramento de campo.
 * Temperatura noturna, ponto de orvalho, VPD, umidade/molhamento, chuva/intensidade,
 * dias úmidos consecutivos, solo, vento/rajadas e radiação podem participar somente
 * quando o perfil homologado da doença declarar esses fatores. Dossel, irrigação,
 * drenagem, resíduo, histórico e rotação seguem a mesma regra: nunca são assumidos
 * como agravantes genéricos; só entram quando o perfil específico os declarar.
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
