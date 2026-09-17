import assert from "node:assert/strict";
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

console.log("prescription-snapshot-consistency: draft aceita IN_REVIEW/APPROVED; política oficial segue exigindo APPROVED; mudanças falham fechadas");
