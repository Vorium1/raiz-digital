import assert from "node:assert/strict";
import {
  computeWheatSulfurRecommendation,
  computeCanolaSulfurRecommendation,
  computeRiceSulfurRecommendation,
  RICE_S_SOSBAI_2025_PROFILE,
  computeSoybeanSulfurRecommendation,
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



const soybeanMethod = "Ca(H2PO4)2 500mg P/L, turbidimetria";
const soybeanArea01 = computeSoybeanSulfurRecommendation({
  cropCode: "SOJA",
  observations: [9.8, 8.4, 12.2, 6.9, 12.8, 8.4, 12.1, 8.9].map((sulfurMgDm3, index) => ({
    sampleCode: `A1-${index + 1}`,
    sulfurMgDm3,
    method: soybeanMethod,
    depthFromCm: 0,
    depthToCm: 20,
  })),
});
assert.equal(soybeanArea01.status, "READY_FOR_IMPLEMENTATION");
assert.equal(soybeanArea01.needed, true);
assert.deepEqual(soybeanArea01.dose, { kind: "EXACT", kgSPerHa: 20 });
assert.equal(soybeanArea01.basis, "STRICT_PREDOMINANCE");
assert.equal(soybeanArea01.matchingCount, 5);

const soybeanArea03Tie = computeSoybeanSulfurRecommendation({
  cropCode: "SOJA",
  observations: [9.5, 6.0, 14.2, 13.7].map((sulfurMgDm3, index) => ({
    sampleCode: `A3-${index + 1}`,
    sulfurMgDm3,
    method: soybeanMethod,
    depthFromCm: 0,
    depthToCm: 20,
  })),
});
assert.equal(soybeanArea03Tie.needed, null);
assert.equal(soybeanArea03Tie.dose.kind, "BLOCKED");
assert.deepEqual(soybeanArea03Tie.blockers, ["S_NO_STRICT_PREDOMINANCE"]);

const soybeanWrongDepth = computeSoybeanSulfurRecommendation({
  cropCode: "SOJA",
  observations: [{ sampleCode: "A1", sulfurMgDm3: 8, method: soybeanMethod, depthFromCm: 0, depthToCm: 10 }],
});
assert.equal(soybeanWrongDepth.dose.kind, "BLOCKED");
assert.deepEqual(soybeanWrongDepth.blockers, ["S_DEPTH_NOT_0_20_CM"]);

const soybeanWrongMethod = computeSoybeanSulfurRecommendation({
  cropCode: "SOJA",
  observations: [{ sampleCode: "A1", sulfurMgDm3: 8, method: "Outro", depthFromCm: 0, depthToCm: 20 }],
});
assert.equal(soybeanWrongMethod.dose.kind, "BLOCKED");
assert.deepEqual(soybeanWrongMethod.blockers, ["ANALYTICAL_METHOD_NOT_VALIDATED"]);

assert.throws(() => computeWheatSulfurRecommendation({ sulfurMgDm3: -1, methodValidated: true }), /enxofre/i);
assert.throws(() => computeRiceSulfurRecommendation({
  profileId: RICE_S_SOSBAI_2025_PROFILE,
  sulfurMgDm3: Number.NaN,
  extractionMethod: "CALCIUM_PHOSPHATE_500_MG_L",
  unit: "mg/dm3",
}), /enxofre/i);

console.log("sulfur-dose-engine: soja/trigo/canola/arroz respeitam limiar, método, profundidade e predominância");
