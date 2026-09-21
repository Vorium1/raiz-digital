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
  hostSusceptibility: "HIGHLY_SUSCEPTIBLE",
  profiles: HOMOLOGATED_DISEASE_CLIMATE_PROFILES,
});
assert.equal(rust.status, "READY");
assert.equal(rust.diseaseRisks.length, 1);
assert.equal(rust.diseaseRisks[0].diseaseCode, "FERRUGEM_ASIATICA");
assert.equal(rust.diseaseRisks[0].climateFavorability, "HIGH");
assert.equal(rust.diseaseRisks[0].infectionConfirmed, false);
assert.equal(rust.diseaseRisks[0].pathogenPresenceStatus, "REGIONAL_ALERT");
assert.equal(rust.diseaseRisks[0].hostSusceptibility, "HIGHLY_SUSCEPTIBLE");
assert.equal(rust.diseaseRisks[0].monitoringPriority, "HIGH");
assert.equal(rust.diseaseRisks[0].treatmentAutomaticallyAuthorized, false);
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
  hostSusceptibility: "RESISTANT",
  profiles: HOMOLOGATED_DISEASE_CLIMATE_PROFILES,
});
assert.equal(rustDry.diseaseRisks[0].climateFavorability, "MODERATE");
assert.equal(rustDry.diseaseRisks[0].infectionConfirmed, false);
assert.equal(rustDry.diseaseRisks[0].monitoringPriority, "LOW");

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

const tomatoOutsideProfile = assessDiseaseClimateFavorability({
  cropCode: "TOMATE",
  countryCode: "BR",
  stateCode: "RS",
  stage: "FLOWERING",
  observation: { airTemperatureC: 25, relativeHumidityPct: 95 },
  profiles: HOMOLOGATED_DISEASE_CLIMATE_PROFILES,
});
assert.equal(tomatoOutsideProfile.status, "READY");
assert.equal(tomatoOutsideProfile.diseaseRisks.find((item) => item.diseaseCode === "REQUEIMA")?.climateFavorability, "LOW");

const fusariumHeadBlight = assessDiseaseClimateFavorability({
  cropCode: "TRIGO",
  countryCode: "BR",
  stateCode: "RS",
  stage: "FLOWERING",
  observation: { airTemperatureC: 22, continuousRainHours: 52 },
  profiles: HOMOLOGATED_DISEASE_CLIMATE_PROFILES,
});
const giberelaRisk = fusariumHeadBlight.diseaseRisks.find((item) => item.diseaseCode === "GIBERELA");
assert.equal(giberelaRisk?.climateFavorability, "HIGH");
assert.ok(giberelaRisk?.matchedFactors.includes("CONTINUOUS_RAIN_HOURS"));
assert.equal(giberelaRisk?.treatmentAutomaticallyAuthorized, false);

const maizeDisease = assessDiseaseClimateFavorability({
  cropCode: "MILHO",
  countryCode: "BR",
  stateCode: "RS",
  stage: "REPRODUCTIVE",
  observation: {
    airTemperatureC: 27,
    nightTemperatureC: 18,
    relativeHumidityPct: 95,
  },
  fieldContext: { residueLevel: "HIGH", cropRotationBreak: false },
  profiles: HOMOLOGATED_DISEASE_CLIMATE_PROFILES,
});
assert.equal(maizeDisease.status, "READY");
assert.equal(maizeDisease.diseaseRisks.find((item) => item.diseaseCode === "CERCOSPORIOSE")?.climateFavorability, "HIGH");
assert.equal(maizeDisease.diseaseRisks.find((item) => item.diseaseCode === "CERCOSPORIOSE")?.fieldContextAlignment, "MATCHED");
assert.equal(maizeDisease.diseaseRisks.find((item) => item.diseaseCode === "MANCHA_BRANCA")?.climateFavorability, "HIGH");

const riceBlast = assessDiseaseClimateFavorability({
  cropCode: "ARROZ",
  countryCode: "BR",
  stateCode: "RS",
  stage: "REPRODUCTIVE",
  observation: {
    airTemperatureC: 27,
    relativeHumidityPct: 95,
    lowRadiationSignal: true,
  },
  profiles: HOMOLOGATED_DISEASE_CLIMATE_PROFILES,
});
assert.equal(riceBlast.status, "READY");
assert.equal(riceBlast.diseaseRisks.find((item) => item.diseaseCode === "BRUSONE")?.climateFavorability, "HIGH");
assert.ok(riceBlast.diseaseRisks.find((item) => item.diseaseCode === "BRUSONE")?.matchedFactors.includes("LOW_RADIATION"));

const tomatoLateBlight = assessDiseaseClimateFavorability({
  cropCode: "TOMATE",
  countryCode: "BR",
  stateCode: "RS",
  stage: "FRUIT_DEVELOPMENT",
  observation: { airTemperatureC: 18, leafWetnessHours: 12 },
  fieldContext: { irrigationMethod: "SPRINKLER" },
  profiles: HOMOLOGATED_DISEASE_CLIMATE_PROFILES,
});
assert.equal(tomatoLateBlight.diseaseRisks.find((item) => item.diseaseCode === "REQUEIMA")?.climateFavorability, "HIGH");
assert.equal(tomatoLateBlight.diseaseRisks.find((item) => item.diseaseCode === "REQUEIMA")?.fieldContextAlignment, "MATCHED");

const potatoLateBlight = assessDiseaseClimateFavorability({
  cropCode: "BATATA",
  countryCode: "BR",
  stateCode: "RS",
  stage: "TUBER_INITIATION",
  observation: { airTemperatureC: 16, relativeHumidityPct: 95 },
  profiles: HOMOLOGATED_DISEASE_CLIMATE_PROFILES,
});
assert.equal(potatoLateBlight.diseaseRisks.find((item) => item.diseaseCode === "REQUEIMA")?.climateFavorability, "HIGH");

const extendedDisease = assessDiseaseClimateFavorability({
  cropCode: "TOMATE",
  countryCode: "BR",
  stateCode: "RS",
  technicalRegionCodes: ["RS-PLANALTO-MEDIO"],
  stage: "FRUIT_DEVELOPMENT",
  observation: {
    airTemperatureC: 22,
    nightTemperatureC: 18,
    dewPointC: 18,
    relativeHumidityPct: 94,
    vpdKpa: 0.35,
    leafWetnessHours: 10,
    rainfallMm: 18,
    rainfallIntensityMmH: 6,
    consecutiveWetDays: 4,
    soilMoisturePct: 78,
    windKmh: 14,
    windGustKmh: 29,
    sunshineHours: 3,
    cloudCoverPct: 86,
  },
  pathogenPresenceStatus: "REGIONAL_ALERT",
  hostSusceptibility: "SUSCEPTIBLE",
  fieldContext: {
    canopyDensity: "DENSE",
    irrigationMethod: "CENTER_PIVOT",
    drainage: "POOR",
    residueLevel: "HIGH",
    recentDiseaseHistory: true,
    cropRotationBreak: false,
  },
  profiles: [{
    id: "TOMATE-RS-DISEASE-WEATHER-TEST",
    cropCode: "TOMATE",
    diseaseCode: "FUNGUS_TEST",
    diseaseName: "Doença fúngica de teste",
    region: {
      countryCode: "BR",
      stateCodes: ["RS"],
      technicalRegionCodes: ["RS-PLANALTO-MEDIO"],
    },
    stages: ["FRUIT_DEVELOPMENT"],
    conditions: {
      temperatureC: { min: 18, max: 26 },
      nightTemperatureC: { min: 15, max: 21 },
      dewPointC: { min: 16 },
      relativeHumidityPct: { min: 90 },
      vpdKpa: { max: 0.5 },
      leafWetnessHours: { min: 8 },
      rainfallIntensityMmH: { min: 4 },
      consecutiveWetDays: { min: 3 },
      soilMoisturePct: { min: 70 },
      sunshineHours: { max: 4 },
      cloudCoverPct: { min: 80 },
    },
    fieldContextConditions: {
      canopyDensityIn: ["DENSE"],
      irrigationMethodIn: ["CENTER_PIVOT", "SPRINKLER"],
      drainageIn: ["POOR"],
      residueLevelIn: ["HIGH"],
      recentDiseaseHistory: true,
      cropRotationBreak: false,
    },
    source: { institution: "TEST", title: "Perfil estrutural de teste" },
    status: "HOMOLOGATED",
  }],
});
assert.equal(extendedDisease.status, "READY");
assert.equal(extendedDisease.diseaseRisks[0].climateFavorability, "HIGH");
assert.equal(extendedDisease.diseaseRisks[0].monitoringPriority, "HIGH");
assert.ok(extendedDisease.diseaseRisks[0].matchedFactors.includes("NIGHT_TEMPERATURE"));
assert.ok(extendedDisease.diseaseRisks[0].matchedFactors.includes("DEW_POINT"));
assert.ok(extendedDisease.diseaseRisks[0].matchedFactors.includes("VPD"));
assert.ok(extendedDisease.diseaseRisks[0].matchedFactors.includes("CONSECUTIVE_WET_DAYS"));
assert.ok(extendedDisease.diseaseRisks[0].matchedFactors.includes("SUNSHINE"));
assert.equal(extendedDisease.diseaseRisks[0].fieldContextAlignment, "MATCHED");
assert.ok(extendedDisease.diseaseRisks[0].matchedFieldFactors.includes("CANOPY_DENSITY"));
assert.ok(extendedDisease.diseaseRisks[0].matchedFieldFactors.includes("IRRIGATION_METHOD"));
assert.ok(extendedDisease.diseaseRisks[0].matchedFieldFactors.includes("RECENT_DISEASE_HISTORY"));
assert.equal(extendedDisease.diseaseRisks[0].treatmentAutomaticallyAuthorized, false);

const maize = assessCropClimateRisk({
  cropCode: "MILHO",
  countryCode: "BR",
  stateCode: "RS",
  plannedStart: "2026-11-01",
  plannedEnd: "2027-02-28",
  waterRegime: "SEQUEIRO",
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
