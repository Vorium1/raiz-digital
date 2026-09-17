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

// Solicitar ajustes pertence à mesma revisão final, mas deve acontecer antes de qualquer aprovação da interpretação.
const changesBranchIndex = finalReviewSource.indexOf('if (input.decision === "CHANGES_REQUESTED")');
const interpretationApprovalIndex = finalReviewSource.indexOf("reviewInterpretationWithClient(client");
assert.ok(changesBranchIndex >= 0);
assert.ok(interpretationApprovalIndex > changesBranchIndex);
assert.match(finalReviewSource, /decision:\s*"CHANGES_REQUESTED"/);
assert.match(finalReviewSource, /return \{ decision: input\.decision, interpretation: null, prescription \}/);

const finalReviewRouteSource = readFileSync(new URL("../src/app/api/analyses/[id]/final-review/route.ts", import.meta.url), "utf8");
assert.match(finalReviewRouteSource, /reviewFinalTechnicalReviewSafely/);
assert.match(finalReviewRouteSource, /body\.decision === "CHANGES_REQUESTED"/);

const ux2ReviewSource = readFileSync(new URL("../src/components/ux2-technical-review.tsx", import.meta.url), "utf8");
assert.match(ux2ReviewSource, /decision:\s*"APPROVED"/);
assert.match(ux2ReviewSource, /decision:\s*"CHANGES_REQUESTED"/);
assert.doesNotMatch(ux2ReviewSource, /\/api\/agronomic-prescriptions\//);

// Pós-aprovação: a UX só reflete entrega real e encaminha ao relatório; ela não publica silenciosamente.
const deliveryRouteSource = readFileSync(new URL("../src/app/api/analyses/[id]/delivery-status/route.ts", import.meta.url), "utf8");
assert.match(deliveryRouteSource, /getDecisionDeliveryStatuses/);
assert.match(ux2ReviewSource, /\/api\/analyses\/\$\{analysisId\}\/delivery-status/);
assert.match(ux2ReviewSource, /currentReportCount/);
assert.match(ux2ReviewSource, /\/relatorios\/talhao\/\$\{analysisId\}/);
assert.doesNotMatch(ux2ReviewSource, /publish-report/);

console.log("agronomic-prescription-review: transições protegidas + revisão final unificada + entrega real sem publicação silenciosa");
