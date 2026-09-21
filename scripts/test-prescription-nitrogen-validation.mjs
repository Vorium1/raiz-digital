import assert from "node:assert/strict";
import { validatePrescriptionNitrogenRecommendation } from "../src/domain/prescription-nitrogen-validation.ts";
import { deterministicLimitedPrescriptionProvider } from "../src/lib/ai/providers/deterministic-limited-prescription-provider.ts";
import { buildNitrogenOrganicMatterFingerprint } from "../src/domain/nitrogen-context.ts";
import { evaluatePersistedNitrogenExecution } from "../src/domain/nitrogen-prescription-evidence.ts";
import { buildRuleTrace } from "../src/domain/agronomic-rule-catalog.ts";

const exactRecommendation = {
  crop: "TRIGO",
  ruleId: "N-TRIGO-EMBRAPA-2026",
  ruleVersion: "1.0.0",
  sourceSnapshotId: "snapshot",
  status: "READY_FOR_IMPLEMENTATION",
  dose: { kind: "EXACT", kgNPerHa: 80 },
  sowingRangeKgNPerHa: { min: 15, max: 20 },
  blockers: [],
  notes: [],
  source: "Embrapa Trigo 2026",
  qualityObjective: {
    kind: "WHEAT_PROTEIN_QUALITY",
    requested: true,
    status: "REQUIRES_SPECIFIC_REVIEW",
    automaticAdditionalDoseAllowed: false,
    additionalDoseKgNPerHa: null,
    evidence: "Aplicação tardia de parte do N foi pouco efetiva, em geral, nos ambientes avaliados.",
    source: "Embrapa Trigo 2025",
  },
};

const current = {
  status: "CURRENT",
  executionId: "exec-n-1",
  executionStatus: "READY_FOR_IMPLEMENTATION",
  recommendation: exactRecommendation,
  ruleId: "N-TRIGO-EMBRAPA-2026",
  ruleVersion: "1.0.0",
  sourceSnapshotId: "snapshot",
  createdAt: "2026-09-21T00:00:00.000Z",
  limitations: [],
};

assert.deepEqual(
  validatePrescriptionNitrogenRecommendation({
    recommendations: [{ inputType: "N", quantity: 80, unit: "kg/ha" }],
    deterministicEvidence: current,
  }),
  { allowed: true, blockers: [], expectedKgNPerHa: 80 },
);

const missing = validatePrescriptionNitrogenRecommendation({
  recommendations: [],
  deterministicEvidence: current,
});
assert.equal(missing.allowed, false);
assert.ok(missing.blockers.includes("N_EXPECTED_RECOMMENDATION_MISSING"));

const divergent = validatePrescriptionNitrogenRecommendation({
  recommendations: [{ inputType: "Nitrogênio", quantity: 81, unit: "kg/ha" }],
  deterministicEvidence: current,
});
assert.equal(divergent.allowed, false);
assert.ok(divergent.blockers.includes("N_QUANTITY_DOES_NOT_MATCH_DETERMINISTIC_ENGINE"));

const wrongUnit = validatePrescriptionNitrogenRecommendation({
  recommendations: [{ inputType: "N", quantity: 80, unit: "kg N/ha" }],
  deterministicEvidence: current,
});
assert.equal(wrongUnit.allowed, false);
assert.ok(wrongUnit.blockers.includes("N_UNIT_MUST_BE_KG_PER_HA"));

const stale = validatePrescriptionNitrogenRecommendation({
  recommendations: [{ inputType: "N", quantity: 80, unit: "kg/ha" }],
  deterministicEvidence: {
    status: "STALE",
    executionId: "exec-old",
    recommendation: null,
    ruleId: "N-TRIGO-EMBRAPA-2026",
    limitations: ["N_EXECUTION_OM_FINGERPRINT_STALE"],
  },
});
assert.equal(stale.allowed, false);
assert.ok(stale.blockers.includes("N_EXECUTION_STALE"));

const rangeEvidence = {
  ...current,
  recommendation: {
    ...exactRecommendation,
    dose: { kind: "RANGE", minKgNPerHa: 0, maxKgNPerHa: 50 },
  },
};
const rangeNoDose = validatePrescriptionNitrogenRecommendation({
  recommendations: [],
  deterministicEvidence: rangeEvidence,
});
assert.equal(rangeNoDose.allowed, true);
assert.equal(rangeNoDose.expectedKgNPerHa, null);

const rangeInvented = validatePrescriptionNitrogenRecommendation({
  recommendations: [{ inputType: "N", quantity: 25, unit: "kg/ha" }],
  deterministicEvidence: rangeEvidence,
});
assert.equal(rangeInvented.allowed, false);
assert.ok(rangeInvented.blockers.includes("N_DETERMINISTIC_DOSE_NOT_EXACT_READY"));


const omFingerprint = buildNitrogenOrganicMatterFingerprint([
  { sampleCode: "P02", value: 2.3, unit: "%", method: "Walkley-Black" },
  { sampleCode: "P01", value: 2.1, unit: "%", method: "Walkley-Black" },
]);
const sameOmDifferentOrder = buildNitrogenOrganicMatterFingerprint([
  { sampleCode: "P01", value: 2.1, unit: "%", method: "Walkley-Black" },
  { sampleCode: "P02", value: 2.3, unit: "%", method: "Walkley-Black" },
]);
assert.equal(omFingerprint, sameOmDifferentOrder, "fingerprint deve ser canônico e independente da ordem");

const trace = buildRuleTrace("N-TRIGO-EMBRAPA-2026");
const persistedExecution = {
  id: "exec-persisted",
  ruleId: trace.ruleId,
  ruleVersion: trace.ruleVersion,
  sourceSnapshotId: trace.sourceSnapshotId,
  executionStatus: "READY_FOR_IMPLEMENTATION",
  createdAt: "2026-09-21T00:00:00.000Z",
  inputPayload: {
    seasonUpdatedAt: "2026-09-20T20:00:00.000Z",
    organicMatterFingerprint: omFingerprint,
  },
  outputPayload: {
    ...exactRecommendation,
    ruleVersion: trace.ruleVersion,
    sourceSnapshotId: trace.sourceSnapshotId,
  },
};

const persistedCurrent = evaluatePersistedNitrogenExecution({
  execution: persistedExecution,
  currentSeasonUpdatedAt: "2026-09-20T20:00:00.000Z",
  currentOrganicMatterFingerprint: omFingerprint,
});
assert.equal(persistedCurrent.status, "CURRENT");
assert.equal(persistedCurrent.recommendation?.dose.kind, "EXACT");

const persistedStaleOm = evaluatePersistedNitrogenExecution({
  execution: persistedExecution,
  currentSeasonUpdatedAt: "2026-09-20T20:00:00.000Z",
  currentOrganicMatterFingerprint: buildNitrogenOrganicMatterFingerprint([
    { sampleCode: "P01", value: 2.4, unit: "%", method: "Walkley-Black" },
  ]),
});
assert.equal(persistedStaleOm.status, "STALE");
assert.ok(persistedStaleOm.limitations.includes("N_EXECUTION_OM_FINGERPRINT_STALE"));

const legacyWithoutFingerprint = evaluatePersistedNitrogenExecution({
  execution: {
    ...persistedExecution,
    inputPayload: { seasonUpdatedAt: "2026-09-20T20:00:00.000Z" },
  },
  currentSeasonUpdatedAt: "2026-09-20T20:00:00.000Z",
  currentOrganicMatterFingerprint: omFingerprint,
});
assert.equal(legacyWithoutFingerprint.status, "STALE");
assert.ok(legacyWithoutFingerprint.limitations.includes("N_EXECUTION_OM_FINGERPRINT_MISSING"));

const providerEvidence = {
  results: [],
  technicalSources: [],
  deterministicInterpretation: null,
  season: { cropProfileCode: "TRIGO" },
  deterministicPkDoses: {
    P2O5: { ready: false, blockers: ["TEST_NO_P"] },
    K2O: { ready: false, blockers: ["TEST_NO_K"] },
  },
  deterministicNitrogenEvidence: current,
};

const providerResult = await deterministicLimitedPrescriptionProvider.prescribe({ evidence: providerEvidence });
const nRows = providerResult.prescription.recommendations.filter((item) => item.inputType === "N");
assert.equal(nRows.length, 1);
assert.equal(nRows[0].quantity, 80);
assert.equal(nRows[0].unit, "kg/ha");
assert.match(nRows[0].rationale, /execução rastreável exec-n-1/);
assert.match(providerResult.prescription.managementPractices.join(" "), /objetivo de proteína\/qualidade/i);
assert.equal(
  providerResult.prescription.recommendations.filter((item) => item.inputType === "N").length,
  1,
  "objetivo de proteína não pode criar uma segunda dose tardia de N",
);

console.log("prescription-nitrogen-validation: exact traced N transported; stale, range, wrong unit and divergence blocked");
