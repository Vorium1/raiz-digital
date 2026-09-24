import assert from "node:assert/strict";
import {
  buildProducerCommercialPlanSummary,
  inspectOfficialCommercialPlan,
} from "../src/domain/official-commercial-plan.ts";

const base = {
  id: "plan-1",
  label: "Compra setembro",
  schemaVersion: 1,
  areaHa: 10,
  sourceTargets: [{ recommendationId: "rec-1" }],
  engineInput: {},
  createdAt: "2026-09-24T00:00:00.000Z",
};

const single = {
  ...base,
  simulationMode: "SINGLE",
  productSnapshots: [{ name: "KCl 60", pricePerTon: 2500 }],
  engineOutput: {
    rateKgPerHa: 125,
    totalProductTon: 1.25,
    costPerHa: 312.5,
    totalCost: 3125,
    constraintsSatisfied: true,
    constraintViolations: [],
  },
};
const singleSummary = buildProducerCommercialPlanSummary(single);
assert.ok(singleSummary);
assert.equal(singleSummary.rows[0].productName, "KCl 60");
assert.equal(singleSummary.rows[0].doseQuantity, 125);
assert.equal(singleSummary.rows[0].totalQuantity, 1.25);
assert.equal(singleSummary.totalCost, 3125);
assert.equal(inspectOfficialCommercialPlan(single).valid, true);

const pkPair = {
  ...base,
  id: "plan-2",
  simulationMode: "PK_PAIR",
  productSnapshots: [
    { name: "MAP", pricePerTon: 4200 },
    { name: "KCl", pricePerTon: 2500 },
  ],
  engineOutput: {
    productA: { rateKgPerHa: 100, totalProductTon: 1, constraintsSatisfied: true, constraintViolations: [] },
    productB: { rateKgPerHa: 80, totalProductTon: 0.8, constraintsSatisfied: true, constraintViolations: [] },
    costPerHa: 620,
    totalCost: 6200,
  },
};
const pkSummary = buildProducerCommercialPlanSummary(pkPair);
assert.ok(pkSummary);
assert.equal(pkSummary.rows.length, 2);
assert.equal(pkSummary.rows[1].productName, "KCl");
assert.equal(inspectOfficialCommercialPlan(pkPair).valid, true);

const lime = {
  ...base,
  id: "plan-3",
  simulationMode: "LIME",
  productSnapshots: [{ name: "Calcário A", prntPercent: 80, pricePerTon: 300 }],
  engineOutput: {
    productDoseTonPerHa: 2.5,
    totalProductTon: 25,
    costPerHa: 750,
    totalCost: 7500,
    constraintsSatisfied: true,
    constraintViolations: [],
  },
};
const limeSummary = buildProducerCommercialPlanSummary(lime);
assert.ok(limeSummary);
assert.equal(limeSummary.rows[0].doseUnit, "t/ha");
assert.equal(limeSummary.rows[0].totalQuantity, 25);

const noPrice = {
  ...single,
  id: "plan-4",
  productSnapshots: [{ name: "KCl 60", pricePerTon: null }],
  engineOutput: { ...single.engineOutput, costPerHa: null, totalCost: null },
};
const noPriceSummary = buildProducerCommercialPlanSummary(noPrice);
assert.ok(noPriceSummary);
assert.equal(noPriceSummary.hasFrozenCost, false);

const violating = {
  ...single,
  id: "plan-5",
  engineOutput: {
    ...single.engineOutput,
    constraintsSatisfied: false,
    constraintViolations: ["Dose acima do máximo cadastrado."],
  },
};
const violationCheck = inspectOfficialCommercialPlan(violating);
assert.equal(violationCheck.valid, false);
assert.match(violationCheck.reason ?? "", /limite operacional/i);
assert.equal(violationCheck.violations.length, 1);

const untraceable = {
  ...single,
  id: "plan-6",
  sourceTargets: [{ recommendationId: null }],
};
const traceCheck = inspectOfficialCommercialPlan(untraceable);
assert.equal(traceCheck.valid, false);
assert.match(traceCheck.reason ?? "", /rastreáveis/i);

console.log("official-commercial-plan: SINGLE, PK_PAIR, LIME, custo opcional, rastreabilidade e fail-closed aprovados");
