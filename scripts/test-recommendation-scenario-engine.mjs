import assert from "node:assert/strict";
import { buildRecommendationScenarioMatrix } from "../src/domain/recommendation-scenario-engine.ts";

const productA = {
  code: "SYN-A",
  name: "Produto sintético A",
  guaranteesPercent: { N: 10, P2O5: 20, K2O: 10 },
  pricePerTon: 1000,
};
const productB = {
  code: "SYN-B",
  name: "Produto sintético B",
  guaranteesPercent: { P2O5: 5, K2O: 25 },
  pricePerTon: 2000,
};
const samePhysicalAWithHigherPrice = { ...productA, code: "SYN-A-PREMIUM", name: "Produto sintético A premium", pricePerTon: 1400 };
const samePhysicalBWithHigherPrice = { ...productB, code: "SYN-B-PREMIUM", name: "Produto sintético B premium", pricePerTon: 2600 };

const matrix = buildRecommendationScenarioMatrix({
  areaHa: 10,
  agronomicScenarios: [
    {
      id: "YIELD-LOW",
      label: "Meta produtiva 1",
      targetYieldTonPerHa: 3.5,
      targetsKgPerHa: { P2O5: 50, K2O: 70 },
      provenance: { kind: "DETERMINISTIC_ENGINE", referenceId: "interpretation-rev-7" },
      uniformApplicationReady: true,
    },
    {
      id: "YIELD-HIGH",
      label: "Meta produtiva 2",
      targetYieldTonPerHa: 5,
      targetsKgPerHa: { P2O5: 80, K2O: 110 },
      provenance: { kind: "DETERMINISTIC_ENGINE", referenceId: "interpretation-rev-7" },
      uniformApplicationReady: true,
    },
  ],
  commercialStrategies: [
    { id: "ECON", label: "Estratégia econômica", kind: "TWO_PRODUCT_PK", productA, productB },
    { id: "PREMIUM", label: "Estratégia alta investimento", kind: "TWO_PRODUCT_PK", productA: samePhysicalAWithHigherPrice, productB: samePhysicalBWithHigherPrice },
  ],
});

assert.equal(matrix.cells.length, 4);
const lowEconomic = matrix.cells.find((cell) => cell.agronomicScenarioId === "YIELD-LOW" && cell.commercialStrategyId === "ECON");
const lowPremium = matrix.cells.find((cell) => cell.agronomicScenarioId === "YIELD-LOW" && cell.commercialStrategyId === "PREMIUM");
assert.equal(lowEconomic?.status, "READY");
assert.equal(lowPremium?.status, "READY");
if (lowEconomic?.status !== "READY" || lowPremium?.status !== "READY") throw new Error("células deveriam estar prontas");

// Estratégia comercial muda preço/cesta, mas NÃO muda a necessidade agronômica.
assert.deepEqual(lowEconomic.agronomicTargetsKgPerHa, { P2O5: 50, K2O: 70 });
assert.deepEqual(lowPremium.agronomicTargetsKgPerHa, { P2O5: 50, K2O: 70 });
assert.equal(lowEconomic.plan.targetComparison.P2O5?.targetKgPerHa, 50);
assert.equal(lowPremium.plan.targetComparison.P2O5?.targetKgPerHa, 50);
assert.equal(lowEconomic.plan.targetComparison.K2O?.targetKgPerHa, 70);
assert.equal(lowPremium.plan.targetComparison.K2O?.targetKgPerHa, 70);
assert.ok((lowPremium.plan.costPerHa ?? 0) > (lowEconomic.plan.costPerHa ?? 0));

const highEconomic = matrix.cells.find((cell) => cell.agronomicScenarioId === "YIELD-HIGH" && cell.commercialStrategyId === "ECON");
assert.equal(highEconomic?.status, "READY");
if (highEconomic?.status !== "READY") throw new Error("cenário alto deveria estar pronto");
assert.equal(highEconomic.targetYieldTonPerHa, 5);
assert.deepEqual(highEconomic.agronomicTargetsKgPerHa, { P2O5: 80, K2O: 110 });

// A etiqueta de investimento por si só não tem efeito: mesma fórmula/preço => mesmo resultado.
const labelOnly = buildRecommendationScenarioMatrix({
  agronomicScenarios: [{
    id: "BASE",
    label: "Meta explícita",
    targetYieldTonPerHa: 4,
    targetsKgPerHa: { P2O5: 50, K2O: 70 },
    provenance: { kind: "PROFESSIONAL_APPROVED", referenceId: "review-123" },
    uniformApplicationReady: true,
  }],
  commercialStrategies: [
    { id: "LOW-LABEL", label: "Baixo investimento", kind: "TWO_PRODUCT_PK", productA, productB },
    { id: "HIGH-LABEL", label: "Alto investimento", kind: "TWO_PRODUCT_PK", productA, productB },
  ],
});
const readyCells = labelOnly.cells.filter((cell) => cell.status === "READY");
assert.equal(readyCells.length, 2);
assert.deepEqual(readyCells[0].plan, readyCells[1].plan);

// Heterogeneidade/ausência de base uniforme bloqueia TODA estratégia, em vez de escolher maioria silenciosa.
const heterogeneous = buildRecommendationScenarioMatrix({
  agronomicScenarios: [{
    id: "HET",
    label: "Talhão heterogêneo",
    targetYieldTonPerHa: 4.2,
    targetsKgPerHa: { P2O5: 50, K2O: 70 },
    provenance: { kind: "DETERMINISTIC_ENGINE", referenceId: "cabeda-area01" },
    uniformApplicationReady: false,
    uniformApplicationBlockers: ["P sem predominância estrita; não escolher classe uniforme por maioria."],
  }],
  commercialStrategies: [{ id: "ANY", label: "Qualquer cesta", kind: "TWO_PRODUCT_PK", productA, productB }],
});
assert.equal(heterogeneous.cells[0].status, "BLOCKED");
if (heterogeneous.cells[0].status !== "BLOCKED") throw new Error("cenário heterogêneo deveria estar bloqueado");
assert.match(heterogeneous.cells[0].blockers[0], /predominância estrita/i);

// Cesta P/K exige alvos P e K explícitos; não inventa nutriente ausente.
const missingK = buildRecommendationScenarioMatrix({
  agronomicScenarios: [{
    id: "NO-K",
    label: "Sem alvo de K",
    targetYieldTonPerHa: 4,
    targetsKgPerHa: { P2O5: 50 },
    provenance: { kind: "DETERMINISTIC_ENGINE", referenceId: "interpretation-x" },
    uniformApplicationReady: true,
  }],
  commercialStrategies: [{ id: "PK", label: "Cesta P/K", kind: "TWO_PRODUCT_PK", productA, productB }],
});
assert.equal(missingK.cells[0].status, "BLOCKED");

assert.throws(
  () => buildRecommendationScenarioMatrix({
    agronomicScenarios: [{
      id: "BAD",
      label: "Meta inválida",
      targetYieldTonPerHa: 0,
      targetsKgPerHa: { P2O5: 50, K2O: 70 },
      provenance: { kind: "DETERMINISTIC_ENGINE", referenceId: "x" },
      uniformApplicationReady: true,
    }],
    commercialStrategies: [{ id: "PK", label: "Cesta", kind: "TWO_PRODUCT_PK", productA, productB }],
  }),
  /meta produtiva.*maior que zero/i,
);

console.log("recommendation-scenario-engine: produtividade numérica e investimento comercial permanecem eixos separados");
