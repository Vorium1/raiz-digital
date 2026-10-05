import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  assessSoilSatelliteTemporalRelation,
} from "../src/domain/ndvi-engine.ts";

const sameDate = assessSoilSatelliteTemporalRelation({
  soilCollectedAt: "2026-08-21T14:00:00-03:00",
  satelliteCapturedAt: "2026-08-21",
  satelliteCloudCoverPct: 8,
});
assert.equal(sameDate.status, "SAME_DATE");
assert.equal(sameDate.daysApart, 0);
assert.equal(sameDate.sequence, "SAME_DATE");
assert.match(sameDate.note, /não prova correlação|não prova.*causalidade/i);

const knownGap = assessSoilSatelliteTemporalRelation({
  soilCollectedAt: "2026-08-01",
  satelliteCapturedAt: "2026-08-21",
  satelliteCloudCoverPct: 9,
});
assert.equal(knownGap.status, "DATE_GAP");
assert.equal(knownGap.daysApart, 20);
assert.equal(knownGap.sequence, "SOIL_BEFORE_SATELLITE");
assert.match(knownGap.note, /não usa esse intervalo.*sozinho.*comparabilidade agronômica/i);

const reverseGap = assessSoilSatelliteTemporalRelation({
  soilCollectedAt: "2026-08-30",
  satelliteCapturedAt: "2026-08-21",
  satelliteCloudCoverPct: 10,
});
assert.equal(reverseGap.status, "DATE_GAP");
assert.equal(reverseGap.daysApart, 9);
assert.equal(reverseGap.sequence, "SATELLITE_BEFORE_SOIL");

const missingSoil = assessSoilSatelliteTemporalRelation({
  soilCollectedAt: null,
  satelliteCapturedAt: "2026-08-21",
  satelliteCloudCoverPct: 8,
});
assert.equal(missingSoil.status, "SOIL_DATE_MISSING");
assert.equal(missingSoil.daysApart, null);
assert.match(missingSoil.note, /evidência temporal é insuficiente/i);

const lowQuality = assessSoilSatelliteTemporalRelation({
  soilCollectedAt: "2026-08-01",
  satelliteCapturedAt: "2026-08-21",
  satelliteCloudCoverPct: 41,
});
assert.equal(lowQuality.status, "SATELLITE_QUALITY_LIMITED");
assert.equal(lowQuality.daysApart, 20);
assert.match(lowQuality.note, /não sustenta um sinal temporal acionável/i);

const missingSatellite = assessSoilSatelliteTemporalRelation({
  soilCollectedAt: "2026-08-01",
  satelliteCapturedAt: null,
  satelliteCloudCoverPct: null,
});
assert.equal(missingSatellite.status, "SATELLITE_DATE_MISSING");
assert.equal(missingSatellite.daysApart, null);

const engineSource = readFileSync("src/domain/ndvi-engine.ts", "utf8");
const contextSource = readFileSync("src/components/soil-satellite-evidence-context.tsx", "utf8");
const panelSource = readFileSync("src/components/field-ndvi-panel.tsx", "utf8");

assert.match(engineSource, /não possui uma\s+\* regra agronômica homologada|NÃO existe um corte/i);
assert.doesNotMatch(engineSource, /daysApart\s*[<>]=?\s*\d+/, "não pode haver corte oculto de dias para comparabilidade");
assert.match(contextSource, /effectivePointCoordinates/);
assert.match(contextSource, /pointPositionKind/);
assert.match(contextSource, /Posição planejada/);
assert.match(contextSource, /Não tratar como coordenada medida em campo/);
assert.match(contextSource, /Sem corte de dias inventado/);
assert.match(contextSource, /não calcula correlação nem atribui causa/i);
assert.match(panelSource, /SoilSatelliteEvidenceContext/);
assert.match(panelSource, /satellite=\{selectedRasterSnapshot\}/);
assert.match(panelSource, /points=\{soilPoints\}/);

console.log("soil satellite evidence context: ok");
