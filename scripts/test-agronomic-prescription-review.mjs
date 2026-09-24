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

// A migration 038 cria o vínculo nativo decisão->prescrição com FK composta tenant-safe.
// A 039 preserva esse vínculo, mas troca a unicidade rígida por índice de lookup porque a MESMA decisão
// pode ganhar uma nova versão imutável quando chega evidência NDVI mais nova.
const reportPublicationMigration = readFileSync(new URL("../db/migrations/038_report_snapshot_republication.sql", import.meta.url), "utf8");
const reportNdviRepublishMigration = readFileSync(new URL("../db/migrations/039_report_republish_on_new_ndvi.sql", import.meta.url), "utf8");
assert.match(reportPublicationMigration, /ADD COLUMN IF NOT EXISTS prescription_generation_id uuid/i);
assert.match(reportPublicationMigration, /approvedPrescriptionId/);
assert.match(reportPublicationMigration, /CREATE UNIQUE INDEX IF NOT EXISTS ai_generations_tenant_interpretation_generation_uidx/i);
assert.match(reportPublicationMigration, /ON ai_generations \(tenant_id, interpretation_id, id\)/i);
assert.match(reportPublicationMigration, /ag\.kind = 'AGRONOMIC_PRESCRIPTION'/i);
assert.match(reportPublicationMigration, /ag\.interpretation_id = r\.interpretation_id/i);
assert.match(reportPublicationMigration, /FOREIGN KEY \(tenant_id, interpretation_id, prescription_generation_id\)/i);
assert.match(reportPublicationMigration, /REFERENCES ai_generations \(tenant_id, interpretation_id, id\)/i);
assert.match(reportNdviRepublishMigration, /DROP INDEX IF EXISTS reports_decision_unique_idx/i);
assert.match(reportNdviRepublishMigration, /CREATE INDEX IF NOT EXISTS reports_decision_lookup_idx/i);
assert.match(reportNdviRepublishMigration, /published_at DESC/i);
assert.match(reportNdviRepublishMigration, /WHERE prescription_generation_id IS NOT NULL/i);

// A rota oficial não pode regredir para o publisher v2 legado que não congela a prescrição aprovada.
const publishRouteSource = readFileSync(new URL("../src/app/api/interpretations/[id]/publish-report/route.ts", import.meta.url), "utf8");
assert.match(publishRouteSource, /publishPremiumFieldAnalysisReport/);
assert.doesNotMatch(publishRouteSource, /publishFieldAnalysisReport/);

// Publicação oficial continua concorrente-segura e imutável.
// O lock exclusivo serializa requests iguais. Antes de gravar storage, a segunda request consulta a
// publicação mais recente da mesma decisão e só continua se houver evidência NDVI criada/arquivada depois.
assert.match(premiumPublicationSource, /FOR UPDATE OF i/);
assert.match(premiumPublicationSource, /FOR SHARE OF a, cs/);
assert.match(premiumPublicationSource, /async function getLatestDecisionPublication/);
assert.match(premiumPublicationSource, /r\.prescription_generation_id=\$3::uuid/);
assert.match(premiumPublicationSource, /ndviChangedAfterPreviousReport/);
assert.match(premiumPublicationSource, /alreadyCurrent: true/);
const duplicateGuardIndex = premiumPublicationSource.indexOf("const previousReport = await getLatestDecisionPublication");
const storageWriteIndex = premiumPublicationSource.indexOf("const stored = await saveReportSnapshot");
assert.ok(duplicateGuardIndex >= 0 && storageWriteIndex > duplicateGuardIndex, "deduplicação/refresh NDVI deve ser decidido antes de gravar snapshot");

// A própria página do relatório precisa comparar o snapshot v3 com a prescrição CORRENTE antes de afirmar
// que a decisão atual já foi publicada. Uma prescrição stale não pode fazer a publicação histórica parecer atual.
const reportPageSource = readFileSync(new URL("../src/app/(platform)/relatorios/talhao/[analysisId]/page.tsx", import.meta.url), "utf8");
assert.match(reportPageSource, /publishedSnapshotV3\.approvedPrescription\.id === currentPrescription\.id/);
assert.match(reportPageSource, /sameDecisionAsPublished/);
assert.match(reportPageSource, /publicationReadiness\?\.allowed && REVIEW_ROLES\.has\(session\.role\) && <PublishReportButton/);
assert.match(reportPageSource, /<PublishReportButton interpretationId=\{interpretation\.id\} analysisId=\{analysisId\}\/>/);
assert.doesNotMatch(reportPageSource, /!sameDecisionAsPublished && <PublishReportButton/);
assert.match(reportPageSource, /reportPublished=\{viewingPublished \|\| sameDecisionAsPublished\}/);
assert.doesNotMatch(reportPageSource, /reportPublished=\{Boolean\(publishedReport\)\}/);

console.log("agronomic-prescription-review: publicação exata, imutável, concorrente-segura e republicável com evidência nova ou plano comercial explícito");

assert.match(premiumPublicationSource, /const reportRevision = previousReport \? previousReport\.revision \+ 1 : interpretation\.revision/);
assert.match(premiumPublicationSource, /revision: reportRevision/);
assert.match(premiumPublicationSource, /approvedPrescription\.id, reportRevision, stored\.key/);
