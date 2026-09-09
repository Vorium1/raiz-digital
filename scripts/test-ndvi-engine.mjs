import assert from "node:assert/strict";
import { classifyNdviValue, computeZoneBreakdownPct, detectWithinFieldVariability } from "../src/domain/ndvi-engine.ts";

// 1-5. Classificação de faixa por valor pontual.
assert.equal(classifyNdviValue(-0.1), "SEM_VEGETACAO");
assert.equal(classifyNdviValue(0.15), "SEM_VEGETACAO");
assert.equal(classifyNdviValue(0.25), "BAIXO");
assert.equal(classifyNdviValue(0.45), "MODERADO");
assert.equal(classifyNdviValue(0.65), "ALTO");
assert.equal(classifyNdviValue(0.9), "MUITO_ALTO");

// 6. Limites exatos das faixas (< estrito, nunca <=).
assert.equal(classifyNdviValue(0.2), "BAIXO");
assert.equal(classifyNdviValue(0.4), "MODERADO");
assert.equal(classifyNdviValue(0.6), "ALTO");
assert.equal(classifyNdviValue(0.8), "MUITO_ALTO");

// 7. Histograma vazio -> breakdown vazio, nunca divisão por zero.
assert.deepEqual(computeZoneBreakdownPct([]), {});

// 8. Histograma uniforme (100% em uma faixa).
const uniform = computeZoneBreakdownPct([{ ndvi: 0.7, pixelCount: 500 }]);
assert.equal(uniform.ALTO, 100);
assert.equal(Object.keys(uniform).length, 1);

// 9. Histograma misto -- percentuais somam ~100 e batem com a contagem de pixels real.
const mixed = computeZoneBreakdownPct([
  { ndvi: 0.1, pixelCount: 100 }, // SEM_VEGETACAO
  { ndvi: 0.3, pixelCount: 200 }, // BAIXO
  { ndvi: 0.7, pixelCount: 700 }, // ALTO
]);
assert.equal(mixed.SEM_VEGETACAO, 10);
assert.equal(mixed.BAIXO, 20);
assert.equal(mixed.ALTO, 70);
const total = Object.values(mixed).reduce((a, b) => a + b, 0);
assert.ok(Math.abs(total - 100) < 0.01);

// 10. Variabilidade real detectada (baixo e alto ambos >= 20%).
const variable = detectWithinFieldVariability({ BAIXO: 30, MODERADO: 20, ALTO: 50 });
assert.equal(variable.hasSignificantVariability, true);

// 11. Sem variabilidade relevante (quase tudo numa faixa só).
const uniformField = detectWithinFieldVariability({ MODERADO: 5, ALTO: 90, MUITO_ALTO: 5 });
assert.equal(uniformField.hasSignificantVariability, false);

// 12. Nunca inventa causa nem número -- a nota é só descritiva do padrão, checagem de tipo/forma.
assert.equal(typeof variable.note, "string");
assert.ok(variable.note.length > 0);

console.log("ndvi-engine: 12 cenários aprovados (classificação de vigor, breakdown por histograma, variabilidade interna)");
