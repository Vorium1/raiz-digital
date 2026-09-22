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

const ruleCurrent = evaluateAnalysisEvidenceFreshness({
  interpretationCreatedAt: "2026-09-16T02:10:00.000Z",
  latestImportCommittedAt: null,
  latestRuleUpdatedAt: "2026-09-16T02:00:00.000Z",
});
assert.deepEqual(ruleCurrent, { current: true, code: "CURRENT", reason: null });

const staleRules = evaluateAnalysisEvidenceFreshness({
  interpretationCreatedAt: "2026-09-07T14:08:30.377Z",
  latestImportCommittedAt: null,
  latestRuleUpdatedAt: "2026-09-10T01:45:06.730Z",
});
assert.equal(staleRules.current, false);
assert.equal(staleRules.code, "AGRONOMIC_RULES_CHANGED");
assert.match(staleRules.reason, /regras agronômicas.*atualizadas/i);

const profileChanged = evaluateAnalysisEvidenceFreshness({
  interpretationCreatedAt: "2026-09-16T02:10:00.000Z",
  latestImportCommittedAt: null,
  interpretationCropProfileId: "profile-old",
  currentCropProfileId: "profile-new",
  latestRuleUpdatedAt: "2026-09-01T00:00:00.000Z",
});
assert.equal(profileChanged.current, false);
assert.equal(profileChanged.code, "CROP_PROFILE_CHANGED");
assert.match(profileChanged.reason, /perfil agronômico da safra mudou/i);

const profileSame = evaluateAnalysisEvidenceFreshness({
  interpretationCreatedAt: "2026-09-16T02:10:00.000Z",
  latestImportCommittedAt: null,
  interpretationCropProfileId: "profile-current",
  currentCropProfileId: "profile-current",
  latestRuleUpdatedAt: "2026-09-01T00:00:00.000Z",
});
assert.equal(profileSame.current, true);

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

console.log("analysis evidence freshness: novo laudo ou regra agronômica atualizada invalidam interpretação anterior");
