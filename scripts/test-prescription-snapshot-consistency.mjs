import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  evaluatePrescriptionDraftSnapshotConsistency,
  evaluatePrescriptionSnapshotConsistency,
} from "../src/domain/prescription-snapshot-consistency.ts";

const approvedCurrent = {
  snapshotSeasonUpdatedAt: "2026-09-14 01:30:00+00",
  currentSeasonUpdatedAt: "2026-09-14 01:30:00+00",
  snapshotInterpretationId: "interp-2",
  currentInterpretationId: "interp-2",
  currentInterpretationStatus: "APPROVED",
};
assert.deepEqual(evaluatePrescriptionSnapshotConsistency(approvedCurrent), { current: true, reason: null });
assert.deepEqual(evaluatePrescriptionDraftSnapshotConsistency(approvedCurrent), { current: true, reason: null });

const inReviewCurrent = {
  ...approvedCurrent,
  currentInterpretationStatus: "IN_REVIEW",
};
assert.deepEqual(evaluatePrescriptionDraftSnapshotConsistency(inReviewCurrent), { current: true, reason: null });
assert.equal(evaluatePrescriptionSnapshotConsistency(inReviewCurrent).current, false);
assert.match(evaluatePrescriptionSnapshotConsistency(inReviewCurrent).reason ?? "", /APPROVED/i);

for (const status of [null, "CALCULATED", "PUBLISHED", "REJECTED"]) {
  const result = evaluatePrescriptionDraftSnapshotConsistency({
    ...approvedCurrent,
    currentInterpretationStatus: status,
  });
  assert.equal(result.current, false, `draft deve falhar fechado para ${status}`);
  assert.match(result.reason ?? "", /IN_REVIEW\/APPROVED/i);
}

const contextChanged = evaluatePrescriptionDraftSnapshotConsistency({
  ...inReviewCurrent,
  currentSeasonUpdatedAt: "2026-09-14 01:31:00+00",
});
assert.equal(contextChanged.current, false);
assert.match(contextChanged.reason ?? "", /contexto agronômico/i);

const newerInterpretation = evaluatePrescriptionDraftSnapshotConsistency({
  ...inReviewCurrent,
  currentInterpretationId: "interp-3",
});
assert.equal(newerInterpretation.current, false);
assert.match(newerInterpretation.reason ?? "", /interpretação determinística/i);

assert.equal(evaluatePrescriptionDraftSnapshotConsistency({
  ...inReviewCurrent,
  snapshotSeasonUpdatedAt: null,
}).current, false);

// Contrato da corrida com o provedor: depois da chamada externa, contexto e laudo são relidos antes de persistir.
const workflowSource = readFileSync(new URL("../src/lib/workflows/agronomic-prescription-draft.ts", import.meta.url), "utf8");
const planningRepositorySource = readFileSync(new URL("../src/lib/repositories/analyses.ts", import.meta.url), "utf8");
const generationRepositorySource = readFileSync(new URL("../src/lib/repositories/prescription-generation.ts", import.meta.url), "utf8");
const freshnessRepositorySource = readFileSync(new URL("../src/lib/repositories/prescription-freshness.ts", import.meta.url), "utf8");
const providerIndex = workflowSource.indexOf("await provider.prescribe");
const afterProviderIndex = workflowSource.indexOf("interpretationAfterProvider");
const persistIndex = workflowSource.indexOf("recordAgronomicPrescriptionGenerationSafely({");
assert.ok(providerIndex >= 0, "workflow deve chamar o provedor");
assert.ok(afterProviderIndex > providerIndex, "evidências devem ser relidas depois do provedor");
assert.ok(persistIndex > afterProviderIndex, "persistência só pode ocorrer depois da revalidação pós-provedor");
assert.match(workflowSource, /evidenceAfterProvider\.freshness\.current/);
assert.match(workflowSource, /A resposta antiga foi descartada/);
assert.match(workflowSource, /validatePrescriptionPkRecommendations/);
assert.match(workflowSource, /A geração foi descartada e nada foi salvo/);
assert.match(workflowSource, /planningFreshnessBeforeProvider/);
assert.match(workflowSource, /planningFreshnessAfterProvider/);
assert.match(workflowSource, /expectedAnalysisContextFingerprint:\s*evidence\.analysis\.contextFingerprint/);
assert.match(generationRepositorySource, /analysisContextFingerprint/);
assert.match(generationRepositorySource, /evaluateAnalysisContextFingerprintFreshness/);
assert.match(freshnessRepositorySource, /generationAnalysisContextFingerprint/);
assert.match(freshnessRepositorySource, /currentAnalysisContextFingerprint/);

const planningUpdateIndex = planningRepositorySource.indexOf("export async function updateAnalysisPlanningContext");
assert.ok(planningUpdateIndex >= 0);
const planningUpdateSource = planningRepositorySource.slice(planningUpdateIndex);
assert.doesNotMatch(
  planningUpdateSource,
  /UPDATE crop_seasons\s+SET updated_at = now\(\)/,
  "refinamento opcional não pode invalidar o motor de N tocando a safra",
);
assert.match(planningRepositorySource, /md5\(coalesce\(analysis_context, '\{\}'::jsonb\)::text\) AS "contextFingerprint"/);

console.log("prescription-snapshot-consistency: draft aceita IN_REVIEW/APPROVED; mudanças durante o provedor são descartadas antes de persistir");
