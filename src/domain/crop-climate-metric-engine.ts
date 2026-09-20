import type {
  CropClimateHazard,
  CropPhenologicalStage,
} from "./crop-climate-risk.ts";

export type AgroclimateMetric =
  | "DAY_MAX_TEMP_C"
  | "DAY_MEAN_TEMP_C"
  | "NIGHT_MEAN_TEMP_C"
  | "NIGHT_MIN_TEMP_C"
  | "SOIL_TEMP_C"
  | "SOLAR_RADIATION_ANOMALY_PCT"
  | "RELATIVE_HUMIDITY_PCT"
  | "LEAF_WETNESS_HOURS"
  | "PRECIPITATION_MM"
  | "WATER_BALANCE_MM"
  | "VPD_KPA"
  | "WIND_KMH";

export type AgroclimateMetricSnapshot = Partial<Record<AgroclimateMetric, number>>;

export type CropClimateMetricRule = {
  id: string;
  cropCode: string;
  region: {
    countryCode: string;
    stateCodes?: string[];
    municipalityCodes?: string[];
  };
  stages: CropPhenologicalStage[];
  metric: AgroclimateMetric;
  condition:
    | { operator: "GT" | "GTE" | "LT" | "LTE"; value: number }
    | { operator: "BETWEEN"; min: number; max: number };
  hazard: CropClimateHazard;
  source: {
    institution: string;
    title: string;
    locator?: string | null;
  };
  status: "HOMOLOGATED" | "RESEARCH_REQUIRED";
};

export type CropClimateMetricAssessmentInput = {
  cropCode: string;
  countryCode: string;
  stateCode: string | null;
  municipalityCode?: string | null;
  stage: CropPhenologicalStage;
  metrics: AgroclimateMetricSnapshot;
  rules: CropClimateMetricRule[];
};

export type CropClimateMetricAssessment = {
  cropCode: string;
  stage: CropPhenologicalStage;
  hazards: Array<{
    hazard: CropClimateHazard;
    ruleId: string;
    metric: AgroclimateMetric;
    observedValue: number;
    source: CropClimateMetricRule["source"];
  }>;
  missingMetrics: AgroclimateMetric[];
  matchedRuleIds: string[];
  warnings: string[];
};

function normalized(value: string) {
  return value.trim().toUpperCase();
}

function regionMatches(
  rule: CropClimateMetricRule,
  input: Pick<CropClimateMetricAssessmentInput, "countryCode" | "stateCode" | "municipalityCode">,
) {
  if (normalized(rule.region.countryCode) !== normalized(input.countryCode)) return false;
  if (rule.region.municipalityCodes?.length) {
    if (!input.municipalityCode) return false;
    return rule.region.municipalityCodes.map(normalized).includes(normalized(input.municipalityCode));
  }
  if (rule.region.stateCodes?.length) {
    if (!input.stateCode) return false;
    return rule.region.stateCodes.map(normalized).includes(normalized(input.stateCode));
  }
  return true;
}

function conditionMatches(
  value: number,
  condition: CropClimateMetricRule["condition"],
) {
  if (condition.operator === "GT") return value > condition.value;
  if (condition.operator === "GTE") return value >= condition.value;
  if (condition.operator === "LT") return value < condition.value;
  if (condition.operator === "LTE") return value <= condition.value;
  return value >= condition.min && value <= condition.max;
}

/**
 * Traduz previsão/observação meteorológica NUMÉRICA em riscos da cultura.
 *
 * O limiar pertence à regra da cultura; por isso uma noite de 24 °C não vira
 * automaticamente "HOT_NIGHTS" para todas as espécies. Sem regra homologada,
 * a métrica não é interpretada por analogia.
 */
export function deriveCropClimateHazardsFromMetrics(
  input: CropClimateMetricAssessmentInput,
): CropClimateMetricAssessment {
  const cropCode = normalized(input.cropCode);
  const candidates = input.rules.filter((rule) =>
    rule.status === "HOMOLOGATED"
    && normalized(rule.cropCode) === cropCode
    && rule.stages.includes(input.stage)
    && regionMatches(rule, input)
  );

  const hazards: CropClimateMetricAssessment["hazards"] = [];
  const missingMetrics = new Set<AgroclimateMetric>();
  const matchedRuleIds: string[] = [];

  for (const rule of candidates) {
    const observed = input.metrics[rule.metric];
    if (observed == null || !Number.isFinite(observed)) {
      missingMetrics.add(rule.metric);
      continue;
    }
    if (!conditionMatches(observed, rule.condition)) continue;

    hazards.push({
      hazard: rule.hazard,
      ruleId: rule.id,
      metric: rule.metric,
      observedValue: observed,
      source: rule.source,
    });
    matchedRuleIds.push(rule.id);
  }

  return {
    cropCode,
    stage: input.stage,
    hazards,
    missingMetrics: [...missingMetrics],
    matchedRuleIds,
    warnings: candidates.length
      ? []
      : ["CROP_REGION_STAGE_METRIC_RULE_REQUIRED"],
  };
}

export const HOMOLOGATED_CROP_CLIMATE_METRIC_RULES: CropClimateMetricRule[] = [
  {
    id: "MILHO-BR-HOT-NIGHT-24C",
    cropCode: "MILHO",
    region: { countryCode: "BR" },
    stages: ["VEGETATIVE", "FLOWERING", "REPRODUCTIVE", "GRAIN_FILL"],
    metric: "NIGHT_MEAN_TEMP_C",
    condition: { operator: "GT", value: 24 },
    hazard: "HOT_NIGHTS",
    source: {
      institution: "Embrapa Milho e Sorgo",
      title: "Relações com o clima — cultura do milho",
      locator: "temperaturas noturnas superiores a 24 °C",
    },
    status: "HOMOLOGATED",
  },
  {
    id: "MILHO-BR-COLD-NIGHT-12_8C",
    cropCode: "MILHO",
    region: { countryCode: "BR" },
    stages: ["VEGETATIVE", "FLOWERING", "REPRODUCTIVE", "GRAIN_FILL"],
    metric: "NIGHT_MEAN_TEMP_C",
    condition: { operator: "LT", value: 12.8 },
    hazard: "COLD_NIGHTS",
    source: {
      institution: "Embrapa Milho e Sorgo",
      title: "Relações com o clima — cultura do milho",
      locator: "noites com temperatura média inferior a 12,8 °C",
    },
    status: "HOMOLOGATED",
  },
  {
    id: "MILHO-BR-FLOWERING-HEAT-33C",
    cropCode: "MILHO",
    region: { countryCode: "BR" },
    stages: ["FLOWERING"],
    metric: "DAY_MAX_TEMP_C",
    condition: { operator: "GT", value: 33 },
    hazard: "HEAT",
    source: {
      institution: "Embrapa Milho e Sorgo",
      title: "Sistema de Produção — Cultivo do Milho",
      locator: "polinização: temperaturas acima de 33 °C reduzem a germinação do pólen",
    },
    status: "HOMOLOGATED",
  },
  {
    id: "MILHO-BR-SOIL-COLD-10C",
    cropCode: "MILHO",
    region: { countryCode: "BR" },
    stages: ["SOWING_EMERGENCE"],
    metric: "SOIL_TEMP_C",
    condition: { operator: "LT", value: 10 },
    hazard: "LOW_SOIL_TEMPERATURE",
    source: {
      institution: "Embrapa Milho e Sorgo",
      title: "Relações com o clima — cultura do milho",
      locator: "temperatura do solo inferior a 10 °C prejudica germinação",
    },
    status: "HOMOLOGATED",
  },
  {
    id: "MILHO-BR-SOIL-HOT-40C",
    cropCode: "MILHO",
    region: { countryCode: "BR" },
    stages: ["SOWING_EMERGENCE"],
    metric: "SOIL_TEMP_C",
    condition: { operator: "GT", value: 40 },
    hazard: "HIGH_SOIL_TEMPERATURE",
    source: {
      institution: "Embrapa Milho e Sorgo",
      title: "Relações com o clima — cultura do milho",
      locator: "temperatura do solo superior a 40 °C prejudica germinação",
    },
    status: "HOMOLOGATED",
  },
];
