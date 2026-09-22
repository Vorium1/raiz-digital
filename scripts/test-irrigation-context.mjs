import assert from "node:assert/strict";
import { evaluateIrrigationContext } from "../src/domain/irrigation-context.ts";

const unknown = evaluateIrrigationContext({ waterRegime: "" });
assert.equal(unknown.detailLevel, "NOT_DECLARED");
assert.equal(unknown.analysisPolicy.irrigationRequiredForBaseSoilOpinion, false);
assert.equal(unknown.analysisPolicy.missingIrrigationDetailsBlocksAnalysis, false);
assert.equal(unknown.analysisPolicy.missingIrrigationDetailsBlocksOfficialReport, false);

const presenceOnly = evaluateIrrigationContext({ waterRegime: "IRRIGADO" });
assert.equal(presenceOnly.detailLevel, "IRRIGATION_PRESENCE_ONLY");
assert.equal(presenceOnly.irrigationDeclared, true);
assert.equal(presenceOnly.analysisPolicy.presenceOnlyIsValidEvidence, true);
assert.equal(presenceOnly.approximateAverageAppliedMmPerDay, null);

const basic = evaluateIrrigationContext({
  waterRegime: "IRRIGADO",
  irrigationSystem: "Pivô central",
  irrigationApplicationTime: "22:00",
});
assert.equal(basic.detailLevel, "IRRIGATION_BASIC");
assert.equal(basic.approximateAverageAppliedMmPerDay, null, "horário/sistema não podem inventar volume");

const quantified = evaluateIrrigationContext({
  waterRegime: "IRRIGADO",
  irrigationSystem: "Pivô central",
  irrigationDepthMm: 12,
  irrigationFrequencyDays: 4,
  irrigationApplicationTime: "22:00",
});
assert.equal(quantified.detailLevel, "IRRIGATION_QUANTIFIED");
assert.equal(quantified.quantifiedApplicationPatternAvailable, true);
assert.equal(quantified.approximateAverageAppliedMmPerDay, 3);
assert.ok(quantified.warnings.includes("IRRIGATION_MM_DAY_IS_OPERATIONAL_AVERAGE_NOT_CROP_WATER_BALANCE"));
assert.equal(quantified.analysisPolicy.automaticNutrientDoseChangeAllowed, false);
assert.equal(quantified.analysisPolicy.automaticWaterBalanceInferenceAllowed, false);

const inconsistent = evaluateIrrigationContext({
  waterRegime: "SEQUEIRO",
  irrigationDepthMm: 10,
  irrigationFrequencyDays: 4,
});
assert.ok(inconsistent.warnings.includes("IRRIGATION_DETAILS_PRESENT_WITHOUT_IRRIGATED_REGIME"));
assert.equal(inconsistent.quantifiedApplicationPatternAvailable, false);
assert.equal(inconsistent.approximateAverageAppliedMmPerDay, null);
assert.equal(evaluateIrrigationContext({ waterRegime: "", irrigationDepthMm: 10,
  irrigationFrequencyDays: 4 }).quantifiedApplicationPatternAvailable, false);

assert.throws(
  () => evaluateIrrigationContext({ waterRegime: "IRRIGADO", irrigationDepthMm: 0 }),
  /maior que zero/,
);

console.log("irrigation-context: contexto progressivo e não bloqueante validado");
