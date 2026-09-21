import assert from "node:assert/strict";
import { evaluateSpatialAttributeEvidence } from "../src/domain/spatial-attribute-evidence.ts";
import {
  evaluateStoredSpatialInterpolationValidations,
  parseSpatialInterpolationValidations,
} from "../src/domain/spatial-interpolation-context.ts";

function candidateAttribute(count = 70) {
  return evaluateSpatialAttributeEvidence({
    parameterCode: "P",
    observationCount: count,
    distinctReliableCoordinateCount: count,
    units: ["mg/dm³"],
    methods: ["Mehlich-1"],
    depthKnownCount: count,
    depthBands: ["0–20 cm"],
    sampleDistribution: "DISTRIBUTED",
  });
}

const validStored = [{
  parameterCode: "p",
  method: "KRIGING",
  sampleCount: 70,
  crossValidation: {
    strategy: "LOOCV",
    validationCount: 70,
    rmse: 1.2,
    mae: 0.9,
    meanError: 0.04,
  },
  variogram: {
    model: "SPHERICAL",
    nugget: 0.2,
    sill: 1.4,
    range: 180,
    experimentalLagCount: 10,
  },
  professionalMethodReviewApproved: true,
  reviewerNote: "Variograma e resíduos revisados.",
}];

const parsed = parseSpatialInterpolationValidations(validStored);
assert.equal(parsed.length, 1);
assert.equal(parsed[0].parameterCode, "P");
assert.equal(parsed[0].method, "KRIGING");

assert.throws(
  () => parseSpatialInterpolationValidations([...validStored, validStored[0]]),
  /duplicada/i,
);

const current = evaluateStoredSpatialInterpolationValidations({
  stored: validStored,
  attributes: [candidateAttribute(70)],
});
assert.equal(current.status, "RECORDED");
assert.equal(current.entries.length, 1);
assert.equal(current.entries[0].current, true);
assert.equal(current.entries[0].officialSurfaceAllowed, true);
assert.equal(current.entries[0].automaticVariableRateAllowed, false);
assert.deepEqual(current.entries[0].limitations, []);

const staleCount = evaluateStoredSpatialInterpolationValidations({
  stored: validStored,
  attributes: [candidateAttribute(71)],
});
assert.equal(staleCount.entries[0].current, false);
assert.equal(staleCount.entries[0].officialSurfaceAllowed, false);
assert.ok(staleCount.entries[0].limitations.includes("SPATIAL_VALIDATION_SAMPLE_COUNT_STALE"));

const exploratoryAttribute = evaluateSpatialAttributeEvidence({
  parameterCode: "P",
  observationCount: 20,
  distinctReliableCoordinateCount: 20,
  units: ["mg/dm³"],
  methods: ["Mehlich-1"],
  depthKnownCount: 20,
  depthBands: ["0–20 cm"],
  sampleDistribution: "DISTRIBUTED",
});
const exploratory = evaluateStoredSpatialInterpolationValidations({
  stored: [{ ...validStored[0], sampleCount: 20, crossValidation: { ...validStored[0].crossValidation, validationCount: 20 } }],
  attributes: [exploratoryAttribute],
});
assert.equal(exploratory.entries[0].current, false);
assert.ok(exploratory.entries[0].limitations.includes("SPATIAL_ATTRIBUTE_NOT_INTERPOLATION_CANDIDATE"));

const incomplete = evaluateStoredSpatialInterpolationValidations({
  stored: [{
    parameterCode: "P",
    method: "KRIGING",
    sampleCount: 70,
    crossValidation: null,
    variogram: validStored[0].variogram,
    professionalMethodReviewApproved: true,
    reviewerNote: "",
  }],
  attributes: [candidateAttribute(70)],
});
assert.equal(incomplete.entries[0].current, false);
assert.ok(incomplete.entries[0].limitations.includes("CROSS_VALIDATION_REQUIRED"));

const invalidContext = evaluateStoredSpatialInterpolationValidations({
  stored: [{ parameterCode: "P", method: "MAGIC" }],
  attributes: [candidateAttribute(70)],
});
assert.equal(invalidContext.status, "INVALID_CONTEXT");
assert.equal(invalidContext.entries.length, 0);
assert.equal(invalidContext.automaticVariableRateAllowed, false);

const absent = evaluateStoredSpatialInterpolationValidations({
  stored: null,
  attributes: [candidateAttribute(70)],
});
assert.equal(absent.status, "NOT_PROVIDED");
assert.deepEqual(absent.entries, []);

console.log("spatial-interpolation-context: persisted validation is optional, freshness-bound and never auto-authorizes VRA");
