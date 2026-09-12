import assert from "node:assert/strict";
import {
  analyzeNdviTemporalHistory,
  classifyNdviObservationQuality,
  classifyNdviValue,
  computeZoneBreakdownPct,
  detectWithinFieldVariability,
} from "../src/domain/ndvi-engine.ts";

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
  { ndvi: 0.1, pixelCount: 100 },
  { ndvi: 0.3, pixelCount: 200 },
  { ndvi: 0.7, pixelCount: 700 },
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

// 12. Nunca inventa causa nem número -- nota é só descritiva do padrão.
assert.equal(typeof variable.note, "string");
assert.ok(variable.note.length > 0);

// 13-16. Gate de qualidade operacional pela fração sem pixel válido.
assert.equal(classifyNdviObservationQuality({ cloudCoverPct: 5 }), "ALTA");
assert.equal(classifyNdviObservationQuality({ cloudCoverPct: 18 }), "MODERADA");
assert.equal(classifyNdviObservationQuality({ cloudCoverPct: 31 }), "BAIXA");
assert.equal(classifyNdviObservationQuality({ cloudCoverPct: null }), "INDETERMINADA");

// 17. Sem leitura -> sem baseline e sem falso alerta.
const emptyTemporal = analyzeNdviTemporalHistory([]);
assert.equal(emptyTemporal.direction, "SEM_BASELINE");
assert.equal(emptyTemporal.hasRelevantTemporalChange, false);
assert.equal(emptyTemporal.latestMeanNdvi, null);

// 18. Duas leituras: compara com anterior, mas não finge baseline robusto.
const shortTemporal = analyzeNdviTemporalHistory([
  { capturedAt: "2026-08-01", meanNdvi: 0.52, cloudCoverPct: 8 },
  { capturedAt: "2026-08-10", meanNdvi: 0.58, cloudCoverPct: 6 },
]);
assert.equal(shortTemporal.baselineMedian, null);
assert.equal(shortTemporal.deltaFromPrevious, 0.06);
assert.equal(shortTemporal.hasRelevantTemporalChange, false);

// 19. Histórico suficiente e queda relevante frente à mediana das anteriores.
const dropTemporal = analyzeNdviTemporalHistory([
  { capturedAt: "2026-07-01", meanNdvi: 0.72, cloudCoverPct: 4 },
  { capturedAt: "2026-07-10", meanNdvi: 0.74, cloudCoverPct: 5 },
  { capturedAt: "2026-07-20", meanNdvi: 0.71, cloudCoverPct: 7 },
  { capturedAt: "2026-08-01", meanNdvi: 0.73, cloudCoverPct: 6 },
  { capturedAt: "2026-08-12", meanNdvi: 0.51, cloudCoverPct: 9 },
]);
assert.equal(dropTemporal.direction, "QUEDA");
assert.equal(dropTemporal.hasRelevantTemporalChange, true);
assert.equal(dropTemporal.baselineMedian, 0.725);
assert.equal(dropTemporal.deltaFromBaseline, -0.215);
assert.equal(dropTemporal.latestQuality, "ALTA");
assert.ok(dropTemporal.note.includes("não uma causa agronômica"));

// 20. Histórico suficiente, mas leitura atual perto da mediana: não sinaliza mudança relevante.
const stableTemporal = analyzeNdviTemporalHistory([
  { capturedAt: "2026-07-01", meanNdvi: 0.61, cloudCoverPct: 4 },
  { capturedAt: "2026-07-10", meanNdvi: 0.63, cloudCoverPct: 5 },
  { capturedAt: "2026-07-20", meanNdvi: 0.62, cloudCoverPct: 7 },
  { capturedAt: "2026-08-01", meanNdvi: 0.64, cloudCoverPct: 6 },
]);
assert.equal(stableTemporal.direction, "ESTAVEL");
assert.equal(stableTemporal.hasRelevantTemporalChange, false);

console.log("ndvi-engine: 20 cenários aprovados (vigor, variabilidade, qualidade e inteligência temporal)");
