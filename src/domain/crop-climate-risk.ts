export type CropClimateHazard =
  | "WATER_DEFICIT"
  | "EXCESS_RAIN"
  | "WATERLOGGING"
  | "HEAT"
  | "COLD"
  | "HOT_NIGHTS"
  | "COLD_NIGHTS"
  | "FROST"
  | "HIGH_HUMIDITY"
  | "LEAF_WETNESS"
  | "LOW_RADIATION"
  | "HIGH_VPD"
  | "LOW_SOIL_TEMPERATURE"
  | "HIGH_SOIL_TEMPERATURE"
  | "HAIL"
  | "WIND";

export type CropPhenologicalStage =
  | "PRE_SOWING"
  | "SOWING_EMERGENCE"
  | "VEGETATIVE"
  | "FLOWERING"
  | "REPRODUCTIVE"
  | "GRAIN_FILL"
  | "MATURATION"
  | "HARVEST"
  | "FRUIT_SET"
  | "BULKING"
  | "DORMANCY"
  | "OTHER";

export type ClimateDriver =
  | "EL_NINO"
  | "LA_NINA"
  | "ENSO_NEUTRAL"
  | "ATLANTIC_ANOMALY"
  | "OTHER"
  | "UNKNOWN";

export type CropClimateImpact = "ADVERSE" | "FAVORABLE" | "CONTEXTUAL";
export type CropClimateSeverity = "LOW" | "MEDIUM" | "HIGH";

export type CropClimateProfile = {
  id: string;
  cropCode: string;
  /** Escopo explícito. Nunca inferir região adjacente. */
  region: {
    countryCode: string;
    stateCodes?: string[];
    municipalityCodes?: string[];
  };
  rules: Array<{
    hazard: CropClimateHazard;
    stages: CropPhenologicalStage[];
    impact: CropClimateImpact;
    severity: CropClimateSeverity;
    rationale: string;
  }>;
  source: {
    institution: string;
    title: string;
    publishedAt?: string | null;
    locator?: string | null;
  };
  status: "HOMOLOGATED" | "RESEARCH_REQUIRED";
};

export type RegionalClimateHazardSignal = {
  source: "INMET" | "CPTEC_INPE" | "ZARC" | "OTHER_OFFICIAL";
  publishedAt: string;
  targetStart: string;
  targetEnd: string;
  driver: ClimateDriver;
  confidence: "LOW" | "MEDIUM" | "HIGH";
  hazards: Array<{
    hazard: CropClimateHazard;
    confidence: "LOW" | "MEDIUM" | "HIGH";
  }>;
};

export type CropClimateAssessmentInput = {
  cropCode: string;
  countryCode: string;
  stateCode: string | null;
  municipalityCode?: string | null;
  plannedStart: string;
  plannedEnd: string;
  stages: CropPhenologicalStage[];
  signal: RegionalClimateHazardSignal;
  profiles: CropClimateProfile[];
};

export type CropClimateAssessment = {
  status: "READY" | "NO_APPLICABLE_PROFILE" | "OUTSIDE_FORECAST_WINDOW" | "LOW_CONFIDENCE";
  cropCode: string;
  driver: ClimateDriver;
  appliesToPlannedCropWindow: boolean;
  riskClass: "FAVORABLE" | "ADVERSE" | "MIXED" | "NO_DEFINED_IMPACT";
  matchedProfileIds: string[];
  impacts: Array<{
    hazard: CropClimateHazard;
    stage: CropPhenologicalStage;
    impact: CropClimateImpact;
    severity: CropClimateSeverity;
    rationale: string;
    profileId: string;
  }>;
  warnings: string[];
};

function normalized(value: string) {
  return value.trim().toUpperCase();
}

function parseDate(value: string, label: string) {
  const time = Date.parse(value);
  if (!Number.isFinite(time)) throw new Error(`${label} inválida: ${value}`);
  return time;
}

function windowsOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string) {
  const as = parseDate(aStart, "Data inicial planejada");
  const ae = parseDate(aEnd, "Data final planejada");
  const bs = parseDate(bStart, "Data inicial do sinal climático");
  const be = parseDate(bEnd, "Data final do sinal climático");
  if (ae < as) throw new Error("Janela planejada termina antes de começar.");
  if (be < bs) throw new Error("Janela climática termina antes de começar.");
  return as <= be && bs <= ae;
}

function regionMatches(
  profile: CropClimateProfile,
  input: Pick<CropClimateAssessmentInput, "countryCode" | "stateCode" | "municipalityCode">,
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

function classifyRisk(impacts: CropClimateAssessment["impacts"]) {
  const hasAdverse = impacts.some((item) => item.impact === "ADVERSE");
  const hasFavorable = impacts.some((item) => item.impact === "FAVORABLE");
  const hasContextual = impacts.some((item) => item.impact === "CONTEXTUAL");
  if ((hasAdverse && hasFavorable) || hasContextual) return "MIXED" as const;
  if (hasAdverse) return "ADVERSE" as const;
  if (hasFavorable) return "FAVORABLE" as const;
  return "NO_DEFINED_IMPACT" as const;
}

/**
 * Traduz riscos físicos regionais em impacto específico de cultura × região × estádio.
 *
 * Regras de segurança:
 * - nunca reutiliza perfil de outra cultura;
 * - nunca usa estado/município fora do escopo explícito;
 * - ENOS é apenas um driver; a decisão vem dos riscos físicos previstos;
 * - sem perfil homologado, retorna NO_APPLICABLE_PROFILE;
 * - um risco só se aplica quando a janela climática cruza a janela planejada e
 *   existe regra para o estádio fenológico em questão.
 */
export function assessCropClimateRisk(input: CropClimateAssessmentInput): CropClimateAssessment {
  const cropCode = normalized(input.cropCode);
  if (!cropCode) throw new Error("Código da cultura é obrigatório.");
  if (!input.stages.length) throw new Error("Informe ao menos um estádio fenológico planejado.");

  const homologatedProfiles = input.profiles.filter((profile) =>
    profile.status === "HOMOLOGATED"
    && normalized(profile.cropCode) === cropCode
    && regionMatches(profile, input)
  );

  if (!homologatedProfiles.length) {
    return {
      status: "NO_APPLICABLE_PROFILE",
      cropCode,
      driver: input.signal.driver,
      appliesToPlannedCropWindow: false,
      riskClass: "NO_DEFINED_IMPACT",
      matchedProfileIds: [],
      impacts: [],
      warnings: ["CROP_REGION_CLIMATE_PROFILE_REQUIRED"],
    };
  }

  if (!windowsOverlap(input.plannedStart, input.plannedEnd, input.signal.targetStart, input.signal.targetEnd)) {
    return {
      status: "OUTSIDE_FORECAST_WINDOW",
      cropCode,
      driver: input.signal.driver,
      appliesToPlannedCropWindow: false,
      riskClass: "NO_DEFINED_IMPACT",
      matchedProfileIds: homologatedProfiles.map((profile) => profile.id),
      impacts: [],
      warnings: ["CLIMATE_SIGNAL_OUTSIDE_PLANNED_CROP_WINDOW"],
    };
  }

  if (input.signal.confidence === "LOW") {
    return {
      status: "LOW_CONFIDENCE",
      cropCode,
      driver: input.signal.driver,
      appliesToPlannedCropWindow: false,
      riskClass: "NO_DEFINED_IMPACT",
      matchedProfileIds: homologatedProfiles.map((profile) => profile.id),
      impacts: [],
      warnings: ["LOW_FORECAST_CONFIDENCE"],
    };
  }

  const stages = new Set(input.stages);
  const usableHazards = new Set(
    input.signal.hazards
      .filter((item) => item.confidence !== "LOW")
      .map((item) => item.hazard),
  );

  const impacts: CropClimateAssessment["impacts"] = [];
  for (const profile of homologatedProfiles) {
    for (const rule of profile.rules) {
      if (!usableHazards.has(rule.hazard)) continue;
      for (const stage of rule.stages) {
        if (!stages.has(stage)) continue;
        impacts.push({
          hazard: rule.hazard,
          stage,
          impact: rule.impact,
          severity: rule.severity,
          rationale: rule.rationale,
          profileId: profile.id,
        });
      }
    }
  }

  return {
    status: "READY",
    cropCode,
    driver: input.signal.driver,
    appliesToPlannedCropWindow: impacts.length > 0,
    riskClass: classifyRisk(impacts),
    matchedProfileIds: homologatedProfiles.map((profile) => profile.id),
    impacts,
    warnings: impacts.length ? [] : ["NO_PROFILE_RULE_MATCHED_FORECAST_HAZARDS_AND_STAGES"],
  };
}
