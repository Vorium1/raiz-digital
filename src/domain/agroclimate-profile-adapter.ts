import type {
  CropClimateHazard,
  CropClimateImpact,
  CropClimateProfile,
  CropClimateSeverity,
  CropPhenologicalStage,
} from "./crop-climate-risk.ts";
import type {
  AgroclimateMetric,
  CropClimateMetricRule,
} from "./crop-climate-metric-engine.ts";
import type { DiseaseClimateProfile } from "./crop-disease-climate-risk.ts";

export type ActiveAgroclimateCatalogRow = {
  id: string;
  code: string;
  semanticVersion: string;
  kind: "PHYSIOLOGY" | "REGIONAL_CLIMATE" | "DISEASE" | "ZARC_CONTEXT";
  diseaseCode: string | null;
  phenologicalStages: string[];
  payload: unknown;
  technicalRegionCode: string;
  technicalSourceId: string;
  cropCode: string;
  technicalRegionName: string;
  countryCode: string;
  stateCodes: string[];
  municipalityCodes: string[];
  climateZoneCode: string | null;
  technicalSourceTitle: string;
  technicalSourceInstitution: string | null;
};

type ClimateRulePayload = {
  hazard: CropClimateHazard;
  stages: CropPhenologicalStage[];
  impact: CropClimateImpact;
  severity: CropClimateSeverity;
  rationale: string;
};

type MetricRulePayload = {
  id?: string;
  stages: CropPhenologicalStage[];
  metric: AgroclimateMetric;
  condition: CropClimateMetricRule["condition"];
  hazard: CropClimateHazard;
};

type DiseasePayload = {
  diseaseName: string;
  stages?: CropPhenologicalStage[];
  conditions: DiseaseClimateProfile["conditions"];
};

type CatalogPayloadV1 = {
  schemaVersion: 1;
  climateRules?: ClimateRulePayload[];
  metricRules?: MetricRulePayload[];
  disease?: DiseasePayload;
  zarc?: Record<string, unknown>;
};

export type AdaptedAgroclimateCatalog = {
  climateProfiles: CropClimateProfile[];
  metricRules: CropClimateMetricRule[];
  diseaseProfiles: DiseaseClimateProfile[];
  zarcContexts: Array<{
    profileCode: string;
    technicalRegionCode: string;
    cropCode: string;
    payload: Record<string, unknown>;
    source: { institution: string; title: string };
  }>;
  rejected: Array<{ profileCode: string; reason: string }>;
};

const CLIMATE_HAZARDS = new Set<CropClimateHazard>([
  "WATER_DEFICIT",
  "EXCESS_RAIN",
  "WATERLOGGING",
  "HEAT",
  "COLD",
  "HOT_NIGHTS",
  "COLD_NIGHTS",
  "FROST",
  "HIGH_HUMIDITY",
  "LEAF_WETNESS",
  "LOW_RADIATION",
  "EXCESS_RADIATION",
  "HIGH_VPD",
  "THERMAL_AMPLITUDE_STRESS",
  "INSUFFICIENT_CHILL",
  "LOW_SOIL_TEMPERATURE",
  "HIGH_SOIL_TEMPERATURE",
  "HAIL",
  "WIND",
]);

const STAGES = new Set<CropPhenologicalStage>([
  "PRE_SOWING",
  "SOWING_EMERGENCE",
  "TRANSPLANT_ESTABLISHMENT",
  "BUD_BREAK",
  "VEGETATIVE",
  "FLOWERING",
  "REPRODUCTIVE",
  "GRAIN_FILL",
  "MATURATION",
  "HARVEST",
  "FRUIT_SET",
  "FRUIT_DEVELOPMENT",
  "TUBER_INITIATION",
  "BULKING",
  "RIPENING",
  "DORMANCY",
  "OTHER",
]);

const IMPACTS = new Set<CropClimateImpact>(["ADVERSE", "FAVORABLE", "CONTEXTUAL"]);
const SEVERITIES = new Set<CropClimateSeverity>(["LOW", "MEDIUM", "HIGH"]);

const METRICS = new Set<AgroclimateMetric>([
  "DAY_MAX_TEMP_C",
  "DAY_MEAN_TEMP_C",
  "DAY_MIN_TEMP_C",
  "NIGHT_MAX_TEMP_C",
  "NIGHT_MEAN_TEMP_C",
  "NIGHT_MIN_TEMP_C",
  "DIURNAL_TEMP_RANGE_C",
  "SOIL_TEMP_C",
  "DEW_POINT_C",
  "SOLAR_RADIATION_ANOMALY_PCT",
  "GLOBAL_SOLAR_RADIATION_MJ_M2_DAY",
  "PAR_MJ_M2_DAY",
  "PHOTOPERIOD_HOURS",
  "SUNSHINE_HOURS",
  "CLOUD_COVER_PCT",
  "RELATIVE_HUMIDITY_PCT",
  "NIGHT_RELATIVE_HUMIDITY_PCT",
  "LEAF_WETNESS_HOURS",
  "PRECIPITATION_MM",
  "PRECIPITATION_INTENSITY_MM_H",
  "CONSECUTIVE_WET_DAYS",
  "CONSECUTIVE_DRY_DAYS",
  "WATER_BALANCE_MM",
  "SOIL_MOISTURE_PCT",
  "SOIL_AVAILABLE_WATER_PCT",
  "REFERENCE_ET_MM",
  "CROP_ET_MM",
  "VPD_KPA",
  "WIND_KMH",
  "WIND_GUST_KMH",
  "CHILL_HOURS",
  "CHILL_PORTIONS",
  "FROST_DURATION_HOURS",
  "HEAT_STRESS_HOURS",
  "CANOPY_TEMPERATURE_C",
  "GROWING_DEGREE_DAYS",
]);

function objectValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function stageList(value: unknown): CropPhenologicalStage[] | null {
  if (!Array.isArray(value)) return null;
  const stages = value.filter((item): item is CropPhenologicalStage =>
    typeof item === "string" && STAGES.has(item as CropPhenologicalStage)
  );
  return stages.length === value.length ? stages : null;
}

function validCondition(value: unknown): value is CropClimateMetricRule["condition"] {
  const obj = objectValue(value);
  if (!obj || typeof obj.operator !== "string") return false;
  if (obj.operator === "BETWEEN") {
    return typeof obj.min === "number"
      && Number.isFinite(obj.min)
      && typeof obj.max === "number"
      && Number.isFinite(obj.max)
      && obj.min <= obj.max;
  }
  if (!["GT", "GTE", "LT", "LTE"].includes(obj.operator)) return false;
  return typeof obj.value === "number" && Number.isFinite(obj.value);
}

function validOptionalRange(value: unknown) {
  if (value == null) return true;
  const obj = objectValue(value);
  if (!obj) return false;
  const allowed = new Set(["min", "max"]);
  if (Object.keys(obj).some((key) => !allowed.has(key))) return false;
  if (obj.min != null && (typeof obj.min !== "number" || !Number.isFinite(obj.min))) return false;
  if (obj.max != null && (typeof obj.max !== "number" || !Number.isFinite(obj.max))) return false;
  if (obj.min != null && obj.max != null && obj.min > obj.max) return false;
  return obj.min != null || obj.max != null;
}

function validDiseaseConditions(value: unknown): value is DiseaseClimateProfile["conditions"] {
  const obj = objectValue(value);
  if (!obj) return false;

  const rangeKeys = [
    "temperatureC",
    "nightTemperatureC",
    "dewPointC",
    "relativeHumidityPct",
    "vpdKpa",
    "leafWetnessHours",
    "rainfallMm",
    "rainfallIntensityMmH",
    "consecutiveWetDays",
    "soilMoisturePct",
    "windKmh",
    "windGustKmh",
    "sunshineHours",
    "cloudCoverPct",
  ] as const;
  const allowed = new Set<string>([...rangeKeys, "lowRadiationRequired"]);
  if (Object.keys(obj).some((key) => !allowed.has(key))) return false;

  for (const key of rangeKeys) {
    if (!validOptionalRange(obj[key])) return false;
  }

  if (
    obj.lowRadiationRequired != null
    && typeof obj.lowRadiationRequired !== "boolean"
  ) return false;

  return Object.keys(obj).length > 0;
}

function source(row: ActiveAgroclimateCatalogRow) {
  return {
    institution: row.technicalSourceInstitution?.trim() || "Fonte técnica cadastrada",
    title: row.technicalSourceTitle,
  };
}

function region(row: ActiveAgroclimateCatalogRow) {
  return {
    countryCode: row.countryCode,
    stateCodes: row.stateCodes,
    municipalityCodes: row.municipalityCodes,
    technicalRegionCodes: [row.technicalRegionCode],
  };
}

function parseClimateRule(value: unknown): ClimateRulePayload | null {
  const obj = objectValue(value);
  if (!obj) return null;
  const stages = stageList(obj.stages);
  if (
    typeof obj.hazard !== "string"
    || !CLIMATE_HAZARDS.has(obj.hazard as CropClimateHazard)
    || !stages
    || !stages.length
    || typeof obj.impact !== "string"
    || !IMPACTS.has(obj.impact as CropClimateImpact)
    || typeof obj.severity !== "string"
    || !SEVERITIES.has(obj.severity as CropClimateSeverity)
    || typeof obj.rationale !== "string"
    || !obj.rationale.trim()
  ) return null;

  return {
    hazard: obj.hazard as CropClimateHazard,
    stages,
    impact: obj.impact as CropClimateImpact,
    severity: obj.severity as CropClimateSeverity,
    rationale: obj.rationale.trim(),
  };
}

function parseMetricRule(value: unknown): MetricRulePayload | null {
  const obj = objectValue(value);
  if (!obj) return null;
  const stages = stageList(obj.stages);
  if (
    !stages
    || !stages.length
    || typeof obj.metric !== "string"
    || !METRICS.has(obj.metric as AgroclimateMetric)
    || typeof obj.hazard !== "string"
    || !CLIMATE_HAZARDS.has(obj.hazard as CropClimateHazard)
    || !validCondition(obj.condition)
  ) return null;

  return {
    id: typeof obj.id === "string" && obj.id.trim() ? obj.id.trim() : undefined,
    stages,
    metric: obj.metric as AgroclimateMetric,
    condition: obj.condition,
    hazard: obj.hazard as CropClimateHazard,
  };
}

function parseDisease(value: unknown): DiseasePayload | null {
  const obj = objectValue(value);
  if (!obj || typeof obj.diseaseName !== "string" || !obj.diseaseName.trim()) return null;
  const stages: CropPhenologicalStage[] | undefined = obj.stages == null
    ? undefined
    : (stageList(obj.stages) ?? undefined);
  if (obj.stages != null && (!stages || !stages.length)) return null;

  if (!validDiseaseConditions(obj.conditions)) return null;

  return {
    diseaseName: obj.diseaseName.trim(),
    stages,
    conditions: obj.conditions,
  };
}

function parsePayload(value: unknown): CatalogPayloadV1 | null {
  const obj = objectValue(value);
  if (!obj || obj.schemaVersion !== 1) return null;
  return obj as CatalogPayloadV1;
}

export function adaptAgroclimateCatalogRows(
  rows: ActiveAgroclimateCatalogRow[],
): AdaptedAgroclimateCatalog {
  const out: AdaptedAgroclimateCatalog = {
    climateProfiles: [],
    metricRules: [],
    diseaseProfiles: [],
    zarcContexts: [],
    rejected: [],
  };

  for (const row of rows) {
    const payload = parsePayload(row.payload);
    if (!payload) {
      out.rejected.push({ profileCode: row.code, reason: "UNSUPPORTED_OR_INVALID_SCHEMA_VERSION" });
      continue;
    }

    if (row.kind === "PHYSIOLOGY" || row.kind === "REGIONAL_CLIMATE") {
      const climateRulesRaw = payload.climateRules ?? [];
      const metricRulesRaw = payload.metricRules ?? [];
      const climateRules = climateRulesRaw.map(parseClimateRule);
      const metricRules = metricRulesRaw.map(parseMetricRule);

      if (climateRules.some((rule) => !rule) || metricRules.some((rule) => !rule)) {
        out.rejected.push({ profileCode: row.code, reason: "INVALID_CLIMATE_OR_METRIC_RULE" });
        continue;
      }
      if (!climateRules.length && !metricRules.length) {
        out.rejected.push({ profileCode: row.code, reason: "EMPTY_CLIMATE_PROFILE" });
        continue;
      }

      if (climateRules.length) {
        out.climateProfiles.push({
          id: row.code,
          cropCode: row.cropCode,
          region: region(row),
          rules: climateRules as ClimateRulePayload[],
          source: source(row),
          status: "HOMOLOGATED",
        });
      }

      for (const [index, rule] of (metricRules as MetricRulePayload[]).entries()) {
        out.metricRules.push({
          id: rule.id || `${row.code}:METRIC:${index + 1}`,
          cropCode: row.cropCode,
          region: region(row),
          stages: rule.stages,
          metric: rule.metric,
          condition: rule.condition,
          hazard: rule.hazard,
          source: source(row),
          status: "HOMOLOGATED",
        });
      }
      continue;
    }

    if (row.kind === "DISEASE") {
      const disease = parseDisease(payload.disease);
      if (!row.diseaseCode || !disease) {
        out.rejected.push({ profileCode: row.code, reason: "INVALID_DISEASE_PROFILE" });
        continue;
      }

      const defaultStages = stageList(row.phenologicalStages);
      const stages = disease.stages ?? defaultStages;
      if (!stages || !stages.length) {
        out.rejected.push({ profileCode: row.code, reason: "DISEASE_STAGES_REQUIRED" });
        continue;
      }

      out.diseaseProfiles.push({
        id: row.code,
        cropCode: row.cropCode,
        diseaseCode: row.diseaseCode,
        diseaseName: disease.diseaseName,
        region: region(row),
        stages,
        conditions: disease.conditions,
        source: source(row),
        status: "HOMOLOGATED",
      });
      continue;
    }

    if (row.kind === "ZARC_CONTEXT") {
      if (!payload.zarc || !objectValue(payload.zarc)) {
        out.rejected.push({ profileCode: row.code, reason: "INVALID_ZARC_CONTEXT" });
        continue;
      }
      out.zarcContexts.push({
        profileCode: row.code,
        technicalRegionCode: row.technicalRegionCode,
        cropCode: row.cropCode,
        payload: payload.zarc,
        source: source(row),
      });
    }
  }

  return out;
}
