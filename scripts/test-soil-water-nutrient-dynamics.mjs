import assert from "node:assert/strict";
import { evaluateSoilWaterNutrientDynamics } from "../src/domain/soil-water-nutrient-dynamics.ts";

const irrigatedSandy = evaluateSoilWaterNutrientDynamics({
  irrigationRegime: "FULL",
  soilTexture: "COARSE",
  cecClass: "LOW",
  waterStatus: "SURPLUS",
  drainage: "MODERATE",
  trafficOnWetSoil: "POSSIBLE",
  residueLevel: "HIGH",
  organicMatterStatus: "MEDIUM",
});

const k = irrigatedSandy.nutrientLossRisks.find((item) => item.nutrient === "K");
const n = irrigatedSandy.nutrientLossRisks.find((item) => item.nutrient === "N_NO3");
const s = irrigatedSandy.nutrientLossRisks.find((item) => item.nutrient === "S_SO4");
const b = irrigatedSandy.nutrientLossRisks.find((item) => item.nutrient === "B");

assert.equal(k?.risk, "HIGH");
assert.equal(k?.splitApplicationAdvised, true);
assert.equal(n?.risk, "HIGH");
assert.equal(s?.risk, "HIGH");
assert.equal(b?.risk, "HIGH");
assert.equal(irrigatedSandy.automaticNutrientDoseIncreaseAllowed, false);
assert.equal(irrigatedSandy.compactionRisk, "MODERATE");
assert.equal(irrigatedSandy.mediumTermMonitoring.earlierSoilMonitoringAdvised, true);
assert.ok(irrigatedSandy.warnings.includes("LOSS_RISK_DOES_NOT_AUTHORIZE_AUTOMATIC_DOSE_INCREASE"));

const balancedMoisture = evaluateSoilWaterNutrientDynamics({
  irrigationRegime: "SUPPLEMENTAL",
  soilTexture: "FINE",
  cecClass: "HIGH",
  waterStatus: "BALANCED",
  drainage: "GOOD",
  trafficOnWetSoil: "NO",
  residueLevel: "HIGH",
  organicMatterStatus: "HIGH",
});
assert.equal(balancedMoisture.biologyState, "MOISTURE_FAVORABLE");
assert.equal(balancedMoisture.residueDecomposition, "POTENTIALLY_ACCELERATED");
assert.equal(balancedMoisture.rootHypoxiaRisk, "LOW");
assert.equal(balancedMoisture.oxidativeStressRisk, "LOW");
assert.equal(balancedMoisture.compactionRisk, "LOW");

const waterlogged = evaluateSoilWaterNutrientDynamics({
  irrigationRegime: "FULL",
  soilTexture: "MEDIUM",
  cecClass: "MEDIUM",
  waterStatus: "WATERLOGGED",
  drainage: "POOR",
  trafficOnWetSoil: "YES",
  residueLevel: "HIGH",
  organicMatterStatus: "HIGH",
});
assert.equal(waterlogged.biologyState, "OXYGEN_LIMITED");
assert.equal(waterlogged.residueDecomposition, "ALTERED_BY_ANAEROBIOSIS");
assert.equal(waterlogged.rootHypoxiaRisk, "HIGH");
assert.equal(waterlogged.oxidativeStressRisk, "HIGH");
assert.equal(waterlogged.waterRelatedDiseasePressure, "ELEVATED");
assert.equal(waterlogged.compactionRisk, "HIGH");
assert.ok(waterlogged.nutrientLossRisks.find((item) => item.nutrient === "N_NO3")?.mechanisms.includes("DENITRIFICATION"));
assert.ok(waterlogged.warnings.includes("WATERLOGGING_IS_NOT_BIOLOGICALLY_FAVORABLE_MOISTURE"));
assert.ok(waterlogged.warnings.includes("WET_SOIL_TRAFFIC_CAN_INCREASE_COMPACTION"));

const dry = evaluateSoilWaterNutrientDynamics({
  irrigationRegime: "NONE",
  soilTexture: "FINE",
  cecClass: "HIGH",
  waterStatus: "DEFICIT",
  drainage: "GOOD",
  trafficOnWetSoil: "NO",
  residueLevel: "HIGH",
});
assert.equal(dry.biologyState, "WATER_LIMITED");
assert.equal(dry.residueDecomposition, "POTENTIALLY_SLOWED_BY_DRYNESS");
assert.equal(dry.oxidativeStressRisk, "HIGH");

console.log("soil-water-nutrient-dynamics: lixiviação, biologia, compactação e estresse hídrico validados");
