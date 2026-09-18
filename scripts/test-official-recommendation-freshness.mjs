import assert from "node:assert/strict";
import { evaluateOfficialRecommendationFreshness } from "../src/domain/official-recommendation-freshness.ts";

const current = evaluateOfficialRecommendationFreshness({
  sourceKind: "AI",
  generationStatus: "APPROVED",
  generationCreatedAt: "2026-09-14T02:00:00.000Z",
  cropSeasonUpdatedAt: "2026-09-14T01:59:00.000Z",
  generationInterpretationId: "interp-2",
  latestInterpretationId: "interp-2",
  latestInterpretationStatus: "APPROVED",
  latestInterpretationCreatedAt: "2026-09-14T01:58:00.000Z",
  latestImportCommittedAt: "2026-09-14T01:57:00.000Z",
});
assert.deepEqual(current, { current: true, code: "CURRENT", reason: null });

const changedContext = evaluateOfficialRecommendationFreshness({
  sourceKind: "AI",
  generationStatus: "APPROVED",
  generationCreatedAt: "2026-09-14T02:00:00.000Z",
  cropSeasonUpdatedAt: "2026-09-14T02:01:00.000Z",
  generationInterpretationId: "interp-2",
  latestInterpretationId: "interp-2",
  latestInterpretationStatus: "APPROVED",
});
assert.equal(changedContext.current, false);
assert.equal(changedContext.code, "CONTEXT_CHANGED");

const newerInterpretation = evaluateOfficialRecommendationFreshness({
  sourceKind: "AI",
  generationStatus: "APPROVED",
  generationCreatedAt: "2026-09-14T02:00:00.000Z",
  cropSeasonUpdatedAt: "2026-09-14T01:59:00.000Z",
  generationInterpretationId: "interp-2",
  latestInterpretationId: "interp-3",
  latestInterpretationStatus: "IN_REVIEW",
});
assert.equal(newerInterpretation.current, false);
assert.equal(newerInterpretation.code, "INTERPRETATION_SUPERSEDED");

const newerLab = evaluateOfficialRecommendationFreshness({
  sourceKind: "AI",
  generationStatus: "APPROVED",
  generationCreatedAt: "2026-09-14T02:05:00.000Z",
  cropSeasonUpdatedAt: "2026-09-14T01:50:00.000Z",
  generationInterpretationId: "interp-2",
  latestInterpretationId: "interp-2",
  latestInterpretationStatus: "APPROVED",
  latestInterpretationCreatedAt: "2026-09-14T02:00:00.000Z",
  latestImportCommittedAt: "2026-09-14T02:10:00.000Z",
});
assert.equal(newerLab.current, false);
assert.equal(newerLab.code, "LAB_EVIDENCE_CHANGED");
assert.match(newerLab.reason, /laudo laboratorial foi alterado/i);

const changedRules = evaluateOfficialRecommendationFreshness({
  sourceKind: "AI",
  generationStatus: "APPROVED",
  generationCreatedAt: "2026-09-14T02:05:00.000Z",
  cropSeasonUpdatedAt: "2026-09-14T01:50:00.000Z",
  generationInterpretationId: "interp-2",
  latestInterpretationId: "interp-2",
  latestInterpretationStatus: "APPROVED",
  latestInterpretationCreatedAt: "2026-09-14T02:00:00.000Z",
  latestInterpretationCropProfileId: "profile-current",
  currentCropProfileId: "profile-current",
  latestRuleUpdatedAt: "2026-09-14T02:10:00.000Z",
});
assert.equal(changedRules.current, false);
assert.equal(changedRules.code, "AGRONOMIC_RULES_CHANGED");

const changedProfile = evaluateOfficialRecommendationFreshness({
  sourceKind: "AI",
  generationStatus: "APPROVED",
  generationCreatedAt: "2026-09-14T02:05:00.000Z",
  cropSeasonUpdatedAt: "2026-09-14T01:50:00.000Z",
  generationInterpretationId: "interp-2",
  latestInterpretationId: "interp-2",
  latestInterpretationStatus: "APPROVED",
  latestInterpretationCreatedAt: "2026-09-14T02:00:00.000Z",
  latestInterpretationCropProfileId: "profile-old",
  currentCropProfileId: "profile-new",
  latestRuleUpdatedAt: "2026-09-01T00:00:00.000Z",
});
assert.equal(changedProfile.current, false);
assert.equal(changedProfile.code, "CROP_PROFILE_CHANGED");

const unresolvedAi = evaluateOfficialRecommendationFreshness({ sourceKind: "UNRESOLVED_AI" });
assert.equal(unresolvedAi.current, false);
assert.equal(unresolvedAi.code, "SOURCE_UNRESOLVED");

const nonAi = evaluateOfficialRecommendationFreshness({ sourceKind: "NON_AI" });
assert.deepEqual(nonAi, { current: true, code: "CURRENT", reason: null });

console.log("official-recommendation-freshness: recomendações históricas não permanecem correntes após mudança de contexto, interpretação, laudo, perfil ou regra");
