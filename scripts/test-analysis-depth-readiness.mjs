import assert from "node:assert/strict";
import {
  emptyAnalysisEvidence,
  evaluateAnalysisDepthReadiness,
} from "../src/domain/analysis-depth-readiness.ts";

const empty = emptyAnalysisEvidence();
const quickEmpty = evaluateAnalysisDepthReadiness("interpretacao-rapida", empty);
assert.equal(quickEmpty.effectiveLayer, 0);
assert.equal(quickEmpty.completeForRequestedDepth, false);
assert.deepEqual(quickEmpty.missing.map((item) => item.code), ["CURRENT_SOIL_ANALYSIS_MISSING"]);

const quick = evaluateAnalysisDepthReadiness("interpretacao-rapida", {
  ...empty,
  currentSoilAnalysis: true,
});
assert.equal(quick.effectiveLayer, 1);
assert.equal(quick.completeForRequestedDepth, true);

const management = evaluateAnalysisDepthReadiness("recomendacao-manejo", {
  ...empty,
  currentSoilAnalysis: true,
  crop: true,
  yieldGoal: true,
  yieldUnit: true,
  samplingDepth: true,
  waterRegime: true,
  tillageSystem: true,
  managementHistory: "DECLARED_UNAVAILABLE",
});
assert.equal(management.effectiveLayer, 2);
assert.equal(management.completeForRequestedDepth, true);
assert.equal(management.limitations.length, 1);

const incompleteField = evaluateAnalysisDepthReadiness("analise-completa-campo", {
  ...empty,
  currentSoilAnalysis: true,
  crop: true,
  yieldGoal: true,
  yieldUnit: true,
  samplingDepth: true,
  waterRegime: true,
  tillageSystem: true,
  managementHistory: "PROVIDED",
  soilContext: true,
  yieldHistory: "MISSING",
  waterHistory: "DECLARED_UNAVAILABLE",
});
assert.equal(incompleteField.effectiveLayer, 2);
assert.equal(incompleteField.completeForRequestedDepth, false);
assert.ok(incompleteField.missing.some((item) => item.code === "YIELD_HISTORY_NOT_DECLARED"));

const full360WithoutSpatial = evaluateAnalysisDepthReadiness("diagnostico-360", {
  ...empty,
  currentSoilAnalysis: true,
  crop: true,
  yieldGoal: true,
  yieldUnit: true,
  samplingDepth: true,
  waterRegime: true,
  tillageSystem: true,
  managementHistory: "PROVIDED",
  soilContext: true,
  yieldHistory: "PROVIDED",
  waterHistory: "PROVIDED",
  multiSeasonHistory: "PROVIDED",
  weatherContext: "PROVIDED",
});
assert.equal(full360WithoutSpatial.effectiveLayer, 4);
assert.equal(full360WithoutSpatial.completeForRequestedDepth, true);
assert.equal(full360WithoutSpatial.spatialReady, true);
assert.deepEqual(full360WithoutSpatial.missing, []);

const spatialRequestedWithoutGeometry = evaluateAnalysisDepthReadiness("diagnostico-360", {
  ...empty,
  currentSoilAnalysis: true,
  crop: true,
  yieldGoal: true,
  yieldUnit: true,
  samplingDepth: true,
  waterRegime: true,
  tillageSystem: true,
  managementHistory: "PROVIDED",
  soilContext: true,
  yieldHistory: "PROVIDED",
  waterHistory: "PROVIDED",
  multiSeasonHistory: "DECLARED_UNAVAILABLE",
  weatherContext: "DECLARED_UNAVAILABLE",
  spatialRequested: true,
});
assert.equal(spatialRequestedWithoutGeometry.effectiveLayer, 4);
assert.equal(spatialRequestedWithoutGeometry.completeForRequestedDepth, true);
assert.equal(spatialRequestedWithoutGeometry.spatialReady, false);
assert.deepEqual(
  spatialRequestedWithoutGeometry.missing.filter((item) => item.blocks === "SPATIAL_ONLY").map((item) => item.code),
  ["FIELD_BOUNDARY_GEOREFERENCED_MISSING", "SAMPLE_COORDINATES_MISSING"],
);
assert.equal(spatialRequestedWithoutGeometry.limitations.length, 2);

const spatialReady = evaluateAnalysisDepthReadiness("diagnostico-360", {
  ...spatialRequestedWithoutGeometry,
  // spread above is intentionally not usable because it is a result, so rebuild flags below
  currentSoilAnalysis: true,
  samplingDepth: true,
  crop: true,
  yieldGoal: true,
  yieldUnit: true,
  waterRegime: true,
  tillageSystem: true,
  managementHistory: "PROVIDED",
  soilContext: true,
  yieldHistory: "PROVIDED",
  waterHistory: "PROVIDED",
  multiSeasonHistory: "PROVIDED",
  weatherContext: "PROVIDED",
  spatialRequested: true,
  fieldBoundaryGeoreferenced: true,
  samplesGeoreferenced: true,
});
assert.equal(spatialReady.spatialReady, true);
assert.equal(spatialReady.completeForRequestedDepth, true);

console.log("analysis-depth-readiness: níveis 1–4 progressivos, dados ausentes explícitos e espacial desacoplado do 360");
