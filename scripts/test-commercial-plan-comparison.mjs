import assert from "node:assert/strict";
import {
  buildCommercialPlanComparison,
  haveSameAgronomicBasis,
} from "../src/domain/commercial-plan-comparison.ts";

const pSource = {
  recommendationId: "11111111-1111-4111-8111-111111111111",
  canonicalTarget: "P2O5",
  quantity: 80,
  unit: "kg/ha",
  calculationSource: "cqfs:p2o5:v1",
  recommendedAt: "2026-09-14T08:00:00.000Z",
  sourceGenerationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  freshnessCode: "CURRENT",
};
const kSource = {
  recommendationId: "22222222-2222-4222-8222-222222222222",
  canonicalTarget: "K2O",
  quantity: 60,
  unit: "kg/ha",
  calculationSource: "cqfs:k2o:v1",
  recommendedAt: "2026-09-14T08:00:00.000Z",
  sourceGenerationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  freshnessCode: "CURRENT",
};

const reference = {
  id: "scenario-a",
  simulationMode: "SINGLE",
  areaHa: 100,
  sourceTargets: [pSource, kSource],
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
    { ...kSource, unit: "KG/HA" },
    pSource,
  ],
  engineOutput: {
    rateKgPerHa: 150,
    totalProductTon: 15,
    costPerHa: 285,
    totalCost: 28500,
    constraintViolations: ["Taxa acima do limite operacional cadastrado."],
  },
};

assert.equal(haveSameAgronomicBasis([reference, alternative]), true, "ordem e caixa da unidade não devem quebrar equivalência quando a proveniência é a mesma");

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
    { ...pSource, quantity: 90 },
    kSource,
  ],
};
const blocked = buildCommercialPlanComparison([reference, changedTarget]);
assert.equal(blocked.sameAgronomicBasis, false);
assert.equal(blocked.directCostComparison, false);
assert.equal(blocked.rows[1].costPerHaDeltaFromReference, null, "não calcular delta entre alvos agronômicos distintos");

const changedProvenance = {
  ...alternative,
  id: "scenario-d",
  sourceTargets: [
    { ...pSource, recommendationId: "33333333-3333-4333-8333-333333333333", sourceGenerationId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" },
    kSource,
  ],
};
const provenanceBlocked = buildCommercialPlanComparison([reference, changedProvenance]);
assert.equal(provenanceBlocked.sameAgronomicBasis, false, "mesmo número vindo de outra recomendação não é a mesma base congelada");
assert.equal(provenanceBlocked.directCostComparison, false);
assert.equal(provenanceBlocked.rows[1].costPerHaDeltaFromReference, null);

const changedArea = buildCommercialPlanComparison([reference, { ...alternative, areaHa: 80 }]);
assert.equal(changedArea.directCostComparison, true, "custo/ha continua comparável com a mesma base e proveniência");
assert.equal(changedArea.directTotalComparison, false, "custo total não é comparação direta com área distinta");
assert.equal(changedArea.rows[1].totalCostDeltaFromReference, null);

const pair = buildCommercialPlanComparison([{
  id: "scenario-pk",
  simulationMode: "PK_PAIR",
  areaHa: 50,
  sourceTargets: [pSource, kSource],
  engineOutput: {
    productA: { rateKgPerHa: 120, totalProductTon: 6, constraintViolations: [] },
    productB: { rateKgPerHa: 90, totalProductTon: 4.5, constraintViolations: [] },
    costPerHa: 410,
    totalCost: 20500,
  },
}]);
assert.equal(pair.rows[0].totalRateKgPerHa, 210);
assert.equal(pair.rows[0].totalProductTon, 10.5);

console.log("commercial-plan-comparison: compara somente a mesma base/proveniência e preserva diferenças físicas/comerciais");
