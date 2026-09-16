import assert from "node:assert/strict";
import { evaluatePrescriptionSnapshotConsistency } from "../src/domain/prescription-snapshot-consistency.ts";

for (const status of ["IN_REVIEW", "APPROVED", "PUBLISHED"]) {
  const current = evaluatePrescriptionSnapshotConsistency({
    snapshotSeasonUpdatedAt: "2026-09-14 01:30:00+00",
    currentSeasonUpdatedAt: "2026-09-14 01:30:00+00",
    snapshotInterpretationId: "interp-2",
    currentInterpretationId: "interp-2",
    currentInterpretationStatus: status,
  });
  assert.deepEqual(current, { current: true, reason: null });
}

const contextChanged = evaluatePrescriptionSnapshotConsistency({
  snapshotSeasonUpdatedAt: "2026-09-14 01:30:00+00",
  currentSeasonUpdatedAt: "2026-09-14 01:31:00+00",
  snapshotInterpretationId: "interp-2",
  currentInterpretationId: "interp-2",
  currentInterpretationStatus: "IN_REVIEW",
});
assert.equal(contextChanged.current, false);
assert.match(contextChanged.reason ?? "", /contexto agronômico/i);

const newerInterpretation = evaluatePrescriptionSnapshotConsistency({
  snapshotSeasonUpdatedAt: "2026-09-14 01:30:00+00",
  currentSeasonUpdatedAt: "2026-09-14 01:30:00+00",
  snapshotInterpretationId: "interp-2",
  currentInterpretationId: "interp-3",
  currentInterpretationStatus: "IN_REVIEW",
});
assert.equal(newerInterpretation.current, false);
assert.match(newerInterpretation.reason ?? "", /interpretação determinística/i);

const noCoverage = evaluatePrescriptionSnapshotConsistency({
  snapshotSeasonUpdatedAt: "2026-09-14 01:30:00+00",
  currentSeasonUpdatedAt: "2026-09-14 01:30:00+00",
  snapshotInterpretationId: "interp-2",
  currentInterpretationId: "interp-2",
  currentInterpretationStatus: "CALCULATED",
});
assert.equal(noCoverage.current, false);

assert.equal(evaluatePrescriptionSnapshotConsistency({
  snapshotSeasonUpdatedAt: null,
  currentSeasonUpdatedAt: "2026-09-14 01:30:00+00",
  snapshotInterpretationId: "interp-2",
  currentInterpretationId: "interp-2",
  currentInterpretationStatus: "IN_REVIEW",
}).current, false);

console.log("prescription-snapshot-consistency: decisão completa pode ser montada antes da assinatura sem perder freshness");
