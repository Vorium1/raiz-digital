import assert from "node:assert/strict";
import { evaluatePrescriptionContextFreshness } from "../src/domain/prescription-context-freshness.ts";

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

console.log("prescription-context-freshness: geração stale falha fechada após mudança de contexto");
