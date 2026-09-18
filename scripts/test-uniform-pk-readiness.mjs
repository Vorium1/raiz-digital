import assert from "node:assert/strict";
import {
  evaluateUniformPkReadiness,
  validateDeterministicPkRecommendation,
} from "../src/domain/uniform-pk-readiness.ts";
import { validatePrescriptionPkRecommendations } from "../src/domain/prescription-pk-validation.ts";

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
const representative = [item("COMPOSTA", "P", "Alto"), item("COMPOSTA", "K", "Alto")];

const cabeda = evaluateUniformPkReadiness({ cropCode: "SOJA", interpretation: area01 });
assert.equal(cabeda.ruleReady, true);
assert.equal(cabeda.ruleId, "PK-SOJA-RS-SC-2025");
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

const single = evaluateUniformPkReadiness({ cropCode: "SOJA", interpretation: representative });
assert.equal(single.ready, true, "uma única amostra representativa não é tratada como falsa heterogeneidade");
assert.equal(single.nutrients.P2O5.basis, "SINGLE_SAMPLE");

const exactP = validateDeterministicPkRecommendation({
  cropCode: "SOJA",
  interpretation: representative,
  yieldGoal: 4.2,
  yieldGoalUnit: "t/ha",
  cultivationOrderAfterSoilAnalysis: 1,
  nutrient: "P2O5",
  quantity: 63,
  unit: "kg/ha",
});
assert.equal(exactP.allowed, true);
assert.equal(exactP.expected?.doseKgPerHa, 63);
assert.equal(exactP.expected?.ruleId, "PK-SOJA-RS-SC-2025");

const inventedP = validateDeterministicPkRecommendation({
  cropCode: "SOJA",
  interpretation: representative,
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

const exactList = validatePrescriptionPkRecommendations({
  recommendations: [
    { inputType: "P2O5", quantity: 63, unit: "kg/ha" },
    { inputType: "K2O", quantity: 105, unit: "kg/ha" },
    { inputType: "S", quantity: 20, unit: "kg/ha" },
  ],
  cropCode: "SOJA",
  interpretation: representative,
  yieldGoal: 4.2,
  yieldGoalUnit: "t/ha",
  cultivationOrderAfterSoilAnalysis: 1,
});
assert.equal(exactList.allowed, true);
assert.deepEqual(exactList.validated.map((entry) => entry.nutrient), ["P2O5", "K2O"]);
assert.equal(exactList.failures.length, 0);

const duplicateTarget = validatePrescriptionPkRecommendations({
  recommendations: [
    { inputType: "P2O5", quantity: 63, unit: "kg/ha" },
    { inputType: "Fósforo P2O5", quantity: 63, unit: "kg/ha" },
  ],
  cropCode: "SOJA",
  interpretation: representative,
  yieldGoal: 4.2,
  yieldGoalUnit: "t/ha",
  cultivationOrderAfterSoilAnalysis: 1,
});
assert.equal(duplicateTarget.allowed, false);
assert.ok(duplicateTarget.failures.some((failure) => failure.blockers.includes("PK_DUPLICATE_TARGET")));

const elementalP = validatePrescriptionPkRecommendations({
  recommendations: [{ inputType: "Fósforo", quantity: 27.5, unit: "kg/ha" }],
  cropCode: "SOJA",
  interpretation: representative,
  yieldGoal: 4.2,
  yieldGoalUnit: "t/ha",
  cultivationOrderAfterSoilAnalysis: 1,
});
assert.equal(elementalP.allowed, false);
assert.ok(elementalP.failures[0].blockers.includes("PK_ELEMENTAL_INPUT_AMBIGUOUS"));

const providerInventedDose = validatePrescriptionPkRecommendations({
  recommendations: [{ inputType: "P2O5", quantity: 70, unit: "kg/ha" }],
  cropCode: "SOJA",
  interpretation: representative,
  yieldGoal: 4.2,
  yieldGoalUnit: "t/ha",
  cultivationOrderAfterSoilAnalysis: 1,
});
assert.equal(providerInventedDose.allowed, false);
assert.ok(providerInventedDose.failures[0].blockers.includes("PK_QUANTITY_DOES_NOT_MATCH_DETERMINISTIC_ENGINE"));

console.log("uniform-pk-readiness: heterogeneidade, fonte 2025, dose e barreira de persistência/promoção validadas");

{
  const result = computeDeterministicPkDose({
    cropCode: "SOJA",
    interpretation: [
      { sampleCode: "A", parameterCode: "K", interpretable: true, classification: "Alto" },
      { sampleCode: "B", parameterCode: "K", interpretable: true, classification: "Alto" },
      { sampleCode: "C", parameterCode: "K", interpretable: true, classification: "Muito Alto" },
    ],
    yieldGoal: null,
    yieldGoalUnit: null,
    cultivationOrderAfterSoilAnalysis: null,
    nutrient: "K2O",
  });
  assert.equal(result.ready, true);
  assert.equal(result.expected?.doseKgPerHa, 75);
  assert.deepEqual(result.expected?.assumptions, [
    "YIELD_GOAL_DEFAULTED_TO_CROP_REFERENCE:3_T_HA",
    "CULTIVATION_ORDER_DEFAULTED_TO_FIRST_AFTER_ANALYSIS",
  ]);
}
