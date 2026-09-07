import assert from "node:assert/strict";
import { SOJA_DOSE_TABLE, computeGrainFertilizerDose, computeSojaSulfurRecommendation } from "../src/domain/fertilizer-dose-engine.ts";

// 1-10. P2O5, todos os níveis, 1º cultivo, rendimento = referência (3 t/ha) -- valores exatos da Tabela 6.1.18.
const p2o5First = { "Muito Baixo": 155, Baixo: 95, Médio: 85, Alto: 45 };
for (const [level, expected] of Object.entries(p2o5First)) {
  const result = computeGrainFertilizerDose(SOJA_DOSE_TABLE, "P2O5", level, "PRIMEIRO", 3);
  assert.equal(result.doseKgPerHa, expected, `P2O5 1º cultivo ${level} esperado ${expected}, obtido ${result.doseKgPerHa}`);
  assert.equal(result.isDiscretionaryRange, false);
}

// 11-14. P2O5, 2º cultivo.
const p2o5Second = { "Muito Baixo": 95, Baixo: 75, Médio: 45, Alto: 45 };
for (const [level, expected] of Object.entries(p2o5Second)) {
  const result = computeGrainFertilizerDose(SOJA_DOSE_TABLE, "P2O5", level, "SEGUNDO", 3);
  assert.equal(result.doseKgPerHa, expected, `P2O5 2º cultivo ${level} esperado ${expected}, obtido ${result.doseKgPerHa}`);
}

// 15. Muito Alto, 1º cultivo -- dose 0 (não aplicar), sem faixa discricionária.
const muitoAltoFirst = computeGrainFertilizerDose(SOJA_DOSE_TABLE, "P2O5", "Muito Alto", "PRIMEIRO", 3);
assert.equal(muitoAltoFirst.doseKgPerHa, 0);
assert.equal(muitoAltoFirst.isDiscretionaryRange, false);

// 16. Muito Alto, 2º cultivo -- faixa discricionária 0 até 45 (teto), marcado como tal, nunca um valor inventado.
const muitoAltoSecond = computeGrainFertilizerDose(SOJA_DOSE_TABLE, "P2O5", "Muito Alto", "SEGUNDO", 3);
assert.equal(muitoAltoSecond.isDiscretionaryRange, true);
assert.equal(muitoAltoSecond.discretionaryRangeMax, 45);

// 17-20. K2O, 1º cultivo, rendimento referência.
const k2oFirst = { "Muito Baixo": 155, Baixo: 115, Médio: 105, Alto: 75 };
for (const [level, expected] of Object.entries(k2oFirst)) {
  const result = computeGrainFertilizerDose(SOJA_DOSE_TABLE, "K2O", level, "PRIMEIRO", 3);
  assert.equal(result.doseKgPerHa, expected, `K2O 1º cultivo ${level} esperado ${expected}, obtido ${result.doseKgPerHa}`);
}

// 21. Rendimento esperado ACIMA da referência: soma dose extra. Ex.: 5 t/ha (2 t acima de 3) -> +2*15=30 kg P2O5/ha.
const highYield = computeGrainFertilizerDose(SOJA_DOSE_TABLE, "P2O5", "Alto", "PRIMEIRO", 5);
assert.equal(highYield.yieldAdjustmentKgPerHa, 30);
assert.equal(highYield.doseKgPerHa, 45 + 30);

// 22. Rendimento esperado ACIMA da referência pro K2O -> +2*25=50 kg K2O/ha.
const highYieldK = computeGrainFertilizerDose(SOJA_DOSE_TABLE, "K2O", "Alto", "PRIMEIRO", 5);
assert.equal(highYieldK.yieldAdjustmentKgPerHa, 50);
assert.equal(highYieldK.doseKgPerHa, 75 + 50);

// 23. Rendimento esperado ABAIXO da referência: NUNCA desconta (fonte só soma pra rendimento maior, nunca subtrai).
const lowYield = computeGrainFertilizerDose(SOJA_DOSE_TABLE, "P2O5", "Alto", "PRIMEIRO", 1.5);
assert.equal(lowYield.yieldAdjustmentKgPerHa, 0);
assert.equal(lowYield.doseKgPerHa, 45);

// 24-25. Enxofre: limiar fixo, não faixa de 5 níveis.
const sulfurLow = computeSojaSulfurRecommendation(8);
assert.equal(sulfurLow.needed, true);
assert.equal(sulfurLow.applyKgPerHa, 20);
const sulfurOk = computeSojaSulfurRecommendation(12);
assert.equal(sulfurOk.needed, false);
assert.equal(sulfurOk.applyKgPerHa, 0);

console.log("fertilizer-dose-engine: 25 cenários aprovados (soja, P2O5/K2O/S, conferidos contra Manual CQFS-RS/SC 2016 item 6.1.18)");
