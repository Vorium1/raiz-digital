import assert from "node:assert/strict";
import {
  calculateCommercialPackageLogistics,
  computeSingleProductRateFromNutrient,
  convertCommercialLimeDoseToPrnt100,
  convertLimingRequirementToCommercialProduct,
  convertNutrientBasis,
  evaluateCommercialProductRate,
  parseNpkFormula,
  solveTwoProductPkPlan,
  NUTRIENT_BASIS_FACTORS,
} from "../src/domain/commercial-input-engine.ts";

const kcl60 = {
  code: "KCL-TESTE",
  name: "Fonte potássica 60%",
  guaranteesPercent: { K2O: 60 },
};

const kTarget = computeSingleProductRateFromNutrient({
  product: kcl60,
  driverNutrient: "K2O",
  targetKgPerHa: 72,
});
assert.equal(kTarget.rateKgPerHa, 120);
assert.equal(kTarget.suppliedKgPerHa.K2O, 72);

// V2: “pontos” é apenas o rótulo de UX. A base explícita continua kg/ha do nutriente.
const kPoints = computeSingleProductRateFromNutrient({ product: kcl60, driverNutrient: "K2O", targetKgPerHa: 60 });
assert.equal(kPoints.rateKgPerHa, 100);

const urea46 = computeSingleProductRateFromNutrient({
  product: { code: "UREIA-TESTE", name: "Fonte nitrogenada 46%", guaranteesPercent: { N: 46 } },
  driverNutrient: "N",
  targetKgPerHa: 90,
});
assert.ok(Math.abs(urea46.rateKgPerHa - 195.6522) < 0.0001);

const formula042020 = { code: "04-20-20", name: "Fórmula sintética 04-20-20", guaranteesPercent: parseNpkFormula("04-20-20") };
const formulaK = computeSingleProductRateFromNutrient({ product: formula042020, driverNutrient: "K2O", targetKgPerHa: 60, areaHa: 4.1 });
assert.equal(formulaK.rateKgPerHa, 300);
assert.equal(formulaK.suppliedKgPerHa.N, 12);
assert.equal(formulaK.suppliedKgPerHa.P2O5, 60);
assert.equal(formulaK.suppliedKgPerHa.K2O, 60);
assert.equal(formulaK.totalProductKg, 1230);
assert.equal(formulaK.totalProductTon, 1.23);

const phosphate52 = computeSingleProductRateFromNutrient({
  product: { code: "NP-52", name: "Fonte fosfatada sintética", guaranteesPercent: { N: 12, P2O5: 52 } },
  driverNutrient: "P2O5",
  targetKgPerHa: 80,
});
assert.ok(Math.abs(phosphate52.rateKgPerHa - 153.8462) < 0.0001);
assert.ok(Math.abs(phosphate52.suppliedKgPerHa.N - 18.4615) < 0.0001);

const bags = calculateCommercialPackageLogistics({ totalProductKg: 1230, packageWeightKg: 50 });
assert.equal(bags.theoreticalPackageCount, 24.6);
assert.equal(bags.purchasePackageCount, 25);
assert.equal(bags.purchaseTotalKg, 1250);
assert.equal(bags.logisticalExcessKg, 20);

const inverseProduct = evaluateCommercialProductRate({
  product: kcl60,
  rateKgPerHa: 150,
});
assert.equal(inverseProduct.suppliedKgPerHa.K2O, 90);

const p2o5 = convertNutrientBasis(90, "P", "P2O5");
const pRoundTrip = convertNutrientBasis(p2o5, "P2O5", "P");
assert.ok(Math.abs(pRoundTrip - 90) < 0.001);

const k2o = convertNutrientBasis(72, "K", "K2O");
const kRoundTrip = convertNutrientBasis(k2o, "K2O", "K");
assert.ok(Math.abs(kRoundTrip - 72) < 0.001);

const lime = convertLimingRequirementToCommercialProduct({
  requirementTonPerHaPrnt100: 4.74,
  productPrntPercent: 80,
});
assert.equal(lime.productDoseTonPerHa, 5.925);
assert.equal(convertLimingRequirementToCommercialProduct({ requirementTonPerHaPrnt100: 3, productPrntPercent: 80 }).productDoseTonPerHa, 3.75);

const reverseLime = convertCommercialLimeDoseToPrnt100({
  productDoseTonPerHa: 5.925,
  productPrntPercent: 80,
});
assert.equal(reverseLime.equivalentPrnt100TonPerHa, 4.74);

assert.throws(() => convertNutrientBasis(-1, "P", "P2O5"), /maior ou igual a zero/i);
assert.throws(() => convertCommercialLimeDoseToPrnt100({ productDoseTonPerHa: 1, productPrntPercent: 0 }), /PRNT/i);

// Fixtures estritamente sintéticas; nenhum catálogo ou preço real é alterado.
const phosphorus = { code: "P-FIXTURE", name: "Fixture P", guaranteesPercent: { P2O5: 50 }, pricePerTon: 1200 };
const potassium = { ...kcl60, pricePerTon: 2000 };
const pk = solveTwoProductPkPlan({ productA: phosphorus, productB: potassium, targetP2O5KgPerHa: 50, targetK2OKgPerHa: 60, areaHa: 10 });
assert.equal(pk.productA.rateKgPerHa, 100);
assert.equal(pk.productB.rateKgPerHa, 100);
assert.equal(pk.combinedSuppliedKgPerHa.P2O5, 50);
assert.equal(pk.combinedSuppliedKgPerHa.K2O, 60);
assert.equal(pk.costPerHa, 320);
assert.equal(pk.totalCost, 3200);
assert.equal(pk.productA.totalProductTon, 1);
assert.equal(pk.targetComparison.P2O5.differenceKgPerHa, 0);

assert.throws(() => solveTwoProductPkPlan({ productA: phosphorus, productB: phosphorus, targetP2O5KgPerHa: 50, targetK2OKgPerHa: 60 }), /dependentes/);
assert.throws(() => solveTwoProductPkPlan({ productA: { ...phosphorus, guaranteesPercent: { P2O5: 50, K2O: 50 } }, productB: potassium, targetP2O5KgPerHa: 50, targetK2OKgPerHa: 1 }), /negativa/);
const missingPrice = solveTwoProductPkPlan({ productA: phosphorus, productB: kcl60, targetP2O5KgPerHa: 50, targetK2OKgPerHa: 60, areaHa: 10 });
assert.equal(missingPrice.costPerHa, null);
assert.equal(missingPrice.totalCost, null);

// Custo/ha pode aparecer como zero sem apagar o custo total real do talhão.
const microProduct = evaluateCommercialProductRate({ product: { ...potassium, pricePerTon: 1 }, rateKgPerHa: 1, areaHa: 10000 });
assert.equal(microProduct.costPerHa, 0);
assert.equal(microProduct.totalCost, 10);
const microPk = solveTwoProductPkPlan({ productA: { ...phosphorus, pricePerTon: 1 }, productB: { ...potassium, pricePerTon: 1 }, targetP2O5KgPerHa: 0.5, targetK2OKgPerHa: 0.6, areaHa: 10000 });
assert.equal(microPk.costPerHa, 0);
assert.equal(microPk.totalCost, 20);
// Dois custos individuais de 0,004 devem somar 0,008 antes do arredondamento.
const sumPk = solveTwoProductPkPlan({ productA: { ...phosphorus, pricePerTon: 4 }, productB: { ...potassium, pricePerTon: 4 }, targetP2O5KgPerHa: 0.5, targetK2OKgPerHa: 0.6, areaHa: 10000 });
assert.equal(sumPk.productA.costPerHa, 0);
assert.equal(sumPk.productB.costPerHa, 0);
assert.equal(sumPk.costPerHa, 0.01);
assert.equal(sumPk.totalCost, 80);
const fractionalProduct = evaluateCommercialProductRate({ product: { ...potassium, pricePerTon: 1 }, rateKgPerHa: 333.333, areaHa: 10000 });
assert.equal(fractionalProduct.costPerHa, 0.33);
assert.equal(fractionalProduct.totalCost, 3333.33);

const microLime = convertLimingRequirementToCommercialProduct({ requirementTonPerHaPrnt100: 0.0008, productPrntPercent: 80, pricePerTon: 1, areaHa: 10000 });
assert.equal(microLime.costPerHa, 0);
assert.equal(microLime.totalCost, 10);
assert.equal(microLime.totalProductTon, 10);
const pricedReverseLime = convertCommercialLimeDoseToPrnt100({ productDoseTonPerHa: 0.001, productPrntPercent: 80, pricePerTon: 1, areaHa: 10000 });
assert.equal(pricedReverseLime.equivalentPrnt100TonPerHa, 0.0008);
assert.equal(pricedReverseLime.totalCost, 10);
assert.equal(pricedReverseLime.totalProductTon, 10);
assert.equal(pricedReverseLime.productDoseKgPerHa, 1);
assert.equal(reverseLime.totalCost, null);
assert.equal(reverseLime.totalProductTon, null);
const highPrnt = convertCommercialLimeDoseToPrnt100({ productDoseTonPerHa: 2, productPrntPercent: 120 });
assert.equal(highPrnt.equivalentPrnt100TonPerHa, 2.4);

for (const invalidArea of [0, -1, NaN, Infinity]) {
  assert.throws(() => evaluateCommercialProductRate({ product: kcl60, rateKgPerHa: 1, areaHa: invalidArea }), /Área/);
  assert.throws(() => solveTwoProductPkPlan({ productA: phosphorus, productB: potassium, targetP2O5KgPerHa: 1, targetK2OKgPerHa: 1, areaHa: invalidArea }), /Área/);
  assert.throws(() => convertLimingRequirementToCommercialProduct({ requirementTonPerHaPrnt100: 1, productPrntPercent: 80, areaHa: invalidArea }), /Área/);
  assert.throws(() => convertCommercialLimeDoseToPrnt100({ productDoseTonPerHa: 1, productPrntPercent: 80, areaHa: invalidArea }), /Área/);
}
for (const invalidPrice of [-1, NaN, Infinity]) {
  assert.throws(() => evaluateCommercialProductRate({ product: { ...kcl60, pricePerTon: invalidPrice }, rateKgPerHa: 1 }), /Preço/);
  assert.throws(() => convertCommercialLimeDoseToPrnt100({ productDoseTonPerHa: 1, productPrntPercent: 80, pricePerTon: invalidPrice }), /Preço/);
}
const zeroPrice = evaluateCommercialProductRate({ product: { ...potassium, pricePerTon: 0 }, rateKgPerHa: 10, areaHa: 5 });
assert.equal(zeroPrice.totalCost, 0);
const noArea = evaluateCommercialProductRate({ product: potassium, rateKgPerHa: 10 });
assert.equal(noArea.totalCost, null);
assert.equal(noArea.totalProductKg, null);
assert.equal(noArea.costPerHa, 20);

for (const invalidGuarantee of [-1, 101, NaN, Infinity]) {
  assert.throws(() => evaluateCommercialProductRate({ product: { ...kcl60, guaranteesPercent: { K2O: invalidGuarantee } }, rateKgPerHa: 1 }), /Garantia/);
}
for (const invalidFormula of ["04-20", "04-20-20-10", "04-20-x", "101-20-20", "-4-20-20"]) {
  assert.throws(() => parseNpkFormula(invalidFormula), /Fórmula manual|Garantia/);
}
assert.deepEqual(parseNpkFormula("4,5-20-20"), { N: 4.5, P2O5: 20, K2O: 20 });
assert.throws(() => calculateCommercialPackageLogistics({ totalProductKg: -1, packageWeightKg: 50 }), /Total do produto/);
for (const invalidPackage of [0, -50, NaN, Infinity]) assert.throws(() => calculateCommercialPackageLogistics({ totalProductKg: 1, packageWeightKg: invalidPackage }), /Peso da embalagem/);
for (const guarantee of [undefined, 0]) {
  assert.throws(() => computeSingleProductRateFromNutrient({ product: { ...kcl60, guaranteesPercent: { N: guarantee } }, driverNutrient: "N", targetKgPerHa: 1 }), /garantia positiva/);
}
const boundedProduct = { ...kcl60, minRateKgPerHa: 50, maxRateKgPerHa: 100 };
assert.equal(evaluateCommercialProductRate({ product: boundedProduct, rateKgPerHa: 49 }).constraintsSatisfied, false);
assert.equal(evaluateCommercialProductRate({ product: boundedProduct, rateKgPerHa: 101 }).constraintsSatisfied, false);
assert.equal(evaluateCommercialProductRate({ product: boundedProduct, rateKgPerHa: 50 }).constraintsSatisfied, true);
assert.equal(evaluateCommercialProductRate({ product: boundedProduct, rateKgPerHa: 100 }).constraintsSatisfied, true);
assert.throws(() => evaluateCommercialProductRate({ product: { ...boundedProduct, minRateKgPerHa: 101 }, rateKgPerHa: 50 }), /mínima/);
const noTarget = evaluateCommercialProductRate({ product: kcl60, rateKgPerHa: 10, targetsKgPerHa: { N: 10 } });
assert.equal(noTarget.targetComparison.N.suppliedKgPerHa, 0);
assert.equal(noTarget.targetComparison.K2O, undefined);

assert.ok(Math.abs(NUTRIENT_BASIS_FACTORS.P_TO_P2O5 - 2.2913) < 0.0001);
assert.ok(Math.abs(NUTRIENT_BASIS_FACTORS.K_TO_K2O - 1.2046) < 0.0001);
assert.equal(convertNutrientBasis(0, "P", "P2O5"), 0);
assert.equal(convertNutrientBasis(12.345, "K", "K"), 12.345);
assert.throws(() => convertNutrientBasis(10, "P", "K2O"), /não é suportada/);
for (const invalidAmount of [NaN, Infinity]) assert.throws(() => convertNutrientBasis(invalidAmount, "P", "P2O5"), /finito/);
for (const invalidPrnt of [-1, NaN, Infinity]) assert.throws(() => convertCommercialLimeDoseToPrnt100({ productDoseTonPerHa: 1, productPrntPercent: invalidPrnt }), /PRNT/);

console.log("raiz-calculator: conversões, PK, custos sem arredondamento acumulado, PRNT inverso, limites e entradas inválidas aprovados");
