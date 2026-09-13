import assert from "node:assert/strict";
import { runAgronomicEngine } from "../src/domain/agronomic-engine.ts";
import { computeLimingDoseBySmpIndex } from "../src/domain/liming-engine.ts";
import { computeParameterPredominance } from "../src/domain/parameter-predominance.ts";

// Fixture de regressão: Área 01 / AN-CABEDA-01, transcrita do mesmo conjunto real já mantido em
// scripts/import-cabeda-solo-2026.mjs. Este teste NÃO inventa uma nova análise e NÃO acessa banco.
// Ele congela o comportamento esperado do núcleo determinístico para impedir regressão silenciosa.
const AREA_01 = [
  { clay: 72, ph: 5.3, smp: 5.6, p: 11.0, k: 229.9, ctc: 16.1, s: 9.8 },
  { clay: 62, ph: 5.3, smp: 5.5, p: 9.8, k: 187.7, ctc: 16.1, s: 8.4 },
  { clay: 59, ph: 5.4, smp: 5.8, p: 7.2, k: 151.8, ctc: 14.4, s: 12.2 },
  { clay: 67, ph: 5.4, smp: 5.8, p: 9.1, k: 200.0, ctc: 14.8, s: 6.9 },
  { clay: 79, ph: 5.3, smp: 5.8, p: 7.8, k: 189.8, ctc: 14.2, s: 12.8 },
  { clay: 72, ph: 5.2, smp: 5.8, p: 6.0, k: 166.1, ctc: 14.4, s: 8.4 },
  { clay: 69, ph: 5.1, smp: 5.7, p: 9.0, k: 233.2, ctc: 13.8, s: 12.1 },
  { clay: 58, ph: 5.2, smp: 5.7, p: 21.2, k: 179.3, ctc: 15.3, s: 8.9 },
];

const bands = {
  pClay1: [
    { label: "Muito Baixo", max: 3.0 }, { label: "Baixo", min: 3.1, max: 6.0 },
    { label: "Médio", min: 6.1, max: 9.0 }, { label: "Alto", min: 9.1, max: 18.0 }, { label: "Muito Alto", min: 18.0 },
  ],
  pClay2: [
    { label: "Muito Baixo", max: 4.0 }, { label: "Baixo", min: 4.1, max: 8.0 },
    { label: "Médio", min: 8.1, max: 12.0 }, { label: "Alto", min: 12.1, max: 24.0 }, { label: "Muito Alto", min: 24.0 },
  ],
  kCtc2: [
    { label: "Muito Baixo", max: 30 }, { label: "Baixo", min: 31, max: 60 },
    { label: "Médio", min: 61, max: 90 }, { label: "Alto", min: 91, max: 180 }, { label: "Muito Alto", min: 180 },
  ],
  kCtc3: [
    { label: "Muito Baixo", max: 40 }, { label: "Baixo", min: 41, max: 80 },
    { label: "Médio", min: 81, max: 120 }, { label: "Alto", min: 121, max: 240 }, { label: "Muito Alto", min: 240 },
  ],
};

const mk = (id, parameterCode, sufficiencyRanges, conditionParameterCode, conditionMin, conditionMax) => ({
  id,
  parameterCode,
  parameterCategory: "QUIMICO",
  sampleType: "SOLO",
  depthFromCm: 0,
  depthToCm: 20,
  analyticalMethodAllowed: [parameterCode === "P" || parameterCode === "K" ? "Mehlich-1" : ""].filter(Boolean),
  unitExpected: "mg/dm³",
  sufficiencyRanges,
  criticality: "ALTA",
  status: "ACTIVE",
  conditionParameterCode,
  conditionMin,
  conditionMax,
  derivedParameterCode: null,
});

const cropProfile = {
  id: "fixture-soja-cqfs-2016",
  code: "SOJA",
  name: "Soja",
  status: "ACTIVE",
  semanticVersion: "fixture-cqfs-2016",
  contentHash: "fixture-area01",
  auxiliaryParameterCodes: ["CLAY", "CTC", "PH", "SMP", "S"],
  parameters: [
    mk("p-clay-1", "P", bands.pClay1, "CLAY", 60.0001, null),
    mk("p-clay-2", "P", bands.pClay2, "CLAY", 41, 60),
    mk("k-ctc-2", "K", bands.kCtc2, "CTC", 7.6, 15.0),
    mk("k-ctc-3", "K", bands.kCtc3, "CTC", 15.1, 30.0),
  ],
};

const labResults = AREA_01.flatMap((row, index) => {
  const sampleCode = `P${index + 1}`;
  const common = { sampleCode, sampleType: "SOLO", depthFromCm: 0, depthToCm: 20, source: "MEASURED" };
  return [
    { ...common, parameterCode: "CLAY", value: row.clay, unit: "%", method: "Densímetro" },
    { ...common, parameterCode: "P", value: row.p, unit: "mg/dm³", method: "Mehlich-1" },
    { ...common, parameterCode: "K", value: row.k, unit: "mg/dm³", method: "Mehlich-1" },
    { ...common, parameterCode: "CTC", value: row.ctc, unit: "cmolc/dm³", method: "Calculado: CTCpH7,0 = Ca + Mg + K + (H+Al)" },
  ];
});

const engine = runAgronomicEngine({ cropProfile, labResults });
const interpreted = engine.interpretation.filter((item) => item.interpretable);
const classes = (parameterCode) => interpreted.filter((item) => item.parameterCode === parameterCode).map((item) => item.classification);

assert.deepEqual(classes("P"), ["Alto", "Alto", "Baixo", "Alto", "Médio", "Baixo", "Médio", "Alto"]);
assert.deepEqual(classes("K"), ["Alto", "Alto", "Alto", "Muito Alto", "Muito Alto", "Alto", "Muito Alto", "Alto"]);

const predominance = computeParameterPredominance(engine.interpretation);
const pPredominance = predominance.find((item) => item.parameterCode === "P");
const kPredominance = predominance.find((item) => item.parameterCode === "K");
assert.equal(pPredominance, undefined, "P tem 4/8 pontos em Alto (50%): não é maioria estrita e não pode virar dose uniforme por predominância.");
assert.deepEqual(kPredominance && { classification: kPredominance.classification, matchingCount: kPredominance.matchingCount, totalCount: kPredominance.totalCount }, { classification: "Alto", matchingCount: 5, totalCount: 8 });

const limePh6 = AREA_01.map((row) => computeLimingDoseBySmpIndex(row.smp, "6.0").doseTonPerHaPrnt100);
assert.deepEqual(limePh6, [5.4, 6.1, 4.2, 4.2, 4.2, 4.2, 4.8, 4.8]);
const limeMean = limePh6.reduce((sum, value) => sum + value, 0) / limePh6.length;
assert.equal(Math.round(limeMean * 100) / 100, 4.74);
assert.equal(Math.min(...limePh6), 4.2);
assert.equal(Math.max(...limePh6), 6.1);

const sulfurBelow10 = AREA_01.filter((row) => row.s < 10).length;
assert.equal(sulfurBelow10, 5);

// O laudo Cabeda importado não informa meta de produtividade nem qual é o 1º/2º cultivo APÓS esta
// análise. `cultivation_years` representa idade/histórico da área e NÃO substitui a dimensão da tabela
// CQFS relativa à análise. Portanto o ensaio deliberadamente NÃO chama computeGrainFertilizerDose para
// produzir uma dose P/K oficial: faltam entradas de decisão, e P nem sequer tem predominância >50%.
const recommendationBlockers = [
  "YIELD_GOAL_MISSING",
  "CULTIVATION_SEQUENCE_AFTER_ANALYSIS_MISSING",
  "P_NO_STRICT_PREDOMINANCE",
  "SAMPLE_COORDINATES_NOT_VERIFIED_FOR_VARIABLE_RATE",
];
assert.ok(recommendationBlockers.includes("CULTIVATION_SEQUENCE_AFTER_ANALYSIS_MISSING"));

console.log(JSON.stringify({
  scenario: "Cabeda / Área 01 / AN-CABEDA-01",
  samples: AREA_01.length,
  pClassifications: classes("P"),
  kClassifications: classes("K"),
  predominance: predominance.map(({ parameterCode, classification, matchingCount, totalCount }) => ({ parameterCode, classification, matchingCount, totalCount })),
  limePh6Prnt100TonHa: { bySample: limePh6, mean: 4.74, min: 4.2, max: 6.1 },
  sulfurBelow10MgDm3: sulfurBelow10,
  recommendationBlockers,
}, null, 2));
