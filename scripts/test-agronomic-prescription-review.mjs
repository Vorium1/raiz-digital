import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { evaluatePrescriptionReviewTransition } from "../src/domain/agronomic-prescription-review.ts";

for (const decision of ["APPROVED", "CHANGES_REQUESTED", "REJECTED"]) {
  const first = evaluatePrescriptionReviewTransition("PENDING_REVIEW", decision);
  assert.equal(first.allowed, true);
  assert.equal(first.noOp, false);
  assert.equal(first.shouldPromoteRecommendations, decision === "APPROVED");
}

for (const status of ["APPROVED", "CHANGES_REQUESTED", "REJECTED"]) {
  const repeated = evaluatePrescriptionReviewTransition(status, status);
  assert.deepEqual(repeated, {
    allowed: true,
    noOp: true,
    shouldPromoteRecommendations: false,
    reason: null,
  });
}

assert.equal(evaluatePrescriptionReviewTransition("APPROVED", "REJECTED").allowed, false);
assert.equal(evaluatePrescriptionReviewTransition("APPROVED", "CHANGES_REQUESTED").allowed, false);
assert.equal(evaluatePrescriptionReviewTransition("CHANGES_REQUESTED", "APPROVED").allowed, false);
assert.equal(evaluatePrescriptionReviewTransition("REJECTED", "APPROVED").allowed, false);

// Contrato de segurança UX 2.0: a promoção continua exigindo a interpretação APPROVED.
const prescriptionReviewSource = readFileSync(new URL("../src/lib/repositories/prescription-review.ts", import.meta.url), "utf8");
assert.match(prescriptionReviewSource, /latestInterpretationStatus\s*!==\s*"APPROVED"/);
assert.match(prescriptionReviewSource, /validatePrescriptionPkRecommendations/);

// A aprovação final não pode encadear duas transações independentes. Ela abre uma única withTenant e
// chama as duas operações que recebem o mesmo client; qualquer falha na segunda etapa provoca rollback da primeira.
const finalReviewSource = readFileSync(new URL("../src/lib/repositories/final-technical-review.ts", import.meta.url), "utf8");
assert.match(finalReviewSource, /return withTenant/);
assert.match(finalReviewSource, /reviewInterpretationWithClient\(client/);
assert.match(finalReviewSource, /reviewAgronomicPrescriptionWithClient\(client/);
assert.doesNotMatch(finalReviewSource, /reviewInterpretationSafely/);
assert.doesNotMatch(finalReviewSource, /reviewAgronomicPrescriptionSafely/);
assert.match(finalReviewSource, /prescriptionInterpretationId !== input\.interpretationId/);

console.log("agronomic-prescription-review: transições protegidas + promoção APPROVED + revisão final em transação única");
