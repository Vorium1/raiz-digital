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
assert.equal(normalAnalysis.policy.finalProfessionalApprovalRequired, true);
assert.equal(normalAnalysis.policy.universalRmseThresholdAvailable, false);

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

const twoPoints = evaluateSpatialPrescriptionRequest({
  explicitRequested: true,
  hasFieldBoundary: true,
  hasReliableSampleCoordinates: true,
  activeSpatialPolicyId: "policy-rs-sc-v1",
  sampleCount: 2,
  hasSampleDepth: true,
  hasAnalyticalMethod: true,
  attributeQualityValidated: true,
  sampleDistribution: "DISTRIBUTED",
  requestedSpatialMethod: "THIESSEN",
  professionalSpatialReviewApproved: true,
});
assert.equal(twoPoints.canGenerateVariableRate, false);
assert.ok(twoPoints.blockers.includes("INSUFFICIENT_POINTS_FOR_2D_SURFACE"));
assert.equal(twoPoints.policy.interpolationClass, "NONE");

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
  professionalSpatialReviewApproved: true,
  crossValidationPassed: true,
});
assert.equal(fewPointsKriging.canGenerateVariableRate, false);
assert.ok(fewPointsKriging.blockers.includes("EXPLORATORY_ONLY_WITH_FEW_POINTS"));
assert.ok(fewPointsKriging.blockers.includes("KRIGING_NOT_ALLOWED_WITH_FEW_POINTS"));
assert.equal(fewPointsKriging.policy.interpolationClass, "EXPLORATORY_ONLY");

const mediumKrigingNeedsReview = evaluateSpatialPrescriptionRequest({
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
assert.equal(mediumKrigingNeedsReview.canGenerateVariableRate, false);
assert.ok(mediumKrigingNeedsReview.blockers.includes("PROFESSIONAL_SPATIAL_REVIEW_REQUIRED"));
assert.equal(mediumKrigingNeedsReview.policy.interpolationClass, "CANDIDATE_REVIEW");

const mediumKrigingReviewed = evaluateSpatialPrescriptionRequest({
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
  professionalSpatialReviewApproved: true,
});
assert.equal(mediumKrigingReviewed.canGenerateVariableRate, true);
assert.deepEqual(mediumKrigingReviewed.blockers, []);

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
  professionalSpatialReviewApproved: true,
  crossValidationPassed: false,
});
assert.equal(enoughPointsNoCv.canGenerateVariableRate, false);
assert.deepEqual(enoughPointsNoCv.blockers, ["CROSS_VALIDATION_REQUIRED"]);
assert.equal(enoughPointsNoCv.policy.interpolationClass, "CANDIDATE_WITH_CROSS_VALIDATION");

const enoughPointsCvButNoReview = evaluateSpatialPrescriptionRequest({
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
assert.equal(enoughPointsCvButNoReview.canGenerateVariableRate, false);
assert.deepEqual(enoughPointsCvButNoReview.blockers, ["PROFESSIONAL_SPATIAL_REVIEW_REQUIRED"]);

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
  professionalSpatialReviewApproved: true,
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
assert.ok(thiessenNeedsReview.blockers.includes("EXPLORATORY_ONLY_WITH_FEW_POINTS"));
assert.ok(thiessenNeedsReview.blockers.includes("PROFESSIONAL_SPATIAL_REVIEW_REQUIRED"));

const thiessenReviewedStillExploratory = evaluateSpatialPrescriptionRequest({
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
assert.equal(thiessenReviewedStillExploratory.canGenerateVariableRate, false);
assert.deepEqual(thiessenReviewedStillExploratory.blockers, ["EXPLORATORY_ONLY_WITH_FEW_POINTS"]);
assert.equal(thiessenReviewedStillExploratory.policy.interpolationClass, "EXPLORATORY_ONLY");

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
  professionalSpatialReviewApproved: true,
  crossValidationPassed: true,
});
assert.equal(collinear.canGenerateVariableRate, false);
assert.ok(collinear.blockers.includes("SAMPLE_DISTRIBUTION_INVALID"));

console.log("spatial-prescription-request: VRA opt-in, <50 exploratório, CV e aprovação humana final; no-extrapolation enforced");
