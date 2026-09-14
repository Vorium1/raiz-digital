import assert from "node:assert/strict";
import { evaluateSpatialPrescriptionRequest } from "../src/domain/spatial-prescription-request.ts";

const normalAnalysis = evaluateSpatialPrescriptionRequest({
  explicitRequested: false,
  hasFieldBoundary: true,
  hasReliableSampleCoordinates: true,
  activeSpatialPolicyId: "policy-rs-sc-v1",
});
assert.equal(normalAnalysis.mode, "UNIFORM");
assert.equal(normalAnalysis.requested, false);
assert.equal(normalAnalysis.canGenerateVariableRate, false);
assert.deepEqual(normalAnalysis.blockers, []);
assert.equal(normalAnalysis.policy.extrapolationAllowed, false);
assert.equal(normalAnalysis.policy.noDataMustRemainNoData, true);

const requestedWithoutEvidence = evaluateSpatialPrescriptionRequest({
  explicitRequested: true,
  hasFieldBoundary: false,
  hasReliableSampleCoordinates: false,
  activeSpatialPolicyId: null,
});
assert.equal(requestedWithoutEvidence.mode, "VARIABLE_RATE");
assert.equal(requestedWithoutEvidence.canGenerateVariableRate, false);
for (const expected of [
  "FIELD_BOUNDARY_MISSING",
  "RELIABLE_SAMPLE_COORDINATES_MISSING",
  "SPATIAL_METHOD_POLICY_NOT_VALIDATED",
  "SAMPLE_COUNT_MISSING",
  "SAMPLE_DEPTH_MISSING",
  "ANALYTICAL_METHOD_MISSING",
  "ATTRIBUTE_QUALITY_NOT_VALIDATED",
  "SAMPLE_DISTRIBUTION_INVALID",
  "PROFESSIONAL_SPATIAL_REVIEW_REQUIRED",
]) assert.ok(requestedWithoutEvidence.blockers.includes(expected));

const fewPointsKriging = evaluateSpatialPrescriptionRequest({
  explicitRequested: true,
  hasFieldBoundary: true,
  hasReliableSampleCoordinates: true,
  activeSpatialPolicyId: "policy-rs-sc-v1",
  sampleCount: 30,
  hasSampleDepth: true,
  hasAnalyticalMethod: true,
  attributeQualityValidated: true,
  sampleDistribution: "DISTRIBUTED",
  requestedSpatialMethod: "KRIGING",
  crossValidationPassed: true,
});
assert.equal(fewPointsKriging.canGenerateVariableRate, false);
assert.ok(fewPointsKriging.blockers.includes("KRIGING_NOT_ALLOWED_WITH_FEW_POINTS"));
assert.equal(fewPointsKriging.policy.interpolationClass, "REVIEW_ONLY");

const mediumKriging = evaluateSpatialPrescriptionRequest({
  explicitRequested: true,
  hasFieldBoundary: true,
  hasReliableSampleCoordinates: true,
  activeSpatialPolicyId: "policy-rs-sc-v1",
  sampleCount: 70,
  hasSampleDepth: true,
  hasAnalyticalMethod: true,
  attributeQualityValidated: true,
  sampleDistribution: "DISTRIBUTED",
  requestedSpatialMethod: "KRIGING",
  crossValidationPassed: true,
});
assert.equal(mediumKriging.canGenerateVariableRate, false);
assert.ok(mediumKriging.blockers.includes("PROFESSIONAL_SPATIAL_REVIEW_REQUIRED"));

const enoughPointsNoCv = evaluateSpatialPrescriptionRequest({
  explicitRequested: true,
  hasFieldBoundary: true,
  hasReliableSampleCoordinates: true,
  activeSpatialPolicyId: "policy-rs-sc-v1",
  sampleCount: 120,
  hasSampleDepth: true,
  hasAnalyticalMethod: true,
  attributeQualityValidated: true,
  sampleDistribution: "DISTRIBUTED",
  requestedSpatialMethod: "KRIGING",
  crossValidationPassed: false,
});
assert.equal(enoughPointsNoCv.canGenerateVariableRate, false);
assert.deepEqual(enoughPointsNoCv.blockers, ["CROSS_VALIDATION_REQUIRED"]);
assert.equal(enoughPointsNoCv.policy.interpolationClass, "CANDIDATE_WITH_CROSS_VALIDATION");

const eligibleKriging = evaluateSpatialPrescriptionRequest({
  explicitRequested: true,
  hasFieldBoundary: true,
  hasReliableSampleCoordinates: true,
  activeSpatialPolicyId: "policy-rs-sc-v1",
  sampleCount: 120,
  hasSampleDepth: true,
  hasAnalyticalMethod: true,
  attributeQualityValidated: true,
  sampleDistribution: "DISTRIBUTED",
  requestedSpatialMethod: "KRIGING",
  crossValidationPassed: true,
});
assert.equal(eligibleKriging.canGenerateVariableRate, true);
assert.deepEqual(eligibleKriging.blockers, []);
assert.equal(eligibleKriging.policy.extrapolationAllowed, false);
assert.equal(eligibleKriging.policy.clipToFieldBoundaryRequired, true);
assert.equal(eligibleKriging.policy.supportMaskRequired, true);

const thiessenNeedsReview = evaluateSpatialPrescriptionRequest({
  explicitRequested: true,
  hasFieldBoundary: true,
  hasReliableSampleCoordinates: true,
  activeSpatialPolicyId: "policy-rs-sc-v1",
  sampleCount: 20,
  hasSampleDepth: true,
  hasAnalyticalMethod: true,
  attributeQualityValidated: true,
  sampleDistribution: "DISTRIBUTED",
  requestedSpatialMethod: "THIESSEN",
});
assert.equal(thiessenNeedsReview.canGenerateVariableRate, false);
assert.ok(thiessenNeedsReview.blockers.includes("PROFESSIONAL_SPATIAL_REVIEW_REQUIRED"));

const thiessenReviewed = evaluateSpatialPrescriptionRequest({
  explicitRequested: true,
  hasFieldBoundary: true,
  hasReliableSampleCoordinates: true,
  activeSpatialPolicyId: "policy-rs-sc-v1",
  sampleCount: 20,
  hasSampleDepth: true,
  hasAnalyticalMethod: true,
  attributeQualityValidated: true,
  sampleDistribution: "DISTRIBUTED",
  requestedSpatialMethod: "THIESSEN",
  professionalSpatialReviewApproved: true,
});
assert.equal(thiessenReviewed.canGenerateVariableRate, true);

const collinear = evaluateSpatialPrescriptionRequest({
  explicitRequested: true,
  hasFieldBoundary: true,
  hasReliableSampleCoordinates: true,
  activeSpatialPolicyId: "policy-rs-sc-v1",
  sampleCount: 150,
  hasSampleDepth: true,
  hasAnalyticalMethod: true,
  attributeQualityValidated: true,
  sampleDistribution: "COLLINEAR",
  requestedSpatialMethod: "KRIGING",
  crossValidationPassed: true,
});
assert.equal(collinear.canGenerateVariableRate, false);
assert.ok(collinear.blockers.includes("SAMPLE_DISTRIBUTION_INVALID"));

console.log("spatial-prescription-request: VRA opt-in, suporte amostral, revisão/CV e no-extrapolation enforced");
