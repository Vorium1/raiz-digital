import assert from "node:assert/strict";
import { assessCropClimateRisk } from "../src/domain/crop-climate-risk.ts";
import { deriveCropClimateHazardsFromMetrics } from "../src/domain/crop-climate-metric-engine.ts";
import { assessDiseaseClimateFavorability } from "../src/domain/crop-disease-climate-risk.ts";

const climateProfile = {
  id: "MILHO-RS-PLANALTO-MEDIO-EXCESS-RUNOFF",
  cropCode: "MILHO",
  region: {
    countryCode: "BR",
    stateCodes: ["RS"],
    technicalRegionCodes: ["RS-PLANALTO-MEDIO"],
  },
  rules: [{
    hazard: "EXCESS_RAIN",
    stages: ["FLOWERING"],
    impact: "ADVERSE",
    severity: "HIGH",
    rationale: "Perfil regional de teste.",
  }],
  source: { institution: "TEST", title: "Perfil regional teste" },
  status: "HOMOLOGATED",
};

const signal = {
  source: "INMET",
  publishedAt: "2026-09-20",
  targetStart: "2026-10-01",
  targetEnd: "2026-12-31",
  driver: "EL_NINO",
  confidence: "HIGH",
  hazards: [{ hazard: "EXCESS_RAIN", confidence: "HIGH" }],
};

const matching = assessCropClimateRisk({
  cropCode: "MILHO",
  countryCode: "BR",
  stateCode: "RS",
  municipalityCode: "4314100",
  technicalRegionCodes: ["BR-RS", "RS-PLANALTO-MEDIO"],
  plannedStart: "2026-10-15",
  plannedEnd: "2026-12-15",
  waterRegime: "SEQUEIRO",
  stages: ["FLOWERING"],
  signal,
  profiles: [climateProfile],
});
assert.equal(matching.status, "READY");
assert.equal(matching.matchedProfileIds[0], climateProfile.id);

const outsideSubregion = assessCropClimateRisk({
  cropCode: "MILHO",
  countryCode: "BR",
  stateCode: "RS",
  municipalityCode: "4304705",
  technicalRegionCodes: ["BR-RS", "RS-CAMPANHA"],
  plannedStart: "2026-10-15",
  plannedEnd: "2026-12-15",
  waterRegime: "SEQUEIRO",
  stages: ["FLOWERING"],
  signal,
  profiles: [climateProfile],
});
assert.equal(outsideSubregion.status, "NO_APPLICABLE_PROFILE");

const metricRule = {
  id: "MILHO-RS-PLANALTO-MEDIO-HOT-NIGHT",
  cropCode: "MILHO",
  region: {
    countryCode: "BR",
    stateCodes: ["RS"],
    technicalRegionCodes: ["RS-PLANALTO-MEDIO"],
  },
  stages: ["FLOWERING"],
  metric: "NIGHT_MEAN_TEMP_C",
  condition: { operator: "GT", value: 24 },
  hazard: "HOT_NIGHTS",
  source: { institution: "TEST", title: "Regra métrica regional teste" },
  status: "HOMOLOGATED",
};

const metricMatch = deriveCropClimateHazardsFromMetrics({
  cropCode: "MILHO",
  countryCode: "BR",
  stateCode: "RS",
  municipalityCode: "4314100",
  technicalRegionCodes: ["RS-PLANALTO-MEDIO"],
  stage: "FLOWERING",
  metrics: { NIGHT_MEAN_TEMP_C: 25 },
  rules: [metricRule],
});
assert.equal(metricMatch.hazards.length, 1);

const metricOutside = deriveCropClimateHazardsFromMetrics({
  cropCode: "MILHO",
  countryCode: "BR",
  stateCode: "RS",
  municipalityCode: "4304705",
  technicalRegionCodes: ["RS-CAMPANHA"],
  stage: "FLOWERING",
  metrics: { NIGHT_MEAN_TEMP_C: 25 },
  rules: [metricRule],
});
assert.equal(metricOutside.hazards.length, 0);
assert.ok(metricOutside.warnings.includes("CROP_REGION_STAGE_METRIC_RULE_REQUIRED"));

const diseaseProfile = {
  id: "MILHO-RS-PLANALTO-MEDIO-DISEASE-TEST",
  cropCode: "MILHO",
  diseaseCode: "DISEASE_TEST",
  diseaseName: "Doença teste",
  region: {
    countryCode: "BR",
    stateCodes: ["RS"],
    technicalRegionCodes: ["RS-PLANALTO-MEDIO"],
  },
  stages: ["FLOWERING"],
  conditions: {
    temperatureC: { min: 20, max: 28 },
    relativeHumidityPct: { min: 85 },
  },
  source: { institution: "TEST", title: "Perfil doença regional teste" },
  status: "HOMOLOGATED",
};

const diseaseMatch = assessDiseaseClimateFavorability({
  cropCode: "MILHO",
  countryCode: "BR",
  stateCode: "RS",
  municipalityCode: "4314100",
  technicalRegionCodes: ["RS-PLANALTO-MEDIO"],
  stage: "FLOWERING",
  observation: { airTemperatureC: 25, relativeHumidityPct: 92 },
  profiles: [diseaseProfile],
  hostSusceptibility: "SUSCEPTIBLE",
  pathogenPresenceStatus: "REGIONAL_ALERT",
});
assert.equal(diseaseMatch.status, "READY");
assert.equal(diseaseMatch.diseaseRisks[0].monitoringPriority, "HIGH");

const diseaseOutside = assessDiseaseClimateFavorability({
  cropCode: "MILHO",
  countryCode: "BR",
  stateCode: "RS",
  municipalityCode: "4304705",
  technicalRegionCodes: ["RS-CAMPANHA"],
  stage: "FLOWERING",
  observation: { airTemperatureC: 25, relativeHumidityPct: 92 },
  profiles: [diseaseProfile],
  hostSusceptibility: "SUSCEPTIBLE",
  pathogenPresenceStatus: "REGIONAL_ALERT",
});
assert.equal(diseaseOutside.status, "NO_APPLICABLE_PROFILE");

console.log("technical-region-climate-binding: subclima obrigatório em clima, métricas e doenças");
