import assert from "node:assert/strict";
import { evaluateAnalysisContextFingerprintFreshness, evaluateNitrogenExecutionSnapshotFreshness, evaluatePrescriptionContextFreshness } from "../src/domain/prescription-context-freshness.ts";

assert.deepEqual(
  evaluatePrescriptionContextFreshness({
    generationCreatedAt: "2026-09-14T01:10:00.000Z",
    cropSeasonUpdatedAt: "2026-09-14T01:09:59.000Z",
  }),
  { current: true, reason: null },
);

assert.equal(
  evaluatePrescriptionContextFreshness({
    generationCreatedAt: "2026-09-14T01:10:00.000Z",
    cropSeasonUpdatedAt: "2026-09-14T01:10:00.000Z",
  }).current,
  true,
);

const stale = evaluatePrescriptionContextFreshness({
  generationCreatedAt: "2026-09-14T01:10:00.000Z",
  cropSeasonUpdatedAt: "2026-09-14T01:10:01.000Z",
});
assert.equal(stale.current, false);
assert.match(stale.reason ?? "", /mudou depois/i);

assert.equal(evaluatePrescriptionContextFreshness({ generationCreatedAt: null, cropSeasonUpdatedAt: null }).current, false);
assert.equal(evaluatePrescriptionContextFreshness({ generationCreatedAt: "data-invalida", cropSeasonUpdatedAt: "2026-09-14T01:10:01.000Z" }).current, false);

const analysisContextSame = evaluateAnalysisContextFingerprintFreshness({
  generationFingerprint: "abc123",
  currentFingerprint: "abc123",
});
assert.equal(analysisContextSame.current, true);

const analysisContextChanged = evaluateAnalysisContextFingerprintFreshness({
  generationFingerprint: "abc123",
  currentFingerprint: "def456",
});
assert.equal(analysisContextChanged.current, false);
assert.match(analysisContextChanged.reason ?? "", /contexto opcional da análise mudou/i);

const legacyWithoutAnalysisContextFingerprint = evaluateAnalysisContextFingerprintFreshness({
  generationFingerprint: null,
  currentFingerprint: "def456",
});
assert.equal(legacyWithoutAnalysisContextFingerprint.current, false);

const nExecSame = evaluateNitrogenExecutionSnapshotFreshness({
  generationExecutionId: "exec-n-1",
  currentExecutionId: "exec-n-1",
});
assert.equal(nExecSame.current, true);

const noNitrogenExecution = evaluateNitrogenExecutionSnapshotFreshness({
  generationExecutionId: null,
  currentExecutionId: null,
});
assert.equal(noNitrogenExecution.current, true, "ausência de N não pode virar requisito global");

const nitrogenChanged = evaluateNitrogenExecutionSnapshotFreshness({
  generationExecutionId: "exec-n-1",
  currentExecutionId: "exec-n-2",
});
assert.equal(nitrogenChanged.current, false);
assert.match(nitrogenChanged.reason ?? "", /nitrogênio mudou/i);

const nitrogenAddedAfterGeneration = evaluateNitrogenExecutionSnapshotFreshness({
  generationExecutionId: null,
  currentExecutionId: "exec-n-1",
});
assert.equal(nitrogenAddedAfterGeneration.current, false);

console.log("prescription-context-freshness: geração stale falha fechada após mudança de contexto");
