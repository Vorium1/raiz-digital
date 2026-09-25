import assert from "node:assert/strict";
import {
  compareNdviSnapshots,
  NDVI_TEMPORAL_CHANGE_THRESHOLD,
} from "../src/domain/ndvi-engine.ts";

const older = {
  id: "a",
  capturedAt: "2026-08-01",
  meanNdvi: 0.56,
  cloudCoverPct: 8,
  source: "SENTINEL_2",
  rasterAlgorithm: "v2",
  zoneBreakdownPct: { BAIXO: 25, MODERADO: 45, ALTO: 25, MUITO_ALTO: 5 },
};
const newer = {
  id: "b",
  capturedAt: "2026-08-21",
  meanNdvi: 0.72,
  cloudCoverPct: 9,
  source: "SENTINEL_2",
  rasterAlgorithm: "v2",
  zoneBreakdownPct: { BAIXO: 10, MODERADO: 35, ALTO: 40, MUITO_ALTO: 15 },
};

const rising = compareNdviSnapshots(older, newer);
assert.equal(NDVI_TEMPORAL_CHANGE_THRESHOLD, 0.12);
assert.equal(rising.comparable, true);
assert.equal(rising.direction, "ALTA");
assert.equal(rising.deltaMeanNdvi, 0.16);
assert.equal(rising.daysBetween, 20);
assert.equal(rising.lowVigorDeltaPct, -15);
assert.equal(rising.highVigorDeltaPct, 25);
assert.equal(rising.hasRelevantTemporalChange, true);
assert.match(rising.note, /sinal para investigação/i);
assert.match(rising.note, /não uma causa agronômica/i);

const reversed = compareNdviSnapshots(newer, older);
assert.equal(reversed.inputOrderReversed, true);
assert.equal(reversed.earlier.id, "a");
assert.equal(reversed.later.id, "b");
assert.equal(reversed.deltaMeanNdvi, 0.16);

const stable = compareNdviSnapshots(
  older,
  { ...newer, meanNdvi: 0.64 },
);
assert.equal(stable.direction, "ESTAVEL");
assert.equal(stable.hasRelevantTemporalChange, false);
assert.match(stable.note, /não significa ausência de mudança agronômica/i);

const lowQuality = compareNdviSnapshots(
  older,
  { ...newer, cloudCoverPct: 41 },
);
assert.equal(lowQuality.comparable, false);
assert.equal(lowQuality.direction, "NAO_COMPARAVEL");
assert.match(lowQuality.comparabilityReason ?? "", /qualidade/i);
assert.match(lowQuality.note, /podem ser inspecionadas/i);

const sourceMismatch = compareNdviSnapshots(
  older,
  { ...newer, source: "OUTRA_FONTE" },
);
assert.equal(sourceMismatch.comparable, false);
assert.match(sourceMismatch.comparabilityReason ?? "", /fontes diferentes/i);

const algorithmMismatch = compareNdviSnapshots(
  older,
  { ...newer, rasterAlgorithm: "v3" },
);
assert.equal(algorithmMismatch.comparable, false);
assert.match(algorithmMismatch.comparabilityReason ?? "", /algoritmo/i);

const same = compareNdviSnapshots(older, { ...older });
assert.equal(same.comparable, false);
assert.match(same.comparabilityReason ?? "", /duas aquisições diferentes/i);

console.log("ndvi pairwise comparison: ok");
