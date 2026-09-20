import assert from "node:assert/strict";
import {
  adviseFertilityInvestmentTiming,
  buildFertilityInvestmentScenarios,
} from "../src/domain/fertility-investment-strategy.ts";

const base = {
  totalCorrectionKgPerHa: { P2O5: 80, K2O: 60 },
  annualMaintenanceKgPerHa: [
    { order: 1, cropCode: "SOJA", P2O5: 72, K2O: 120 },
    { order: 2, cropCode: "TRIGO", P2O5: 63, K2O: 42 },
    { order: 3, cropCode: "SOJA", P2O5: 72, K2O: 120 },
    { order: 4, cropCode: "MILHO", P2O5: 180, K2O: 120 },
  ],
  correctionStrategiesAvailable: ["TOTAL_AT_START", "GRADUAL_TWO_CROPS"],
  costPerKgNutrientEquivalent: { P2O5: 6, K2O: 5 },
};

const scenarios = buildFertilityInvestmentScenarios(base);
assert.equal(scenarios.length, 2);

const total = scenarios.find((item) => item.strategy === "TOTAL_AT_START");
const gradual = scenarios.find((item) => item.strategy === "GRADUAL_TWO_CROPS");
assert.ok(total);
assert.ok(gradual);

assert.deepEqual(total.seasons[0].correctionKgPerHa, { P2O5: 80, K2O: 60 });
assert.deepEqual(total.seasons[1].correctionKgPerHa, { P2O5: 0, K2O: 0 });

assert.deepEqual(gradual.seasons[0].correctionKgPerHa, { P2O5: 53.3, K2O: 40 });
assert.deepEqual(gradual.seasons[1].correctionKgPerHa, { P2O5: 26.7, K2O: 20 });
assert.deepEqual(gradual.seasons[2].correctionKgPerHa, { P2O5: 0, K2O: 0 });
assert.deepEqual(gradual.seasons[3].correctionKgPerHa, { P2O5: 0, K2O: 0 });

assert.equal(total.seasons[0].maintenanceKgPerHa.P2O5, 72);
assert.equal(gradual.seasons[0].maintenanceKgPerHa.P2O5, 72);
assert.equal(total.seasons[3].maintenanceKgPerHa.K2O, 120);
assert.equal(gradual.seasons[3].maintenanceKgPerHa.K2O, 120);

// Mesmo total agronômico de correção; muda somente o desembolso temporal.
const sumCorrection = (scenario, nutrient) =>
  scenario.seasons.reduce((sum, season) => sum + season.correctionKgPerHa[nutrient], 0);
assert.equal(sumCorrection(total, "P2O5"), 80);
assert.equal(sumCorrection(gradual, "P2O5"), 80);
assert.equal(sumCorrection(total, "K2O"), 60);
assert.equal(sumCorrection(gradual, "K2O"), 60);

assert.equal(total.estimatedCycleCostPerHa, gradual.estimatedCycleCostPerHa);
assert.ok((total.seasons[0].estimatedCostPerHa ?? 0) > (gradual.seasons[0].estimatedCostPerHa ?? 0));

const favorable = adviseFertilityInvestmentTiming({
  ...base,
  climateSignal: {
    source: "INMET",
    publishedAt: "2026-09-18",
    targetPeriod: "primavera 2026",
    waterRisk: "FAVORABLE",
    confidence: "MEDIUM",
    zarcRiskPercent: 20,
  },
});
assert.equal(favorable.preferredStrategy, "TOTAL_AT_START");
assert.equal(favorable.posture, "CONSIDER_ACCELERATING_VALID_CORRECTION");
assert.equal(favorable.seasonalYieldTargetPosture, "CONSIDER_UPSIDE_SCENARIO");
assert.equal(favorable.automaticYieldTargetChangeAllowed, false);
assert.equal(favorable.climateCanChangeAgronomicNeed, false);
assert.equal(favorable.maintenanceProtected, true);

const dryRisk = adviseFertilityInvestmentTiming({
  ...base,
  climateSignal: {
    source: "CPTEC_INPE",
    publishedAt: "2026-09-20",
    targetPeriod: "out-dez 2026",
    waterRisk: "DRY_RISK",
    confidence: "HIGH",
    zarcRiskPercent: 30,
  },
});
assert.equal(dryRisk.preferredStrategy, "GRADUAL_TWO_CROPS");
assert.equal(dryRisk.posture, "PRESERVE_CASH_WITHIN_VALID_PHASING");
assert.equal(dryRisk.seasonalYieldTargetPosture, "CONSIDER_CONSERVATIVE_SCENARIO");
assert.equal(dryRisk.automaticYieldTargetChangeAllowed, false);
assert.equal(dryRisk.climateCanChangeAgronomicNeed, false);
assert.equal(dryRisk.maintenanceProtected, true);

const excessRain = adviseFertilityInvestmentTiming({
  ...base,
  climateSignal: {
    source: "INMET",
    publishedAt: "2026-09-20",
    targetPeriod: "out-dez 2026",
    waterRisk: "EXCESS_RAIN_RISK",
    confidence: "MEDIUM",
    zarcRiskPercent: 40,
  },
});
assert.equal(excessRain.preferredStrategy, "GRADUAL_TWO_CROPS");
assert.equal(excessRain.maintenanceProtected, true);

const weakSignal = adviseFertilityInvestmentTiming({
  ...base,
  climateSignal: {
    source: "OTHER_OFFICIAL",
    publishedAt: "2026-09-20",
    targetPeriod: "safra 2026/27",
    waterRisk: "DRY_RISK",
    confidence: "LOW",
  },
});
assert.equal(weakSignal.preferredStrategy, null);
assert.equal(weakSignal.posture, "NO_CLIMATE_PREFERENCE");
assert.equal(weakSignal.seasonalYieldTargetPosture, "KEEP_USER_TARGET_REVIEW");
assert.equal(weakSignal.automaticYieldTargetChangeAllowed, false);

console.log("fertility-investment-strategy: fluxo de caixa, clima e proteção da necessidade agronômica validados");
