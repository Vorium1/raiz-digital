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
assert.match(finalReviewRouteSource, /SUPER_ADMIN/);
assert.match(finalReviewRouteSource, /TENANT_ADMIN/);
assert.match(finalReviewRouteSource, /AGRONOMIST/);
assert.match(finalReviewRouteSource, /status:\s*403/);

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

// Um relatório antigo da mesma interpretação não pode fingir que já publicou uma prescrição regenerada.
// A relação oficial é nativa em reports; o audit log segue evidência secundária, não fonte primária.
const deliveryStatusSource = readFileSync(new URL("../src/lib/repositories/decision-delivery-status.ts", import.meta.url), "utf8");
assert.match(deliveryStatusSource, /r\.prescription_generation_id=prescription\.id/);
assert.doesNotMatch(deliveryStatusSource, /audit_events/);
assert.match(deliveryStatusSource, /interpretationFreshness\.current\s*&&\s*prescriptionCurrent/);

const premiumPublicationSource = readFileSync(new URL("../src/lib/repositories/premium-report-publication.ts", import.meta.url), "utf8");
assert.match(premiumPublicationSource, /approvedPrescriptionId:\s*approvedPrescription\.id/);
assert.match(premiumPublicationSource, /approvedPrescription/);
assert.match(premiumPublicationSource, /prescription_generation_id/);

// A rota oficial não pode regredir para o publisher v2 legado que não congela a prescrição aprovada.
const publishRouteSource = readFileSync(new URL("../src/app/api/interpretations/[id]/publish-report/route.ts", import.meta.url), "utf8");
assert.match(publishRouteSource, /publishPremiumFieldAnalysisReport/);
assert.doesNotMatch(publishRouteSource, /publishFieldAnalysisReport/);

// Publicação oficial da mesma decisão é concorrente-segura no servidor, não apenas escondida na UI.
// O lock exclusivo da interpretação serializa requests iguais; a segunda request encontra o vínculo nativo
// da primeira e falha ANTES de tocar o storage novamente. O índice UNIQUE reforça isso no PostgreSQL.
assert.match(premiumPublicationSource, /FOR UPDATE OF i/);
assert.match(premiumPublicationSource, /FOR SHARE OF a, cs/);
assert.match(premiumPublicationSource, /async function assertDecisionNotAlreadyPublished/);
assert.match(premiumPublicationSource, /r\.prescription_generation_id=\$3::uuid/);
assert.match(premiumPublicationSource, /já possui uma versão oficial publicada/i);
const duplicateGuardIndex = premiumPublicationSource.indexOf("await assertDecisionNotAlreadyPublished(client");
const storageWriteIndex = premiumPublicationSource.indexOf("const stored = await saveReportSnapshot");
assert.ok(duplicateGuardIndex >= 0 && storageWriteIndex > duplicateGuardIndex, "duplicidade deve ser bloqueada antes de gravar snapshot");

// A própria página do relatório precisa comparar o snapshot v3 com a prescrição viva antes de afirmar
// que a decisão atual já foi publicada. A mesma revisão de interpretação, sozinha, não é evidência suficiente.
const reportPageSource = readFileSync(new URL("../src/app/(platform)/relatorios/talhao/[analysisId]/page.tsx", import.meta.url), "utf8");
assert.match(reportPageSource, /publishedSnapshotV3\.approvedPrescription\.id === prescription\.id/);
assert.match(reportPageSource, /sameDecisionAsPublished/);
assert.match(reportPageSource, /!sameDecisionAsPublished && <PublishReportButton/);
assert.match(reportPageSource, /reportPublished=\{viewingPublished \|\| sameDecisionAsPublished\}/);
assert.doesNotMatch(reportPageSource, /reportPublished=\{Boolean\(publishedReport\)\}/);

console.log("agronomic-prescription-review: revisão final protegida + publicação exata, imutável e concorrente-segura");
