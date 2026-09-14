import assert from "node:assert/strict";
import {
  computeSingleProductRateFromNutrient,
  convertLimingRequirementToCommercialProduct,
  evaluateCommercialProductRate,
  solveTwoProductPkPlan,
} from "../src/domain/commercial-input-engine.ts";

const phosphate = {
  code: "SYN-PK-A",
  name: "Produto sintético A",
  guaranteesPercent: { N: 10, P2O5: 20, K2O: 10 },
  pricePerTon: 1000,
  minRateKgPerHa: 100,
  maxRateKgPerHa: 300,
};
const potassic = {
  code: "SYN-PK-B",
  name: "Produto sintético B",
  guaranteesPercent: { P2O5: 5, K2O: 25 },
  pricePerTon: 2000,
  minRateKgPerHa: 100,
  maxRateKgPerHa: 300,
};

// Sistema exato: 200 kg/ha de cada produto entrega 50 P2O5 + 70 K2O.
const plan = solveTwoProductPkPlan({
  productA: phosphate,
  productB: potassic,
  targetP2O5KgPerHa: 50,
  targetK2OKgPerHa: 70,
  areaHa: 10,
});
assert.equal(plan.productA.rateKgPerHa, 200);
assert.equal(plan.productB.rateKgPerHa, 200);
assert.equal(plan.combinedSuppliedKgPerHa.P2O5, 50);
assert.equal(plan.combinedSuppliedKgPerHa.K2O, 70);
assert.equal(plan.targetComparison.P2O5?.differenceKgPerHa, 0);
assert.equal(plan.targetComparison.K2O?.differenceKgPerHa, 0);
assert.equal(plan.costPerHa, 600);
assert.equal(plan.totalCost, 6000);
assert.equal(plan.productA.totalProductTon, 2);
assert.equal(plan.productB.totalProductTon, 2);

// N é fornecido pelo produto A, mas sem alvo de N ele permanece informativo e não vira "excesso".
assert.equal(plan.combinedSuppliedKgPerHa.N, 20);
assert.equal(plan.targetComparison.N, undefined);

const single = computeSingleProductRateFromNutrient({
  product: {
    code: "SINGLE-P",
    name: "Fonte P sintética",
    guaranteesPercent: { P2O5: 10 },
    pricePerTon: 1200,
  },
  driverNutrient: "P2O5",
  targetKgPerHa: 50,
  areaHa: 4.32,
});
assert.equal(single.rateKgPerHa, 500);
assert.equal(single.suppliedKgPerHa.P2O5, 50);
assert.equal(single.costPerHa, 600);
assert.equal(single.totalProductKg, 2160);
assert.equal(single.totalProductTon, 2.16);
assert.equal(single.totalCost, 2592);

assert.throws(
  () => computeSingleProductRateFromNutrient({
    product: { code: "ZERO-P", name: "Sem P", guaranteesPercent: { P2O5: 0 } },
    driverNutrient: "P2O5",
    targetKgPerHa: 50,
  }),
  /garantia positiva de P2O5/i,
);

assert.throws(
  () => solveTwoProductPkPlan({
    productA: { code: "R1", name: "Relação 2 para 1", guaranteesPercent: { P2O5: 20, K2O: 10 } },
    productB: { code: "R2", name: "Mesma relação", guaranteesPercent: { P2O5: 40, K2O: 20 } },
    targetP2O5KgPerHa: 50,
    targetK2OKgPerHa: 70,
  }),
  /não existe solução única/i,
);

assert.throws(
  () => solveTwoProductPkPlan({
    productA: { code: "P", name: "Somente P", guaranteesPercent: { P2O5: 20 } },
    productB: { code: "PK", name: "P e K", guaranteesPercent: { P2O5: 10, K2O: 10 } },
    targetP2O5KgPerHa: 10,
    targetK2OKgPerHa: 100,
  }),
  /dose negativa/i,
);

const constrained = evaluateCommercialProductRate({
  product: { code: "LIMIT", name: "Produto com limite", guaranteesPercent: { K2O: 20 }, maxRateKgPerHa: 150 },
  rateKgPerHa: 200,
  targetsKgPerHa: { K2O: 40 },
});
assert.equal(constrained.constraintsSatisfied, false);
assert.match(constrained.constraintViolations[0], /máximo operacional/i);

const lime = convertLimingRequirementToCommercialProduct({
  requirementTonPerHaPrnt100: 4.74,
  productPrntPercent: 80,
  areaHa: 4.32,
  pricePerTon: 200,
});
assert.equal(lime.productDoseTonPerHa, 5.925);
assert.equal(lime.productDoseKgPerHa, 5925);
assert.equal(lime.totalProductTon, 25.596);
assert.equal(lime.costPerHa, 1185);
assert.equal(lime.totalCost, 5119.2);

// Não há teto artificial de 100% para PRNT; usa-se o valor real cadastrado/validado.
const highPrnt = convertLimingRequirementToCommercialProduct({
  requirementTonPerHaPrnt100: 4.74,
  productPrntPercent: 120,
});
assert.equal(highPrnt.productDoseTonPerHa, 3.95);

assert.throws(
  () => convertLimingRequirementToCommercialProduct({ requirementTonPerHaPrnt100: 4, productPrntPercent: 0 }),
  /PRNT.*maior que zero/i,
);

console.log("commercial-input-engine: necessidade agronômica -> produto/custo sem inventar fórmula, preço ou tecnologia");
