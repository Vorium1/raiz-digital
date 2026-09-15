import assert from "node:assert/strict";
import { normalizeCommercialInputCatalogDraft } from "../src/domain/commercial-input-catalog.ts";

const fertilizer = normalizeCommercialInputCatalogDraft({
  code: " formula 01 ",
  name: "Produto real informado",
  kind: "FERTILIZER",
  guaranteesPercent: { N: 10, P2O5: 20, K2O: 0 },
  pricePerTon: 2450.5,
  minRateKgPerHa: 50,
  maxRateKgPerHa: 300,
});
assert.equal(fertilizer.code, "FORMULA-01");
assert.deepEqual(fertilizer.guaranteesPercent, { N: 10, P2O5: 20 });
assert.equal(fertilizer.pricePerTon, 2450.5);
assert.equal(fertilizer.active, true);

// PRNT é dado declarado/validado do produto e não recebe teto artificial de 100% no software.
const limestone = normalizeCommercialInputCatalogDraft({
  code: "calc-01",
  name: "Calcário com laudo",
  kind: "LIMESTONE",
  prntPercent: 105.2,
  guaranteesPercent: { Ca: 30, Mg: 12 },
});
assert.equal(limestone.prntPercent, 105.2);

assert.throws(() => normalizeCommercialInputCatalogDraft({
  code: "sem-garantia",
  name: "Inválido",
  kind: "FERTILIZER",
  guaranteesPercent: {},
}), /ao menos uma garantia/i);

assert.throws(() => normalizeCommercialInputCatalogDraft({
  code: "calc-sem-prnt",
  name: "Inválido",
  kind: "LIMESTONE",
  guaranteesPercent: { Ca: 30 },
}), /PRNT informado/i);

assert.throws(() => normalizeCommercialInputCatalogDraft({
  code: "calc-zero",
  name: "Inválido",
  kind: "LIMESTONE",
  prntPercent: 0,
}), /maior que zero/i);

assert.throws(() => normalizeCommercialInputCatalogDraft({
  code: "limites",
  name: "Inválido",
  kind: "FERTILIZER",
  guaranteesPercent: { K2O: 60 },
  minRateKgPerHa: 200,
  maxRateKgPerHa: 100,
}), /mínima não pode ser maior/i);

assert.throws(() => normalizeCommercialInputCatalogDraft({
  code: "preco-negativo",
  name: "Inválido",
  kind: "FERTILIZER",
  guaranteesPercent: { N: 46 },
  pricePerTon: -1,
}), /maior ou igual a zero/i);

assert.throws(() => normalizeCommercialInputCatalogDraft({
  code: "garantia-invalida",
  name: "Inválido",
  kind: "FERTILIZER",
  guaranteesPercent: { N: 101 },
}), /entre 0 e 100/i);

console.log("commercial-input-catalog: valida fórmula declarada, PRNT, preço e limites sem inventar dados");
