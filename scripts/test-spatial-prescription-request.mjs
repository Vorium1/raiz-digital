import assert from "node:assert/strict";
import { evaluateSpatialEvidenceEnvelope, evaluateSpatialInterpolationValidation, evaluateSpatialPrescriptionRequest } from "../src/domain/spatial-prescription-request.ts";
import { deterministicLimitedPrescriptionProvider } from "../src/lib/ai/providers/deterministic-limited-prescription-provider.ts";

const krigingMissingVariogram = evaluateSpatialInterpolationValidation({
  method: "KRIGING",
  sampleCount: 70,
  crossValidation: { strategy: "LOOCV", validationCount: 70, rmse: 1.2, mae: 0.9, meanError: 0.05 },
  professionalMethodReviewApproved: true,
});
assert.equal(krigingMissingVariogram.status, "EVIDENCE_INCOMPLETE");
assert.equal(krigingMissingVariogram.officialSurfaceAllowed, false);
assert.ok(krigingMissingVariogram.blockers.includes("KRIGING_VARIOGRAM_REQUIRED"));

const invalidMetrics = evaluateSpatialInterpolationValidation({
  method: "IDW",
  sampleCount: 70,
  crossValidation: { strategy: "LOOCV", validationCount: 70, rmse: 0.8, mae: 1.1, meanError: 0 },
  professionalMethodReviewApproved: true,
});
assert.equal(invalidMetrics.status, "INVALID_EVIDENCE");
assert.ok(invalidMetrics.blockers.includes("CROSS_VALIDATION_METRICS_INCONSISTENT"));

const idwNeedsMethodReview = evaluateSpatialInterpolationValidation({
  method: "IDW",
  sampleCount: 70,
  crossValidation: { strategy: "LOOCV", validationCount: 70, rmse: 1.0, mae: 0.7, meanError: -0.02 },
});
assert.equal(idwNeedsMethodReview.status, "REVIEW_REQUIRED");
assert.equal(idwNeedsMethodReview.officialSurfaceAllowed, false);
assert.equal(idwNeedsMethodReview.policy.universalRmseThresholdAvailable, false);
assert.equal(idwNeedsMethodReview.policy.universalMaeThresholdAvailable, false);
assert.equal(idwNeedsMethodReview.policy.universalMeanErrorThresholdAvailable, false);

const validKriging70 = evaluateSpatialInterpolationValidation({
  method: "KRIGING",
  sampleCount: 70,
  crossValidation: { strategy: "LOOCV", validationCount: 70, rmse: 1.2, mae: 0.9, meanError: 0.05 },
  variogram: { model: "SPHERICAL", nugget: 0.2, sill: 1.4, range: 180, experimentalLagCount: 10 },
  professionalMethodReviewApproved: true,
});
assert.equal(validKriging70.status, "VALIDATED_FOR_OFFICIAL_SURFACE");
assert.equal(validKriging70.officialSurfaceAllowed, true);
assert.equal(validKriging70.automaticMethodSelectionAllowed, false);
assert.equal(validKriging70.automaticVariableRateAllowed, false);

const validKriging120 = evaluateSpatialInterpolationValidation({
  method: "KRIGING",
  sampleCount: 120,
  crossValidation: { strategy: "LOOCV", validationCount: 120, rmse: 1.1, mae: 0.8, meanError: 0.01 },
  variogram: { model: "EXPONENTIAL", nugget: 0.1, sill: 1.2, range: 220, experimentalLagCount: 12 },
  professionalMethodReviewApproved: true,
});
assert.equal(validKriging120.status, "VALIDATED_FOR_OFFICIAL_SURFACE");

const validKriging150 = evaluateSpatialInterpolationValidation({
  method: "KRIGING",
  sampleCount: 150,
  crossValidation: { strategy: "LOOCV", validationCount: 150, rmse: 1.0, mae: 0.75, meanError: 0 },
  variogram: { model: "GAUSSIAN", nugget: 0.15, sill: 1.3, range: 240 },
  professionalMethodReviewApproved: true,
});

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
  interpolationValidation: validKriging70,
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
  interpolationValidation: validKriging70,
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
  interpolationValidation: evaluateSpatialInterpolationValidation({
    method: "KRIGING",
    sampleCount: 120,
    variogram: { model: "SPHERICAL", nugget: 0.1, sill: 1.1, range: 200 },
    professionalMethodReviewApproved: true,
  }),
});
assert.equal(enoughPointsNoCv.canGenerateVariableRate, false);
assert.ok(enoughPointsNoCv.blockers.includes("INTERPOLATION_VALIDATION_REQUIRED"));
assert.ok(enoughPointsNoCv.blockers.includes("CROSS_VALIDATION_REQUIRED"));
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
  interpolationValidation: validKriging120,
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
  interpolationValidation: validKriging120,
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
  interpolationValidation: validKriging150,
});
assert.equal(collinear.canGenerateVariableRate, false);
assert.ok(collinear.blockers.includes("SAMPLE_DISTRIBUTION_INVALID"));

const spatialEnvelopeNotRequested = evaluateSpatialEvidenceEnvelope({
  explicitRequested: false,
  hasFieldBoundary: true,
  totalPointCount: 120,
  reliablePointCount: 120,
  reliableLabLinkedPointCount: 120,
  distinctReliableLabCoordinateCount: 120,
  sampleDistribution: "DISTRIBUTED",
});
assert.equal(spatialEnvelopeNotRequested.status, "NOT_REQUESTED");
assert.deepEqual(spatialEnvelopeNotRequested.limitations, []);
assert.equal(spatialEnvelopeNotRequested.automaticVariableRateAllowed, false);

const spatialEnvelopeTwoPoints = evaluateSpatialEvidenceEnvelope({
  explicitRequested: true,
  hasFieldBoundary: true,
  totalPointCount: 2,
  reliablePointCount: 2,
  reliableLabLinkedPointCount: 2,
  distinctReliableLabCoordinateCount: 2,
  sampleDistribution: "UNKNOWN",
});
assert.equal(spatialEnvelopeTwoPoints.status, "POINTS_ONLY");
assert.ok(spatialEnvelopeTwoPoints.limitations.includes("INSUFFICIENT_POINTS_FOR_2D_SURFACE"));

const spatialEnvelopeExploratory = evaluateSpatialEvidenceEnvelope({
  explicitRequested: true,
  hasFieldBoundary: true,
  totalPointCount: 20,
  reliablePointCount: 18,
  reliableLabLinkedPointCount: 17,
  distinctReliableLabCoordinateCount: 16,
  sampleDistribution: "DISTRIBUTED",
});
assert.equal(spatialEnvelopeExploratory.status, "EXPLORATORY_ONLY");
assert.ok(spatialEnvelopeExploratory.limitations.includes("UNRELIABLE_COORDINATES_EXCLUDED"));
assert.ok(spatialEnvelopeExploratory.limitations.includes("POINTS_WITHOUT_LAB_EVIDENCE_EXCLUDED"));
assert.ok(spatialEnvelopeExploratory.limitations.includes("DUPLICATE_SPATIAL_SUPPORT_EXCLUDED"));
assert.ok(spatialEnvelopeExploratory.limitations.includes("EXPLORATORY_ONLY_WITH_FEW_POINTS"));

const spatialEnvelopeCollinear = evaluateSpatialEvidenceEnvelope({
  explicitRequested: true,
  hasFieldBoundary: true,
  totalPointCount: 80,
  reliablePointCount: 80,
  reliableLabLinkedPointCount: 80,
  distinctReliableLabCoordinateCount: 80,
  sampleDistribution: "COLLINEAR",
});
assert.equal(spatialEnvelopeCollinear.status, "POINTS_ONLY");
assert.ok(spatialEnvelopeCollinear.limitations.includes("SAMPLE_DISTRIBUTION_COLLINEAR"));

const spatialEnvelopeCandidate = evaluateSpatialEvidenceEnvelope({
  explicitRequested: true,
  hasFieldBoundary: true,
  totalPointCount: 80,
  reliablePointCount: 80,
  reliableLabLinkedPointCount: 80,
  distinctReliableLabCoordinateCount: 80,
  sampleDistribution: "DISTRIBUTED",
});
assert.equal(spatialEnvelopeCandidate.status, "INTERPOLATION_CANDIDATE");
assert.equal(spatialEnvelopeCandidate.automaticInterpolationAllowed, false);
assert.equal(spatialEnvelopeCandidate.automaticVariableRateAllowed, false);
assert.ok(spatialEnvelopeCandidate.limitations.includes("TARGET_ATTRIBUTE_AND_METHOD_SELECTION_REQUIRED"));
assert.ok(spatialEnvelopeCandidate.limitations.includes("PROFESSIONAL_SPATIAL_REVIEW_REQUIRED"));

const methodlessCountPolicy = evaluateSpatialPrescriptionRequest({
  explicitRequested: true,
  hasFieldBoundary: true,
  hasReliableSampleCoordinates: true,
  activeSpatialPolicyId: "policy-rs-sc-v1",
  sampleCount: 70,
  hasSampleDepth: true,
  hasAnalyticalMethod: true,
  attributeQualityValidated: true,
  sampleDistribution: "DISTRIBUTED",
  requestedSpatialMethod: null,
});
assert.equal(methodlessCountPolicy.policy.interpolationClass, "CANDIDATE_REVIEW");
assert.equal(methodlessCountPolicy.canGenerateVariableRate, false);

const providerBaseEvidence = {
  results: [],
  technicalSources: [],
  deterministicInterpretation: null,
  season: { cropProfileCode: "SOJA" },
  deterministicPkDoses: {
    P2O5: { ready: false, blockers: ["TEST_NO_P"] },
    K2O: { ready: false, blockers: ["TEST_NO_K"] },
  },
};

const providerNoSpatial = await deterministicLimitedPrescriptionProvider.prescribe({
  evidence: {
    ...providerBaseEvidence,
    spatialEvidenceEnvelope: spatialEnvelopeNotRequested,
  },
});
assert.doesNotMatch(providerNoSpatial.prescription.managementPractices.join(" "), /Análise espacial|taxa variável/i);

const providerSpatialCandidate = await deterministicLimitedPrescriptionProvider.prescribe({
  evidence: {
    ...providerBaseEvidence,
    spatialEvidenceEnvelope: spatialEnvelopeCandidate,
  },
});
assert.equal(providerSpatialCandidate.prescription.recommendations.length, 0);
assert.match(providerSpatialCandidate.prescription.managementPractices.join(" "), /80 posições distintas/);
assert.match(providerSpatialCandidate.prescription.managementPractices.join(" "), /não escolheu atributo, IDW\/krigagem\/Thiessen/i);
assert.match(providerSpatialCandidate.prescription.managementPractices.join(" "), /validação cruzada e métricas preservadas antes de qualquer superfície oficial/i);

const providerSpatialExploratory = await deterministicLimitedPrescriptionProvider.prescribe({
  evidence: {
    ...providerBaseEvidence,
    spatialEvidenceEnvelope: spatialEnvelopeExploratory,
  },
});
assert.match(providerSpatialExploratory.prescription.managementPractices.join(" "), /somente exploração visual\/zonas auxiliares/i);
assert.match(providerSpatialExploratory.prescription.missingInformation.join(" "), /sem coordenada observada ou fonte GPS auditada/i);
assert.match(providerSpatialExploratory.prescription.missingInformation.join(" "), /sem evidência laboratorial vinculada/i);
assert.match(providerSpatialExploratory.prescription.missingInformation.join(" "), /coordenadas duplicadas/i);

console.log("spatial-prescription-request: VRA opt-in, <50 exploratório, CV métrica + variograma da krigagem + dupla revisão humana; no-extrapolation enforced");
