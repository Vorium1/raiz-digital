import assert from "node:assert/strict";
import { computeWheatSulfurRecommendation, computeCanolaSulfurRecommendation } from "../src/domain/sulfur-dose-engine.ts";

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

assert.throws(() => computeWheatSulfurRecommendation({ sulfurMgDm3: -1, methodValidated: true }), /enxofre/i);
console.log("sulfur-dose-engine: trigo/canola respeitam limiar + método; faixa não vira dose inventada");
