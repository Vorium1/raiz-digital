import assert from "node:assert/strict";
import {
  deriveCropClimateHazardsFromMetrics,
  HOMOLOGATED_CROP_CLIMATE_METRIC_RULES,
} from "../src/domain/crop-climate-metric-engine.ts";

const hotNight = deriveCropClimateHazardsFromMetrics({
  cropCode: "MILHO",
  countryCode: "BR",
  stateCode: "RS",
  stage: "GRAIN_FILL",
  metrics: {
    NIGHT_MEAN_TEMP_C: 25.2,
    DAY_MAX_TEMP_C: 31,
  },
  rules: HOMOLOGATED_CROP_CLIMATE_METRIC_RULES,
});
assert.ok(hotNight.hazards.some((item) => item.hazard === "HOT_NIGHTS"));
assert.ok(hotNight.matchedRuleIds.includes("MILHO-BR-HOT-NIGHT-24C"));
assert.equal(hotNight.hazards.some((item) => item.hazard === "HEAT"), false);

const coldNight = deriveCropClimateHazardsFromMetrics({
  cropCode: "MILHO",
  countryCode: "BR",
  stateCode: "RS",
  stage: "VEGETATIVE",
  metrics: { NIGHT_MEAN_TEMP_C: 11.5 },
  rules: HOMOLOGATED_CROP_CLIMATE_METRIC_RULES,
});
assert.ok(coldNight.hazards.some((item) => item.hazard === "COLD_NIGHTS"));

const floweringHeat = deriveCropClimateHazardsFromMetrics({
  cropCode: "MILHO",
  countryCode: "BR",
  stateCode: "RS",
  stage: "FLOWERING",
  metrics: {
    DAY_MAX_TEMP_C: 35,
    NIGHT_MEAN_TEMP_C: 21,
  },
  rules: HOMOLOGATED_CROP_CLIMATE_METRIC_RULES,
});
assert.ok(floweringHeat.hazards.some((item) => item.hazard === "HEAT"));
assert.equal(
  floweringHeat.hazards.find((item) => item.hazard === "HEAT")?.observedValue,
  35,
);

const emergenceColdSoil = deriveCropClimateHazardsFromMetrics({
  cropCode: "MILHO",
  countryCode: "BR",
  stateCode: "RS",
  stage: "SOWING_EMERGENCE",
  metrics: { SOIL_TEMP_C: 8.5 },
  rules: HOMOLOGATED_CROP_CLIMATE_METRIC_RULES,
});
assert.ok(emergenceColdSoil.hazards.some((item) => item.hazard === "LOW_SOIL_TEMPERATURE"));

const noSoyAnalog = deriveCropClimateHazardsFromMetrics({
  cropCode: "SOJA",
  countryCode: "BR",
  stateCode: "RS",
  stage: "GRAIN_FILL",
  metrics: { NIGHT_MEAN_TEMP_C: 25.2 },
  rules: HOMOLOGATED_CROP_CLIMATE_METRIC_RULES,
});
assert.equal(noSoyAnalog.hazards.length, 0);
assert.ok(noSoyAnalog.warnings.includes("CROP_REGION_STAGE_METRIC_RULE_REQUIRED"));

const extendedMetrics = deriveCropClimateHazardsFromMetrics({
  cropCode: "TOMATE",
  countryCode: "BR",
  stateCode: "RS",
  technicalRegionCodes: ["RS-PLANALTO-MEDIO"],
  stage: "FRUIT_DEVELOPMENT",
  metrics: {
    DIURNAL_TEMP_RANGE_C: 17,
    SUNSHINE_HOURS: 3,
    GLOBAL_SOLAR_RADIATION_MJ_M2_DAY: 8.5,
    PAR_MJ_M2_DAY: 3.9,
    DEW_POINT_C: 19,
    CLOUD_COVER_PCT: 88,
    SOIL_AVAILABLE_WATER_PCT: 94,
    REFERENCE_ET_MM: 1.8,
    CONSECUTIVE_WET_DAYS: 5,
    WIND_GUST_KMH: 52,
  },
  rules: [
    {
      id: "TOMATE-RS-LOW-SUNSHINE-TEST",
      cropCode: "TOMATE",
      region: { countryCode: "BR", technicalRegionCodes: ["RS-PLANALTO-MEDIO"] },
      stages: ["FRUIT_DEVELOPMENT"],
      metric: "SUNSHINE_HOURS",
      condition: { operator: "LT", value: 4 },
      hazard: "LOW_RADIATION",
      source: { institution: "TEST", title: "Regra estrutural de teste" },
      status: "HOMOLOGATED",
    },
    {
      id: "TOMATE-RS-WET-SEQUENCE-TEST",
      cropCode: "TOMATE",
      region: { countryCode: "BR", technicalRegionCodes: ["RS-PLANALTO-MEDIO"] },
      stages: ["FRUIT_DEVELOPMENT"],
      metric: "CONSECUTIVE_WET_DAYS",
      condition: { operator: "GTE", value: 4 },
      hazard: "HIGH_HUMIDITY",
      source: { institution: "TEST", title: "Regra estrutural de teste" },
      status: "HOMOLOGATED",
    },
  ],
});
assert.equal(extendedMetrics.hazards.length, 2);
assert.ok(extendedMetrics.matchedRuleIds.includes("TOMATE-RS-LOW-SUNSHINE-TEST"));
assert.ok(extendedMetrics.matchedRuleIds.includes("TOMATE-RS-WET-SEQUENCE-TEST"));

const appleChillVocabulary = deriveCropClimateHazardsFromMetrics({
  cropCode: "MACA",
  countryCode: "BR",
  stateCode: "SC",
  stage: "DORMANCY",
  metrics: { CHILL_HOURS: 320 },
  rules: [{
    id: "MACA-SC-CHILL-TEST",
    cropCode: "MACA",
    region: { countryCode: "BR", stateCodes: ["SC"] },
    stages: ["DORMANCY"],
    metric: "CHILL_HOURS",
    condition: { operator: "LT", value: 400 },
    hazard: "INSUFFICIENT_CHILL",
    source: { institution: "TEST", title: "Regra estrutural de teste" },
    status: "HOMOLOGATED",
  }],
});
assert.equal(appleChillVocabulary.hazards[0]?.hazard, "INSUFFICIENT_CHILL");

console.log("crop-climate-metric-engine: limiares numéricos por cultura/estádio validados");
