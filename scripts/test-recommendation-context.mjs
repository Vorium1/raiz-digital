import assert from "node:assert/strict";
import { evaluatePkDoseReadiness } from "../src/domain/recommendation-context.ts";

const missing = evaluatePkDoseReadiness({
  yieldGoal: null,
  yieldGoalUnit: null,
  cultivationOrderAfterSoilAnalysis: null,
});
assert.equal(missing.ready, false);
assert.deepEqual(missing.blockers, [
  "YIELD_GOAL_MISSING",
  "YIELD_UNIT_MISSING",
  "POST_ANALYSIS_CULTIVATION_ORDER_MISSING",
]);
assert.equal(missing.normalized.yieldGoalTonPerHa, null);
assert.equal(missing.normalized.cultivationYear, null);

const firstCrop = evaluatePkDoseReadiness({
  yieldGoal: 4.2,
  yieldGoalUnit: "t/ha",
  cultivationOrderAfterSoilAnalysis: 1,
});
assert.deepEqual(firstCrop, {
  ready: true,
  blockers: [],
  normalized: { yieldGoalTonPerHa: 4.2, cultivationYear: "PRIMEIRO" },
});

const secondCropAlias = evaluatePkDoseReadiness({
  yieldGoal: 7,
  yieldGoalUnit: "t ha⁻¹",
  cultivationOrderAfterSoilAnalysis: 2,
});
assert.equal(secondCropAlias.ready, true);
assert.equal(secondCropAlias.normalized.cultivationYear, "SEGUNDO");

const sacksAreNotInferred = evaluatePkDoseReadiness({
  yieldGoal: 80,
  yieldGoalUnit: "sc/ha",
  cultivationOrderAfterSoilAnalysis: 1,
});
assert.equal(sacksAreNotInferred.ready, false);
assert.deepEqual(sacksAreNotInferred.blockers, ["YIELD_UNIT_UNSUPPORTED"]);
assert.equal(sacksAreNotInferred.normalized.yieldGoalTonPerHa, null);

const thirdCropUnsupported = evaluatePkDoseReadiness({
  yieldGoal: 4,
  yieldGoalUnit: "t/ha",
  cultivationOrderAfterSoilAnalysis: 3,
});
assert.equal(thirdCropUnsupported.ready, false);
assert.deepEqual(thirdCropUnsupported.blockers, ["POST_ANALYSIS_CULTIVATION_ORDER_UNSUPPORTED"]);

const invalidYield = evaluatePkDoseReadiness({
  yieldGoal: 0,
  yieldGoalUnit: "t/ha",
  cultivationOrderAfterSoilAnalysis: 1,
});
assert.equal(invalidYield.ready, false);
assert.deepEqual(invalidYield.blockers, ["YIELD_GOAL_INVALID"]);

console.log("recommendation-context: contexto P/K explícito e sem inferência validado");
