import assert from "node:assert/strict";
import { evaluateAnalysisEvidenceFreshness } from "../src/domain/analysis-evidence-freshness.ts";

const unmanagedSource = evaluateAnalysisEvidenceFreshness({
  interpretationCreatedAt: "2026-09-16T02:00:00.000Z",
  latestImportCommittedAt: null,
});
assert.deepEqual(unmanagedSource, { current: true, code: "CURRENT", reason: null });

const current = evaluateAnalysisEvidenceFreshness({
  interpretationCreatedAt: "2026-09-16T02:10:00.000Z",
  latestImportCommittedAt: "2026-09-16T02:00:00.000Z",
});
assert.deepEqual(current, { current: true, code: "CURRENT", reason: null });

const sameTransactionBoundary = evaluateAnalysisEvidenceFreshness({
  interpretationCreatedAt: "2026-09-16T02:10:00.000Z",
  latestImportCommittedAt: "2026-09-16T02:10:00.000Z",
});
assert.equal(sameTransactionBoundary.current, true);

const stale = evaluateAnalysisEvidenceFreshness({
  interpretationCreatedAt: "2026-09-16T02:00:00.000Z",
  latestImportCommittedAt: "2026-09-16T02:10:00.000Z",
});
assert.equal(stale.current, false);
assert.equal(stale.code, "LAB_EVIDENCE_CHANGED");
assert.match(stale.reason, /laudo laboratorial foi alterado/i);

const missingInterpretationDate = evaluateAnalysisEvidenceFreshness({
  interpretationCreatedAt: null,
  latestImportCommittedAt: "2026-09-16T02:10:00.000Z",
});
assert.equal(missingInterpretationDate.current, false);
assert.equal(missingInterpretationDate.code, "INTERPRETATION_TIMESTAMP_MISSING");

const invalid = evaluateAnalysisEvidenceFreshness({
  interpretationCreatedAt: "invalido",
  latestImportCommittedAt: "2026-09-16T02:10:00.000Z",
});
assert.equal(invalid.current, false);
assert.equal(invalid.code, "INVALID_TRACE_TIMESTAMPS");

console.log("analysis evidence freshness: novo laudo invalida interpretação anterior de forma fail-closed");
