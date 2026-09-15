import assert from "node:assert/strict";
import {
  computeWheatSulfurRecommendation,
  computeCanolaSulfurRecommendation,
  computeRiceSulfurRecommendation,
  RICE_S_SOSBAI_2025_PROFILE,
} from "../src/domain/sulfur-dose-engine.ts";

const wheatDeficient = computeWheatSulfurRecommendation({ sulfurMgDm3: 4.9, methodValidated: true });
assert.equal(wheatDeficient.status, "READY_FOR_IMPLEMENTATION");
assert.equal(wheatDeficient.needed, true);
assert.deepEqual(wheatDeficient.dose, { kind: "RANGE", minKgSPerHa: 20, maxKgSPerHa: 30 });

const wheatAtThreshold = computeWheatSulfurRecommendation({ sulfurMgDm3: 5, methodValidated: true });
assert.equal(wheatAtThreshold.needed, false);
assert.deepEqual(wheatAtThreshold.dose, { kind: "EXACT", kgSPerHa: 0 });

const wheatUnknownMethod = computeWheatSulfurRecommendation({ sulfurMgDm3: 3, methodValidated: false });
assert.equal(wheatUnknownMethod.status, "REQUIRES_AGRONOMIST_REVIEW");
assert.equal(wheatUnknownMethod.needed, null);
assert.equal(wheatUnknownMethod.dose.kind, "BLOCKED");

const canolaDeficient = computeCanolaSulfurRecommendation({ sulfurMgDm3: 9.9, methodValidated: true });
assert.equal(canolaDeficient.status, "READY_FOR_IMPLEMENTATION");
assert.deepEqual(canolaDeficient.dose, { kind: "EXACT", kgSPerHa: 20 });

const canolaAtThreshold = computeCanolaSulfurRecommendation({ sulfurMgDm3: 10, methodValidated: true });
assert.deepEqual(canolaAtThreshold.dose, { kind: "EXACT", kgSPerHa: 0 });

const canolaUnknownMethod = computeCanolaSulfurRecommendation({ sulfurMgDm3: 8, methodValidated: false });
assert.equal(canolaUnknownMethod.status, "REQUIRES_AGRONOMIST_REVIEW");
assert.equal(canolaUnknownMethod.dose.kind, "BLOCKED");

const riceDeficient = computeRiceSulfurRecommendation({
  profileId: RICE_S_SOSBAI_2025_PROFILE,
  sulfurMgDm3: 9.99,
  extractionMethod: "CALCIUM_PHOSPHATE_500_MG_L",
  unit: "mg/dm3",
});
assert.equal(riceDeficient.status, "READY_FOR_IMPLEMENTATION");
assert.equal(riceDeficient.needed, true);
assert.deepEqual(riceDeficient.dose, { kind: "RANGE", minKgSPerHa: 20, maxKgSPerHa: 30 });

const riceAtThreshold = computeRiceSulfurRecommendation({
  profileId: RICE_S_SOSBAI_2025_PROFILE,
  sulfurMgDm3: 10,
  extractionMethod: "CALCIUM_PHOSPHATE_500_MG_L",
  unit: "mg/dm3",
});
assert.equal(riceAtThreshold.status, "READY_FOR_IMPLEMENTATION");
assert.equal(riceAtThreshold.needed, false);
assert.deepEqual(riceAtThreshold.dose, { kind: "EXACT", kgSPerHa: 0 });

const riceWrongMethod = computeRiceSulfurRecommendation({
  profileId: RICE_S_SOSBAI_2025_PROFILE,
  sulfurMgDm3: 5,
  extractionMethod: "OTHER",
  unit: "mg/dm3",
});
assert.equal(riceWrongMethod.status, "REQUIRES_AGRONOMIST_REVIEW");
assert.equal(riceWrongMethod.needed, null);
assert.equal(riceWrongMethod.dose.kind, "BLOCKED");
assert.deepEqual(riceWrongMethod.blockers, ["ANALYTICAL_METHOD_NOT_VALIDATED"]);

const riceWrongProfile = computeRiceSulfurRecommendation({
  profileId: "OUTRO_PERFIL",
  sulfurMgDm3: 5,
  extractionMethod: "CALCIUM_PHOSPHATE_500_MG_L",
  unit: "mg/dm3",
});
assert.equal(riceWrongProfile.status, "REQUIRES_AGRONOMIST_REVIEW");
assert.equal(riceWrongProfile.dose.kind, "BLOCKED");
assert.deepEqual(riceWrongProfile.blockers, ["RICE_PROFILE_NOT_VALIDATED"]);

const riceWrongUnit = computeRiceSulfurRecommendation({
  profileId: RICE_S_SOSBAI_2025_PROFILE,
  sulfurMgDm3: 5,
  extractionMethod: "CALCIUM_PHOSPHATE_500_MG_L",
  unit: "ppm",
});
assert.equal(riceWrongUnit.status, "REQUIRES_AGRONOMIST_REVIEW");
assert.equal(riceWrongUnit.dose.kind, "BLOCKED");
assert.deepEqual(riceWrongUnit.blockers, ["ANALYTICAL_UNIT_NOT_VALIDATED"]);

assert.throws(() => computeWheatSulfurRecommendation({ sulfurMgDm3: -1, methodValidated: true }), /enxofre/i);
assert.throws(() => computeRiceSulfurRecommendation({
  profileId: RICE_S_SOSBAI_2025_PROFILE,
  sulfurMgDm3: Number.NaN,
  extractionMethod: "CALCIUM_PHOSPHATE_500_MG_L",
  unit: "mg/dm3",
}), /enxofre/i);

console.log("sulfur-dose-engine: trigo/canola/arroz respeitam limiar + método; faixa não vira dose inventada");
