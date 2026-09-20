import assert from "node:assert/strict";
import { assessDiseaseClimateFavorability } from "../src/domain/crop-disease-climate-risk.ts";
import {
  HOMOLOGATED_CROP_CLIMATE_PROFILES,
  HOMOLOGATED_DISEASE_CLIMATE_PROFILES,
} from "../src/domain/crop-climate-profile-catalog.ts";
import { assessCropClimateRisk } from "../src/domain/crop-climate-risk.ts";

const rust = assessDiseaseClimateFavorability({
  cropCode: "SOJA",
  countryCode: "BR",
  stateCode: "RS",
  stage: "REPRODUCTIVE",
  observation: {
    airTemperatureC: 23,
    relativeHumidityPct: 95,
    leafWetnessHours: 8,
    rainfallMm: 12,
  },
  pathogenPresenceStatus: "REGIONAL_ALERT",
  profiles: HOMOLOGATED_DISEASE_CLIMATE_PROFILES,
});
assert.equal(rust.status, "READY");
assert.equal(rust.diseaseRisks.length, 1);
assert.equal(rust.diseaseRisks[0].diseaseCode, "FERRUGEM_ASIATICA");
assert.equal(rust.diseaseRisks[0].climateFavorability, "HIGH");
assert.equal(rust.diseaseRisks[0].infectionConfirmed, false);
assert.equal(rust.diseaseRisks[0].pathogenPresenceStatus, "REGIONAL_ALERT");
assert.ok(rust.warnings.includes("DO_NOT_TRIGGER_FUNGICIDE_FROM_CLIMATE_ALONE"));

const rustDry = assessDiseaseClimateFavorability({
  cropCode: "SOJA",
  countryCode: "BR",
  stateCode: "RS",
  stage: "REPRODUCTIVE",
  observation: {
    airTemperatureC: 23,
    leafWetnessHours: 2,
  },
  pathogenPresenceStatus: "UNKNOWN",
  profiles: HOMOLOGATED_DISEASE_CLIMATE_PROFILES,
});
assert.equal(rustDry.diseaseRisks[0].climateFavorability, "MODERATE");
assert.equal(rustDry.diseaseRisks[0].infectionConfirmed, false);

const blast = assessDiseaseClimateFavorability({
  cropCode: "TRIGO",
  countryCode: "BR",
  stateCode: "RS",
  stage: "FLOWERING",
  observation: {
    airTemperatureC: 28,
    relativeHumidityPct: 93,
  },
  pathogenPresenceStatus: "UNKNOWN",
  profiles: HOMOLOGATED_DISEASE_CLIMATE_PROFILES,
});
assert.equal(blast.status, "READY");
assert.equal(blast.diseaseRisks[0].diseaseCode, "BRUSONE");
assert.equal(blast.diseaseRisks[0].climateFavorability, "HIGH");
assert.equal(blast.diseaseRisks[0].infectionConfirmed, false);

const noTomatoDiseaseProfile = assessDiseaseClimateFavorability({
  cropCode: "TOMATE",
  countryCode: "BR",
  stateCode: "RS",
  stage: "FLOWERING",
  observation: { airTemperatureC: 25, relativeHumidityPct: 95 },
  profiles: HOMOLOGATED_DISEASE_CLIMATE_PROFILES,
});
assert.equal(noTomatoDiseaseProfile.status, "NO_APPLICABLE_PROFILE");
assert.ok(noTomatoDiseaseProfile.warnings.includes("CROP_DISEASE_CLIMATE_PROFILE_REQUIRED"));

const maize = assessCropClimateRisk({
  cropCode: "MILHO",
  countryCode: "BR",
  stateCode: "RS",
  plannedStart: "2026-11-01",
  plannedEnd: "2027-02-28",
  stages: ["FLOWERING", "REPRODUCTIVE", "GRAIN_FILL"],
  signal: {
    source: "INMET",
    publishedAt: "2026-09-20",
    targetStart: "2026-12-01",
    targetEnd: "2027-02-28",
    driver: "EL_NINO",
    confidence: "HIGH",
    hazards: [
      { hazard: "HOT_NIGHTS", confidence: "HIGH" },
      { hazard: "LOW_RADIATION", confidence: "MEDIUM" },
      { hazard: "EXCESS_RAIN", confidence: "HIGH" },
    ],
  },
  profiles: HOMOLOGATED_CROP_CLIMATE_PROFILES,
});
assert.equal(maize.status, "READY");
assert.equal(maize.appliesToPlannedCropWindow, true);
assert.equal(maize.riskClass, "ADVERSE");
assert.ok(maize.impacts.some((item) => item.hazard === "HOT_NIGHTS"));
assert.ok(maize.impacts.some((item) => item.hazard === "LOW_RADIATION"));
// Excesso de chuva não ganha interpretação só por estar no sinal: precisa regra do milho.
assert.equal(maize.impacts.some((item) => item.hazard === "EXCESS_RAIN"), false);

console.log("crop-climate-catalog: fisiologia, doença e não-inferência de tratamento validadas");
