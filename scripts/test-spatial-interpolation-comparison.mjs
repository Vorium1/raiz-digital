import assert from "node:assert/strict";
import { evaluateSpatialAttributeEvidence } from "../src/domain/spatial-attribute-evidence.ts";
import { evaluateStoredSpatialInterpolationValidations } from "../src/domain/spatial-interpolation-context.ts";
import {
  compareAllValidatedSpatialMethods,
  compareValidatedSpatialMethods,
} from "../src/domain/spatial-interpolation-comparison.ts";

const attribute = evaluateSpatialAttributeEvidence({
  parameterCode: "P",
  observationCount: 70,
  distinctReliableCoordinateCount: 70,
  units: ["mg/dm³"],
  methods: ["Mehlich-1"],
  depthKnownCount: 70,
  depthBands: ["0–20 cm"],
  sampleDistribution: "DISTRIBUTED",
});

const storedDominance = [
  {
    parameterCode: "P",
    method: "KRIGING",
    sampleCount: 70,
    crossValidation: { strategy: "LOOCV", validationCount: 70, rmse: 1.0, mae: 0.7, meanError: 0.02 },
    variogram: { model: "SPHERICAL", nugget: 0.2, sill: 1.4, range: 180 },
    professionalMethodReviewApproved: true,
    reviewerNote: "Krigagem revisada.",
  },
  {
    parameterCode: "P",
    method: "IDW",
    sampleCount: 70,
    crossValidation: { strategy: "LOOCV", validationCount: 70, rmse: 1.3, mae: 0.9, meanError: -0.08 },
    variogram: null,
    professionalMethodReviewApproved: true,
    reviewerNote: "IDW revisado.",
  },
];

const validatedDominance = evaluateStoredSpatialInterpolationValidations({
  stored: storedDominance,
  attributes: [attribute],
});
const dominance = compareValidatedSpatialMethods({
  parameterCode: "P",
  validationEvidence: validatedDominance,
});
assert.equal(dominance.status, "PARETO_COMPARISON_AVAILABLE");
assert.equal(dominance.selectedMethod, null);
assert.equal(dominance.automaticMethodSelectionAllowed, false);
assert.equal(dominance.automaticVariableRateAllowed, false);
assert.equal(dominance.comparisonBasis.sampleCount, 70);
assert.equal(dominance.comparisonBasis.strategy, "LOOCV");
assert.equal(dominance.entries.find((item) => item.method === "KRIGING")?.paretoStatus, "NON_DOMINATED");
assert.equal(dominance.entries.find((item) => item.method === "IDW")?.paretoStatus, "DOMINATED");
assert.deepEqual(dominance.entries.find((item) => item.method === "IDW")?.dominatedBy, ["KRIGING"]);
assert.ok(dominance.limitations.includes("PARETO_DOMINANCE_DOES_NOT_AUTHORIZE_AUTOMATIC_SELECTION"));

const tradeoffStored = [
  storedDominance[0],
  {
    ...storedDominance[1],
    crossValidation: { strategy: "LOOCV", validationCount: 70, rmse: 1.1, mae: 0.6, meanError: 0.01 },
  },
];
const tradeoffEvidence = evaluateStoredSpatialInterpolationValidations({
  stored: tradeoffStored,
  attributes: [attribute],
});
const tradeoff = compareValidatedSpatialMethods({
  parameterCode: "P",
  validationEvidence: tradeoffEvidence,
});
assert.equal(tradeoff.status, "PARETO_COMPARISON_AVAILABLE");
assert.equal(tradeoff.entries.filter((item) => item.paretoStatus === "NON_DOMINATED").length, 2);
assert.ok(tradeoff.limitations.includes("MULTIPLE_PARETO_METHODS_REMAIN"));
assert.equal(tradeoff.selectedMethod, null);

const differentDesignStored = [
  storedDominance[0],
  {
    ...storedDominance[1],
    crossValidation: { strategy: "KFOLD", validationCount: 70, rmse: 1.2, mae: 0.8, meanError: 0.02 },
  },
];
const differentDesignEvidence = evaluateStoredSpatialInterpolationValidations({
  stored: differentDesignStored,
  attributes: [attribute],
});
const differentDesign = compareValidatedSpatialMethods({
  parameterCode: "P",
  validationEvidence: differentDesignEvidence,
});
assert.equal(differentDesign.status, "NOT_COMPARABLE_VALIDATION_DESIGN");
assert.equal(differentDesign.selectedMethod, null);
assert.ok(differentDesign.limitations.includes("SPATIAL_METHOD_VALIDATION_DESIGNS_DIFFER"));

const singleEvidence = evaluateStoredSpatialInterpolationValidations({
  stored: [storedDominance[0]],
  attributes: [attribute],
});
const single = compareValidatedSpatialMethods({
  parameterCode: "P",
  validationEvidence: singleEvidence,
});
assert.equal(single.status, "NOT_ENOUGH_VALIDATED_METHODS");
assert.equal(single.entries.length, 1);
assert.equal(single.selectedMethod, null);

const all = compareAllValidatedSpatialMethods(validatedDominance);
assert.equal(all.length, 1);
assert.equal(all[0].parameterCode, "P");

console.log("spatial-interpolation-comparison: same-design Pareto metrics compare methods without auto-selection or automatic VRA");
