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

const unresolvedAi = evaluateOfficialRecommendationFreshness({ sourceKind: "UNRESOLVED_AI" });
assert.equal(unresolvedAi.current, false);
assert.equal(unresolvedAi.code, "SOURCE_UNRESOLVED");

const nonAi = evaluateOfficialRecommendationFreshness({ sourceKind: "NON_AI" });
assert.deepEqual(nonAi, { current: true, code: "CURRENT", reason: null });

console.log("official-recommendation-freshness: recomendações históricas não permanecem correntes após mudança de evidência");
