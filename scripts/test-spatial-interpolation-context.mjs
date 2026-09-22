import assert from "node:assert/strict";
import { evaluateSpatialAttributeEvidence } from "../src/domain/spatial-attribute-evidence.ts";
import { evaluateSpatialEvidenceEnvelope } from "../src/domain/spatial-prescription-request.ts";
import { deterministicLimitedPrescriptionProvider } from "../src/lib/ai/providers/deterministic-limited-prescription-provider.ts";
import {
  evaluateStoredSpatialInterpolationValidations,
  parseSpatialInterpolationValidations,
} from "../src/domain/spatial-interpolation-context.ts";

const CURRENT_FP = "a".repeat(32);
const CHANGED_FP = "b".repeat(32);

function candidateAttribute(count = 70, evidenceFingerprint = CURRENT_FP) {
  return evaluateSpatialAttributeEvidence({
    parameterCode: "P",
    observationCount: count,
    distinctReliableCoordinateCount: count,
    units: ["mg/dm³"],
    methods: ["Mehlich-1"],
    depthKnownCount: count,
    depthBands: ["0–20 cm"],
    sampleDistribution: "DISTRIBUTED",
    evidenceFingerprint,
  });
}

const validStored = [{
  parameterCode: "p",
  method: "KRIGING",
  sampleCount: 70,
  evidenceFingerprint: CURRENT_FP,
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

const fingerprintStale = evaluateStoredSpatialInterpolationValidations({
  stored: validStored,
  attributes: [candidateAttribute(70, CHANGED_FP)],
});
assert.equal(fingerprintStale.entries[0].current, false);
assert.equal(fingerprintStale.entries[0].officialSurfaceAllowed, false);
assert.ok(fingerprintStale.entries[0].limitations.includes("SPATIAL_VALIDATION_EVIDENCE_FINGERPRINT_STALE"));
assert.equal(fingerprintStale.entries[0].storedSampleCount, 70);
assert.equal(fingerprintStale.entries[0].currentSampleCount, 70, "mesmo n não pode esconder alteração do conjunto de evidências");

const exploratoryAttribute = evaluateSpatialAttributeEvidence({
  parameterCode: "P",
  observationCount: 20,
  distinctReliableCoordinateCount: 20,
  units: ["mg/dm³"],
  methods: ["Mehlich-1"],
  depthKnownCount: 20,
  depthBands: ["0–20 cm"],
  sampleDistribution: "DISTRIBUTED",
  evidenceFingerprint: CURRENT_FP,
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
    evidenceFingerprint: CURRENT_FP,
    crossValidation: null,
    variogram: validStored[0].variogram,
    professionalMethodReviewApproved: true,
    reviewerNote: "",
  }],
  attributes: [candidateAttribute(70)],
});
assert.equal(incomplete.entries[0].current, false);
assert.ok(incomplete.entries[0].limitations.includes("CROSS_VALIDATION_REQUIRED"));

const legacyMissingFingerprint = evaluateStoredSpatialInterpolationValidations({
  stored: [{
    ...validStored[0],
    evidenceFingerprint: null,
  }],
  attributes: [candidateAttribute(70)],
});
assert.equal(legacyMissingFingerprint.entries[0].current, false);
assert.ok(legacyMissingFingerprint.entries[0].limitations.includes("SPATIAL_VALIDATION_EVIDENCE_FINGERPRINT_MISSING"));

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

const providerBaseEvidence = {
  results: [],
  technicalSources: [],
  deterministicInterpretation: null,
  season: { cropProfileCode: "SOJA" },
  deterministicPkDoses: {
    P2O5: { ready: false, blockers: ["TEST_NO_P"] },
    K2O: { ready: false, blockers: ["TEST_NO_K"] },
  },
  spatialEvidenceEnvelope: evaluateSpatialEvidenceEnvelope({
    explicitRequested: true,
    hasFieldBoundary: true,
    totalPointCount: 70,
    reliablePointCount: 70,
    reliableLabLinkedPointCount: 70,
    distinctReliableLabCoordinateCount: 70,
    sampleDistribution: "DISTRIBUTED",
  }),
};

const providerCurrentValidation = await deterministicLimitedPrescriptionProvider.prescribe({
  evidence: {
    ...providerBaseEvidence,
    spatialInterpolationValidationEvidence: current,
  },
});
assert.equal(providerCurrentValidation.prescription.recommendations.length, 0);
assert.match(providerCurrentValidation.prescription.managementPractices.join(" "), /Espacial P: KRIGING possui validação técnica corrente/);
assert.match(providerCurrentValidation.prescription.managementPractices.join(" "), /RMSE 1,2/);
assert.match(providerCurrentValidation.prescription.managementPractices.join(" "), /superfície oficial candidata/);
assert.match(providerCurrentValidation.prescription.managementPractices.join(" "), /não autoriza dose espacial nem taxa variável automática/);

const providerStaleValidation = await deterministicLimitedPrescriptionProvider.prescribe({
  evidence: {
    ...providerBaseEvidence,
    spatialInterpolationValidationEvidence: staleCount,
  },
});
assert.match(providerStaleValidation.prescription.missingInformation.join(" "), /validação antiga não foi reutilizada/);

const providerFingerprintStale = await deterministicLimitedPrescriptionProvider.prescribe({
  evidence: {
    ...providerBaseEvidence,
    spatialInterpolationValidationEvidence: fingerprintStale,
  },
});
assert.match(providerFingerprintStale.prescription.missingInformation.join(" "), /número de pontos pode permanecer igual/);
assert.match(providerFingerprintStale.prescription.missingInformation.join(" "), /validação antiga foi marcada como desatualizada/);

const providerInvalidContext = await deterministicLimitedPrescriptionProvider.prescribe({
  evidence: {
    ...providerBaseEvidence,
    spatialInterpolationValidationEvidence: invalidContext,
  },
});
assert.match(providerInvalidContext.prescription.missingInformation.join(" "), /registro opcional de validação de interpolação inválido/);

console.log("spatial-interpolation-context: persisted validation is optional, freshness-bound and never auto-authorizes VRA");
