import assert from "node:assert/strict";
import {
  evaluateUniformPkReadiness,
  validateDeterministicPkRecommendation,
} from "../src/domain/uniform-pk-readiness.ts";

const item = (sampleCode, parameterCode, classification) => ({
  sampleCode,
  parameterCode,
  interpretable: true,
  classificationRole: "TARGET",
  classification,
});

const area01P = ["Alto", "Alto", "Baixo", "Alto", "Médio", "Baixo", "Médio", "Alto"];
const area01K = ["Alto", "Alto", "Alto", "Muito Alto", "Muito Alto", "Alto", "Muito Alto", "Alto"];
const area01 = area01P.flatMap((classification, index) => [
  item(`P${index + 1}`, "P", classification),
  item(`P${index + 1}`, "K", area01K[index]),
]);

const cabeda = evaluateUniformPkReadiness({ cropCode: "SOJA", interpretation: area01 });
assert.equal(cabeda.ruleReady, true);
assert.equal(cabeda.ruleId, "PK-SOJA-CQFS-2016");
assert.equal(cabeda.ready, false);
assert.equal(cabeda.nutrients.P2O5.ready, false, "P 4/8 não é maioria estrita");
assert.ok(cabeda.nutrients.P2O5.blockers.includes("P_NO_STRICT_PREDOMINANCE"));
assert.equal(cabeda.nutrients.K2O.ready, true);
assert.equal(cabeda.nutrients.K2O.soilLevel, "Alto");
assert.equal(cabeda.nutrients.K2O.matchingCount, 5);
assert.equal(cabeda.nutrients.K2O.totalCount, 8);

const twoPoints = evaluateUniformPkReadiness({
  cropCode: "SOJA",
  interpretation: [
    item("P1", "P", "Alto"), item("P2", "P", "Alto"),
    item("P1", "K", "Alto"), item("P2", "K", "Alto"),
  ],
});
assert.equal(twoPoints.ready, false, "2/2 não atinge o piso de 3 pontos concordantes");
assert.ok(twoPoints.nutrients.P2O5.blockers.includes("P_NO_STRICT_PREDOMINANCE"));

const single = evaluateUniformPkReadiness({
  cropCode: "SOJA",
  interpretation: [item("COMPOSTA", "P", "Alto"), item("COMPOSTA", "K", "Alto")],
});
assert.equal(single.ready, true, "uma única amostra representativa não é tratada como falsa heterogeneidade");
assert.equal(single.nutrients.P2O5.basis, "SINGLE_SAMPLE");

const exactP = validateDeterministicPkRecommendation({
  cropCode: "SOJA",
  interpretation: [item("COMPOSTA", "P", "Alto"), item("COMPOSTA", "K", "Alto")],
  yieldGoal: 4.2,
  yieldGoalUnit: "t/ha",
  cultivationOrderAfterSoilAnalysis: 1,
  nutrient: "P2O5",
  quantity: 63,
  unit: "kg/ha",
});
assert.equal(exactP.allowed, true);
assert.equal(exactP.expected?.doseKgPerHa, 63);

const inventedP = validateDeterministicPkRecommendation({
  cropCode: "SOJA",
  interpretation: [item("COMPOSTA", "P", "Alto"), item("COMPOSTA", "K", "Alto")],
  yieldGoal: 4.2,
  yieldGoalUnit: "t/ha",
  cultivationOrderAfterSoilAnalysis: 1,
  nutrient: "P2O5",
  quantity: 70,
  unit: "kg/ha",
});
assert.equal(inventedP.allowed, false);
assert.ok(inventedP.blockers.includes("PK_QUANTITY_DOES_NOT_MATCH_DETERMINISTIC_ENGINE"));

const blockedByHeterogeneity = validateDeterministicPkRecommendation({
  cropCode: "SOJA",
  interpretation: area01,
  yieldGoal: 4.2,
  yieldGoalUnit: "t/ha",
  cultivationOrderAfterSoilAnalysis: 1,
  nutrient: "P2O5",
  quantity: 63,
  unit: "kg/ha",
});
assert.equal(blockedByHeterogeneity.allowed, false);
assert.ok(blockedByHeterogeneity.blockers.includes("P_NO_STRICT_PREDOMINANCE"));

const unsupportedCrop = evaluateUniformPkReadiness({
  cropCode: "CARINATA",
  interpretation: [item("P1", "P", "Alto"), item("P1", "K", "Alto")],
});
assert.equal(unsupportedCrop.ruleReady, false);
assert.ok(unsupportedCrop.blockers.includes("PK_CROP_RULE_NOT_IMPLEMENTED"));

console.log("uniform-pk-readiness: heterogeneidade, fonte versionada e dose determinística validadas");
