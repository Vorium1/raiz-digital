import assert from "node:assert/strict";
import {
  buildCommercialPlanComparison,
  haveSameAgronomicBasis,
} from "../src/domain/commercial-plan-comparison.ts";

const reference = {
  id: "scenario-a",
  simulationMode: "SINGLE",
  areaHa: 100,
  sourceTargets: [
    { canonicalTarget: "P2O5", quantity: 80, unit: "kg/ha" },
    { canonicalTarget: "K2O", quantity: 60, unit: "kg/ha" },
  ],
  engineOutput: {
    rateKgPerHa: 160,
    totalProductTon: 16,
    costPerHa: 320,
    totalCost: 32000,
    constraintViolations: [],
  },
};

const alternative = {
  id: "scenario-b",
  simulationMode: "SINGLE",
  areaHa: 100,
  sourceTargets: [
    { canonicalTarget: "K2O", quantity: 60, unit: "KG/HA" },
    { canonicalTarget: "P2O5", quantity: 80, unit: "kg/ha" },
  ],
  engineOutput: {
    rateKgPerHa: 150,
    totalProductTon: 15,
    costPerHa: 285,
    totalCost: 28500,
    constraintViolations: ["Taxa acima do limite operacional cadastrado."],
  },
};

assert.equal(haveSameAgronomicBasis([reference, alternative]), true, "ordem e caixa da unidade não devem quebrar equivalência");

const direct = buildCommercialPlanComparison([reference, alternative]);
assert.equal(direct.directCostComparison, true);
assert.equal(direct.directTotalComparison, true);
assert.equal(direct.rows[1].costPerHaDeltaFromReference, -35);
assert.equal(direct.rows[1].totalCostDeltaFromReference, -3500);
assert.equal(direct.rows[1].constraintViolationCount, 1);

const changedTarget = {
  ...alternative,
  id: "scenario-c",
  sourceTargets: [
    { canonicalTarget: "P2O5", quantity: 90, unit: "kg/ha" },
    { canonicalTarget: "K2O", quantity: 60, unit: "kg/ha" },
  ],
};
const blocked = buildCommercialPlanComparison([reference, changedTarget]);
assert.equal(blocked.sameAgronomicBasis, false);
assert.equal(blocked.directCostComparison, false);
assert.equal(blocked.rows[1].costPerHaDeltaFromReference, null, "não calcular delta entre bases agronômicas distintas");

const changedArea = buildCommercialPlanComparison([reference, { ...alternative, areaHa: 80 }]);
assert.equal(changedArea.directCostComparison, true, "custo/ha continua comparável com a mesma base");
assert.equal(changedArea.directTotalComparison, false, "custo total não é comparação direta com área distinta");
assert.equal(changedArea.rows[1].totalCostDeltaFromReference, null);

const pair = buildCommercialPlanComparison([{
  id: "scenario-pk",
  simulationMode: "PK_PAIR",
  areaHa: 50,
  sourceTargets: [
    { canonicalTarget: "P2O5", quantity: 80, unit: "kg/ha" },
    { canonicalTarget: "K2O", quantity: 60, unit: "kg/ha" },
  ],
  engineOutput: {
    productA: { rateKgPerHa: 120, totalProductTon: 6, constraintViolations: [] },
    productB: { rateKgPerHa: 90, totalProductTon: 4.5, constraintViolations: [] },
    costPerHa: 410,
    totalCost: 20500,
  },
}]);
assert.equal(pair.rows[0].totalRateKgPerHa, 210);
assert.equal(pair.rows[0].totalProductTon, 10.5);

console.log("commercial-plan-comparison: compara somente bases equivalentes e preserva diferenças físicas/comerciais");
