import assert from "node:assert/strict";
import { evaluateSpatialPrescriptionRequest } from "../src/domain/spatial-prescription-request.ts";

const normalAnalysis = evaluateSpatialPrescriptionRequest({
  explicitRequested: false,
  hasFieldBoundary: true,
  hasReliableSampleCoordinates: true,
  activeSpatialPolicyId: "future-policy",
});
assert.deepEqual(normalAnalysis, {
  mode: "UNIFORM",
  requested: false,
  canGenerateVariableRate: false,
  blockers: [],
});

const requestedWithoutEvidence = evaluateSpatialPrescriptionRequest({
  explicitRequested: true,
  hasFieldBoundary: false,
  hasReliableSampleCoordinates: false,
  activeSpatialPolicyId: null,
});
assert.equal(requestedWithoutEvidence.mode, "VARIABLE_RATE");
assert.equal(requestedWithoutEvidence.canGenerateVariableRate, false);
assert.deepEqual(requestedWithoutEvidence.blockers, [
  "FIELD_BOUNDARY_MISSING",
  "RELIABLE_SAMPLE_COORDINATES_MISSING",
  "SPATIAL_METHOD_POLICY_NOT_VALIDATED",
]);

const requestedBeforePolicyValidation = evaluateSpatialPrescriptionRequest({
  explicitRequested: true,
  hasFieldBoundary: true,
  hasReliableSampleCoordinates: true,
  activeSpatialPolicyId: null,
});
assert.deepEqual(requestedBeforePolicyValidation.blockers, ["SPATIAL_METHOD_POLICY_NOT_VALIDATED"]);
assert.equal(requestedBeforePolicyValidation.canGenerateVariableRate, false);

const eligibleAfterExplicitRequestAndPolicy = evaluateSpatialPrescriptionRequest({
  explicitRequested: true,
  hasFieldBoundary: true,
  hasReliableSampleCoordinates: true,
  activeSpatialPolicyId: "policy-rs-sc-v1",
});
assert.deepEqual(eligibleAfterExplicitRequestAndPolicy, {
  mode: "VARIABLE_RATE",
  requested: true,
  canGenerateVariableRate: true,
  blockers: [],
});

console.log("spatial-prescription-request: taxa variável permanece opt-in e fail-closed");
