import assert from "node:assert/strict";
import {
  computeSingleProductRateFromNutrient,
  convertCommercialLimeDoseToPrnt100,
  convertLimingRequirementToCommercialProduct,
  convertNutrientBasis,
  evaluateCommercialProductRate,
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

const urea46 = computeSingleProductRateFromNutrient({
  product: { code: "UREIA-TESTE", name: "Fonte nitrogenada 46%", guaranteesPercent: { N: 46 } },
  driverNutrient: "N",
  targetKgPerHa: 90,
});
assert.ok(Math.abs(urea46.rateKgPerHa - 195.6522) < 0.0001);

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

const reverseLime = convertCommercialLimeDoseToPrnt100({
  productDoseTonPerHa: 5.925,
  productPrntPercent: 80,
});
assert.equal(reverseLime.equivalentPrnt100TonPerHa, 4.74);

assert.throws(() => convertNutrientBasis(-1, "P", "P2O5"), /maior ou igual a zero/i);
assert.throws(() => convertCommercialLimeDoseToPrnt100({ productDoseTonPerHa: 1, productPrntPercent: 0 }), /PRNT/i);

console.log("raiz-calculator: conversões nutriente/produto, bases químicas e PRNT aprovadas");
