import assert from "node:assert/strict";
import {
  analyzeNdviTemporalHistory,
  classifyNdviObservationQuality,
  classifyNdviValue,
  computeZoneBreakdownPct,
  detectWithinFieldVariability,
} from "../src/domain/ndvi-engine.ts";
import { computeFieldSatelliteStatus } from "../src/domain/field-satellite-status.ts";
import { fieldGeometryBbox, summarizePixelValidity } from "../src/lib/satellite/copernicus-ndvi-provider.ts";

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

// 21. Envelope espacial de Polygon preserva ordem GeoJSON lon/lat.
assert.deepEqual(
  fieldGeometryBbox({
    type: "Polygon",
    coordinates: [[[-52.25, -28.22], [-52.20, -28.22], [-52.20, -28.18], [-52.25, -28.18], [-52.25, -28.22]]],
  }),
  [-52.25, -28.22, -52.20, -28.18],
);

// 22. MultiPolygon também consolida o envelope sem depender de CRS inventado.
assert.deepEqual(
  fieldGeometryBbox({
    type: "MultiPolygon",
    coordinates: [
      [[[-52.30, -28.30], [-52.28, -28.30], [-52.28, -28.28], [-52.30, -28.30]]],
      [[[-52.20, -28.20], [-52.18, -28.20], [-52.18, -28.18], [-52.20, -28.20]]],
    ],
  }),
  [-52.30, -28.30, -52.18, -28.18],
);

// 23. Geometria sem extensão espacial útil falha fechado.
assert.throws(
  () => fieldGeometryBbox({ type: "Polygon", coordinates: [[[1, 1], [1, 1], [1, 1]]] }),
  /Geometria do talhão inválida/,
);

// 24. Statistical API: noDataCount é subconjunto de sampleCount, não soma adicional.
assert.deepEqual(summarizePixelValidity(810, 428), {
  total: 810,
  invalid: 428,
  valid: 382,
  maskedPixelPct: (428 / 810) * 100,
});

// 25. Contagem inválida nunca ultrapassa o total e leitura 100% mascarada resulta em zero válido.
assert.deepEqual(summarizePixelValidity(100, 150), {
  total: 100,
  invalid: 100,
  valid: 0,
  maskedPixelPct: 100,
});

// 26. Uma imagem atual ruim pode parecer uma queda enorme, mas NÃO vira alerta temporal acionável.
const lowQualityLatest = analyzeNdviTemporalHistory([
  { capturedAt: "2026-07-01", meanNdvi: 0.72, cloudCoverPct: 4 },
  { capturedAt: "2026-07-10", meanNdvi: 0.73, cloudCoverPct: 5 },
  { capturedAt: "2026-07-20", meanNdvi: 0.71, cloudCoverPct: 7 },
  { capturedAt: "2026-08-01", meanNdvi: 0.70, cloudCoverPct: 6 },
  { capturedAt: "2026-08-12", meanNdvi: 0.31, cloudCoverPct: 42 },
]);
assert.equal(lowQualityLatest.latestQuality, "BAIXA");
assert.equal(lowQualityLatest.direction, "QUEDA");
assert.equal(lowQualityLatest.hasRelevantTemporalChange, false);
assert.ok(lowQualityLatest.note.includes("não dispara sinal temporal acionável"));

// 27. Uma aquisição histórica ruim é preservada, mas não contamina a mediana do baseline.
const badPriorExcluded = analyzeNdviTemporalHistory([
  { capturedAt: "2026-07-01", meanNdvi: 0.70, cloudCoverPct: 4 },
  { capturedAt: "2026-07-08", meanNdvi: 0.20, cloudCoverPct: 40 },
  { capturedAt: "2026-07-15", meanNdvi: 0.72, cloudCoverPct: 8 },
  { capturedAt: "2026-07-22", meanNdvi: 0.71, cloudCoverPct: 9 },
  { capturedAt: "2026-08-05", meanNdvi: 0.55, cloudCoverPct: 7 },
]);
assert.equal(badPriorExcluded.baselineCount, 3);
assert.equal(badPriorExcluded.baselineMedian, 0.71);
assert.equal(badPriorExcluded.deltaFromBaseline, -0.16);
assert.equal(badPriorExcluded.hasRelevantTemporalChange, true);

// 28. Qualidade indeterminada também falha fechado: não entra no baseline nem dispara alerta.
const unknownQualityLatest = analyzeNdviTemporalHistory([
  { capturedAt: "2026-07-01", meanNdvi: 0.70, cloudCoverPct: 4 },
  { capturedAt: "2026-07-10", meanNdvi: 0.72, cloudCoverPct: 5 },
  { capturedAt: "2026-07-20", meanNdvi: 0.71, cloudCoverPct: 7 },
  { capturedAt: "2026-08-01", meanNdvi: 0.69, cloudCoverPct: 6 },
  { capturedAt: "2026-08-12", meanNdvi: 0.30, cloudCoverPct: null },
]);
assert.equal(unknownQualityLatest.latestQuality, "INDETERMINADA");
assert.equal(unknownQualityLatest.direction, "QUEDA");
assert.equal(unknownQualityLatest.hasRelevantTemporalChange, false);
assert.ok(unknownQualityLatest.note.includes("não dispara alerta"));

// 29. O cockpit não chama histórico "estável" quando a última imagem não tem qualidade mensurável.
const unknownStatus = computeFieldSatelliteStatus("field-1", [
  { capturedAt: "2026-07-01", meanNdvi: 0.70, cloudCoverPct: 4 },
  { capturedAt: "2026-07-10", meanNdvi: 0.72, cloudCoverPct: 5 },
  { capturedAt: "2026-07-20", meanNdvi: 0.71, cloudCoverPct: 7 },
  { capturedAt: "2026-08-12", meanNdvi: 0.69, cloudCoverPct: null },
]);
assert.equal(unknownStatus.badge, "QUALIDADE INDETERMINADA");
assert.equal(unknownStatus.tone, "waiting");
assert.equal(unknownStatus.href, "/talhoes/field-1?aba=evidencias&evidencia=satelite");

console.log("ndvi-engine: 29 cenários aprovados (vigor, temporal, gate de qualidade, cockpit, pixels válidos e envelope espacial)");
