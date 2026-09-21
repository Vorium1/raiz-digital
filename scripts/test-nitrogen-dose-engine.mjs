import assert from "node:assert/strict";
import {
  computeCornNitrogenRecommendation,
  computeWheatNitrogenRecommendation,
  computeCanolaNitrogenRecommendation,
  computeWinterPastureNitrogenRecommendation,
} from "../src/domain/nitrogen-dose-engine.ts";

const corn = computeCornNitrogenRecommendation({
  organicMatterPct: 2,
  precedingClass: "LEGUME_OR_FALLOW",
  targetYieldTonPerHa: 8,
  plannedPopulationPlantsPerHa: 75_000,
  residueClass: "GRASS",
});
assert.equal(corn.status, "READY_FOR_IMPLEMENTATION");
assert.deepEqual(corn.dose, { kind: "EXACT", kgNPerHa: 120 });
assert.deepEqual(corn.sowingRangeKgNPerHa, { min: 20, max: 40 });
assert.equal(corn.ruleId, "N-MILHO-CQFS-2016");
assert.ok(corn.sourceSnapshotId);

const cornCap = computeCornNitrogenRecommendation({
  organicMatterPct: 2,
  precedingClass: "GRASS_SUCCESSION",
  targetYieldTonPerHa: 6,
  plannedPopulationPlantsPerHa: 65_000,
  residueClass: "GRASS",
});
assert.equal(cornCap.status, "REQUIRES_AGRONOMIST_REVIEW");
assert.deepEqual(cornCap.dose, { kind: "RANGE", minKgNPerHa: 0, maxKgNPerHa: 40 });
assert.ok(cornCap.blockers.includes("BASE_IS_UPPER_LIMIT_NOT_EXACT_DOSE"));

const cornAmbiguous = computeCornNitrogenRecommendation({
  organicMatterPct: 3,
  precedingClass: "GRASS",
  targetYieldTonPerHa: 7,
  plannedPopulationPlantsPerHa: 67_000,
  residueClass: "GRASS",
  residueBiomassTonPerHa: 5,
});
assert.equal(cornAmbiguous.status, "REQUIRES_AGRONOMIST_REVIEW");
assert.equal(cornAmbiguous.dose.kind, "BLOCKED");
assert.ok(cornAmbiguous.blockers.includes("POPULATION_INCREMENT_NOT_EXACT_MULTIPLE"));
assert.ok(cornAmbiguous.blockers.includes("OVERLAPPING_HIGH_YIELD_BIOMASS_MODIFIERS_REQUIRE_REVIEW"));

const wheat = computeWheatNitrogenRecommendation({ organicMatterPct: 2, precedingCrop: "SOY", targetYieldTonPerHa: 4 });
assert.equal(wheat.status, "READY_FOR_IMPLEMENTATION");
assert.deepEqual(wheat.dose, { kind: "EXACT", kgNPerHa: 80 });
assert.deepEqual(wheat.sowingRangeKgNPerHa, { min: 15, max: 20 });
assert.equal(wheat.qualityObjective?.status, "NOT_REQUESTED");
assert.equal(wheat.qualityObjective?.requested, false);
assert.equal(wheat.qualityObjective?.automaticAdditionalDoseAllowed, false);

const wheatHighOm = computeWheatNitrogenRecommendation({ organicMatterPct: 5.5, precedingCrop: "CORN", targetYieldTonPerHa: 4 });
assert.equal(wheatHighOm.status, "REQUIRES_AGRONOMIST_REVIEW");
assert.deepEqual(wheatHighOm.dose, { kind: "RANGE", minKgNPerHa: 0, maxKgNPerHa: 50 });

const wheatQuality = computeWheatNitrogenRecommendation({ organicMatterPct: 2, precedingCrop: "SOY", targetYieldTonPerHa: 3, lateQualityNitrogenRequested: true });
assert.equal(wheatQuality.status, "READY_FOR_IMPLEMENTATION", "objetivo de qualidade não pode rebaixar a dose-base de produtividade");
assert.deepEqual(wheatQuality.dose, { kind: "EXACT", kgNPerHa: 60 });
assert.equal(wheatQuality.blockers.includes("LATE_QUALITY_N_REQUIRES_SPECIFIC_REVIEW"), false);
assert.equal(wheatQuality.qualityObjective?.status, "REQUIRES_SPECIFIC_REVIEW");
assert.equal(wheatQuality.qualityObjective?.automaticAdditionalDoseAllowed, false);
assert.equal(wheatQuality.qualityObjective?.additionalDoseKgNPerHa, null);
assert.match(wheatQuality.qualityObjective?.evidence ?? "", /pouco efetiva/i);
assert.match(wheatQuality.qualityObjective?.source ?? "", /2025/);

const canola = computeCanolaNitrogenRecommendation({ organicMatterPct: 3, targetYieldTonPerHa: 2.5 });
assert.equal(canola.status, "READY_FOR_IMPLEMENTATION");
assert.deepEqual(canola.dose, { kind: "EXACT", kgNPerHa: 60 });

const canolaHighOm = computeCanolaNitrogenRecommendation({ organicMatterPct: 6, targetYieldTonPerHa: 2.5 });
assert.equal(canolaHighOm.status, "REQUIRES_AGRONOMIST_REVIEW");
assert.deepEqual(canolaHighOm.dose, { kind: "RANGE", minKgNPerHa: 0, maxKgNPerHa: 50 });

const pastureAfterLegume = computeWinterPastureNitrogenRecommendation({
  organicMatterPct: 2,
  pastureType: "ANNUAL_GRASS",
  targetDryMatterTonPerHa: 7,
  precedingLegume: true,
});
assert.equal(pastureAfterLegume.status, "READY_FOR_IMPLEMENTATION");
assert.deepEqual(pastureAfterLegume.dose, { kind: "EXACT", kgNPerHa: 170 });

const pastureRange = computeWinterPastureNitrogenRecommendation({
  organicMatterPct: 2,
  pastureType: "ANNUAL_GRASS",
  targetDryMatterTonPerHa: 7,
  precedingLegume: false,
});
assert.deepEqual(pastureRange.dose, { kind: "RANGE", minKgNPerHa: 170, maxKgNPerHa: 190 });

const legume = computeWinterPastureNitrogenRecommendation({
  organicMatterPct: 3,
  pastureType: "LEGUME",
  targetDryMatterTonPerHa: 5,
  precedingLegume: false,
  effectiveLegumeInoculation: true,
});
assert.deepEqual(legume.dose, { kind: "EXACT", kgNPerHa: 0 });

const failedLegume = computeWinterPastureNitrogenRecommendation({
  organicMatterPct: 3,
  pastureType: "LEGUME",
  targetDryMatterTonPerHa: 5,
  precedingLegume: false,
  provenLegumeInoculationFailure: true,
  numberOfUses: 4,
});
assert.deepEqual(failedLegume.dose, { kind: "EXACT", kgNPerHa: 40 });

assert.throws(() => computeCanolaNitrogenRecommendation({ organicMatterPct: 2, targetYieldTonPerHa: 0 }), /Meta produtiva/);
console.log("nitrogen-dose-engine: milho, trigo, canola e pastagem com gates conservadores aprovados");
