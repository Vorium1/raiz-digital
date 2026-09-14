import assert from "node:assert/strict";
import { evaluateAgronomicEvidenceTransfer } from "../src/domain/agronomic-evidence-transferability.ts";

const baseProfile = {
  evidenceType: "CONTROLLED_FIELD_TRIAL",
  evidenceStrength: "TRANSFERRED_STRONG",
  criticalDimensions: ["crop", "soilTexture", "clayPct", "samplingDepthToCm", "waterRegime"],
  optionalDimensions: ["region", "managementSystem"],
  constraints: {
    crop: { kind: "CATEGORICAL", allowed: ["SOJA"] },
    soilTexture: { kind: "CATEGORICAL", allowed: ["ARGILOSA", "MUITO ARGILOSA"] },
    clayPct: { kind: "NUMERIC_RANGE", min: 45, max: 80, unit: "%" },
    samplingDepthToCm: { kind: "NUMERIC_RANGE", min: 20, max: 40, unit: "cm" },
    waterRegime: { kind: "CATEGORICAL", allowed: ["SEQUEIRO"] },
    region: { kind: "CATEGORICAL", allowed: ["GO", "DF", "MG"] },
    managementSystem: { kind: "CATEGORICAL", allowed: ["PLANTIO DIRETO"] },
  },
  quantitativeUseStatus: "CONTEXT_ONLY",
  quantitativeApplicabilityApproved: false,
};

const rsTarget = {
  crop: "soja",
  soilTexture: "argilosa",
  clayPct: 62,
  samplingDepthToCm: 20,
  waterRegime: "sequeiro",
  region: "RS",
  managementSystem: "plantio direto",
};

// A geografia não é barreira automática: se foi declarada apenas como dimensão opcional,
// solo/cultura/profundidade/sistema comparáveis preservam utilidade contextual.
const differentRegion = evaluateAgronomicEvidenceTransfer(baseProfile, rsTarget);
assert.equal(differentRegion.applicability, "PARTIALLY_COMPARABLE");
assert.deepEqual(differentRegion.mismatchedCriticalDimensions, []);
assert.deepEqual(differentRegion.mismatchedOptionalDimensions, ["region"]);
assert.equal(differentRegion.canSupportContextualAdvice, true);
assert.equal(differentRegion.canSupportQuantitativeRecommendation, false);
assert.equal(differentRegion.policy.geographyAloneDeterminesTransferability, false);
assert.equal(differentRegion.policy.similarityScoreUsed, false);

const comparable = evaluateAgronomicEvidenceTransfer(
  { ...baseProfile, optionalDimensions: ["managementSystem"] },
  rsTarget,
);
assert.equal(comparable.applicability, "STRONGLY_COMPARABLE");
assert.equal(comparable.canSupportContextualAdvice, true);
assert.equal(comparable.canSupportQuantitativeRecommendation, false);
assert.ok(comparable.reasons.includes("QUANTITATIVE_RULE_NOT_HOMOLOGATED"));

const direct = evaluateAgronomicEvidenceTransfer(
  { ...baseProfile, optionalDimensions: ["managementSystem"], directCalibration: true },
  rsTarget,
);
assert.equal(direct.applicability, "DIRECT");
assert.ok(direct.reasons.includes("DIRECT_CALIBRATION_CONFIRMED"));

const mismatch = evaluateAgronomicEvidenceTransfer(baseProfile, { ...rsTarget, crop: "MILHO" });
assert.equal(mismatch.applicability, "NOT_COMPARABLE");
assert.deepEqual(mismatch.mismatchedCriticalDimensions, ["crop"]);
assert.equal(mismatch.canSupportContextualAdvice, false);
assert.equal(mismatch.canSupportQuantitativeRecommendation, false);

const missingTarget = evaluateAgronomicEvidenceTransfer(baseProfile, { ...rsTarget, clayPct: null });
assert.equal(missingTarget.applicability, "INSUFFICIENT_CONTEXT");
assert.deepEqual(missingTarget.missingTargetCriticalDimensions, ["clayPct"]);

const { clayPct: _unused, ...constraintsWithoutClay } = baseProfile.constraints;
const missingSource = evaluateAgronomicEvidenceTransfer(
  { ...baseProfile, constraints: constraintsWithoutClay },
  rsTarget,
);
assert.equal(missingSource.applicability, "INSUFFICIENT_CONTEXT");
assert.deepEqual(missingSource.missingSourceCriticalDimensions, ["clayPct"]);

const missingOptional = evaluateAgronomicEvidenceTransfer(
  { ...baseProfile, optionalDimensions: ["managementSystem"] },
  { ...rsTarget, managementSystem: undefined },
);
assert.equal(missingOptional.applicability, "PARTIALLY_COMPARABLE");
assert.deepEqual(missingOptional.missingOptionalDimensions, ["managementSystem"]);

const mechanistic = evaluateAgronomicEvidenceTransfer(
  {
    evidenceType: "MECHANISTIC",
    evidenceStrength: "DIRECT_STRONG",
    criticalDimensions: ["crop"],
    constraints: { crop: { kind: "CATEGORICAL", allowed: ["SOJA"] } },
    quantitativeUseStatus: "HOMOLOGATED_DETERMINISTIC",
    quantitativeApplicabilityApproved: true,
    homologatedRuleId: "SHOULD-NOT-DOSE",
  },
  { crop: "SOJA" },
);
assert.equal(mechanistic.applicability, "MECHANISTIC_ONLY");
assert.equal(mechanistic.canSupportContextualAdvice, true);
assert.equal(mechanistic.canSupportQuantitativeRecommendation, false);

const conflicting = evaluateAgronomicEvidenceTransfer(
  {
    ...baseProfile,
    optionalDimensions: ["managementSystem"],
    evidenceStrength: "CONFLICTING",
    quantitativeUseStatus: "HOMOLOGATED_DETERMINISTIC",
    quantitativeApplicabilityApproved: true,
    homologatedRuleId: "TEST-CONFLICT",
  },
  rsTarget,
);
assert.equal(conflicting.applicability, "STRONGLY_COMPARABLE");
assert.equal(conflicting.canSupportQuantitativeRecommendation, false);
assert.ok(conflicting.reasons.includes("UNRESOLVED_EVIDENCE_CONFLICT"));

// Comparabilidade forte por si só nunca libera dose. Somente uma regra determinística
// explicitamente homologada + aplicabilidade quantitativa aprovada pode fazê-lo.
const homologated = evaluateAgronomicEvidenceTransfer(
  {
    ...baseProfile,
    optionalDimensions: ["managementSystem"],
    evidenceStrength: "DIRECT_STRONG",
    quantitativeUseStatus: "HOMOLOGATED_DETERMINISTIC",
    quantitativeApplicabilityApproved: true,
    homologatedRuleId: "PK-SOJA-EXEMPLO-HOMOLOGADO",
  },
  rsTarget,
);
assert.equal(homologated.applicability, "STRONGLY_COMPARABLE");
assert.equal(homologated.canSupportQuantitativeRecommendation, true);
assert.equal(homologated.quantitativeRuleId, "PK-SOJA-EXEMPLO-HOMOLOGADO");

console.log("agronomic-evidence-transferability: contexto, conflito e gate quantitativo fail-closed aprovados");
