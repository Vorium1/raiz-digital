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

console.log("crop-climate-metric-engine: limiares numéricos por cultura/estádio validados");
