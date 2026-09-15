import assert from "node:assert/strict";
import {
  evaluateNitrogenRecommendationReadiness,
  normalizeNitrogenTargetCrop,
} from "../src/domain/nitrogen-context.ts";

assert.equal(normalizeNitrogenTargetCrop("Milho"), "MILHO");
assert.equal(normalizeNitrogenTargetCrop("Trigo"), "TRIGO");
assert.equal(normalizeNitrogenTargetCrop("Canola"), "CANOLA");
assert.equal(normalizeNitrogenTargetCrop("Aveia / Azevém"), "PASTAGEM_INVERNO");
assert.equal(normalizeNitrogenTargetCrop("Soja"), null);

const cornMissing = evaluateNitrogenRecommendationReadiness({
  targetCropRaw: "Milho",
  yieldGoal: 9,
  yieldGoalUnit: "t/ha",
  organicMatterValuesPct: [2.1, 2.3],
  organicMatterUnits: ["%"],
  context: {},
});
assert.equal(cornMissing.ready, false);
assert.deepEqual(cornMissing.blockers, [
  "CORN_PRECEDING_CLASS_REQUIRED",
  "CORN_POPULATION_REQUIRED",
  "CORN_RESIDUE_CLASS_REQUIRED",
]);

const cornReady = evaluateNitrogenRecommendationReadiness({
  targetCropRaw: "Milho",
  yieldGoal: 9,
  yieldGoalUnit: "t/ha",
  organicMatterValuesPct: [2.1, 2.3, 2.4],
  organicMatterUnits: ["%"],
  context: {
    cornPrecedingClass: "LEGUME_OR_FALLOW",
    plannedPopulationPlantsPerHa: 70_000,
    residueClass: "LEGUME",
  },
});
assert.equal(cornReady.ready, true);
assert.equal(cornReady.normalized.targetCrop, "MILHO");
assert.equal(cornReady.normalized.organicMatterBand, "OM_LE_2_5");
assert.ok(Math.abs(cornReady.normalized.representativeOrganicMatterPct - 2.2666666667) < 1e-6);

const omConflict = evaluateNitrogenRecommendationReadiness({
  targetCropRaw: "Trigo",
  yieldGoal: 4,
  yieldGoalUnit: "t/ha",
  organicMatterValuesPct: [2.4, 2.7],
  organicMatterUnits: ["%"],
  context: { wheatPrecedingCrop: "SOY" },
});
assert.equal(omConflict.ready, false);
assert.ok(omConflict.blockers.includes("ORGANIC_MATTER_BAND_CONFLICT"));

const unsupportedOmUnit = evaluateNitrogenRecommendationReadiness({
  targetCropRaw: "Canola",
  yieldGoal: 2,
  yieldGoalUnit: "t/ha",
  organicMatterValuesPct: [2.4],
  organicMatterUnits: ["g/dm3"],
  context: {},
});
assert.equal(unsupportedOmUnit.ready, false);
assert.ok(unsupportedOmUnit.blockers.includes("ORGANIC_MATTER_UNIT_UNSUPPORTED"));

const pastureNeedsInoculation = evaluateNitrogenRecommendationReadiness({
  targetCropRaw: "Pastagem de inverno",
  yieldGoal: null,
  yieldGoalUnit: null,
  organicMatterValuesPct: [3.1, 3.2],
  organicMatterUnits: ["%"],
  context: {
    pastureType: "LEGUME",
    targetDryMatterTonPerHa: 6,
    precedingLegume: false,
  },
});
assert.equal(pastureNeedsInoculation.ready, false);
assert.deepEqual(pastureNeedsInoculation.blockers, ["PASTURE_LEGUME_INOCULATION_STATUS_REQUIRED"]);

const pastureReady = evaluateNitrogenRecommendationReadiness({
  targetCropRaw: "Aveia + Azevém",
  yieldGoal: null,
  yieldGoalUnit: null,
  organicMatterValuesPct: [3.1, 3.2],
  organicMatterUnits: ["%"],
  context: {
    pastureType: "ANNUAL_GRASS",
    targetDryMatterTonPerHa: 7,
    precedingLegume: true,
  },
});
assert.equal(pastureReady.ready, true);
assert.equal(pastureReady.normalized.targetDryMatterTonPerHa, 7);
assert.equal(pastureReady.normalized.organicMatterBand, "OM_2_5_TO_3_5");

const unsupportedCrop = evaluateNitrogenRecommendationReadiness({
  targetCropRaw: "Soja",
  yieldGoal: 4,
  yieldGoalUnit: "t/ha",
  organicMatterValuesPct: [3],
  organicMatterUnits: ["%"],
  context: {},
});
assert.equal(unsupportedCrop.ready, false);
assert.deepEqual(unsupportedCrop.blockers, ["TARGET_CROP_UNSUPPORTED"]);

console.log("nitrogen-context: cultura, OM, campos condicionais e fail-closed validados");
