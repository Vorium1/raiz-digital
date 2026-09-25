import assert from "node:assert/strict";
import { buildPublishedParameterDashboard } from "../src/domain/published-result-dashboard.ts";

const rows = buildPublishedParameterDashboard({
  facts: [
    { sampleCode: "P1", parameterCode: "P", value: 8, unit: "mg/dm3", method: "Mehlich-1" },
    { sampleCode: "P2", parameterCode: "P", value: 12, unit: "mg/dm3", method: "Mehlich-1" },
    { sampleCode: "P1", parameterCode: "B", value: 0.3, unit: "mg/dm3", method: "Água quente" },
    { sampleCode: "P2", parameterCode: "B", value: 0.4, unit: "mg/dm3", method: "Água quente" },
    { sampleCode: "P1", parameterCode: "ZN", value: 1, unit: "mg/dm3", method: "DTPA" },
    { sampleCode: "P2", parameterCode: "ZN", value: 0.1, unit: "g/kg", method: "Outro" },
  ],
  interpretation: [
    { sampleCode: "P1", parameterCode: "P", interpretable: true, classification: "LOW", classificationRole: "TARGET" },
    { sampleCode: "P2", parameterCode: "P", interpretable: true, classification: "MEDIUM", classificationRole: "TARGET" },
    { sampleCode: "P1", parameterCode: "B", interpretable: false, reason: "Faixa não homologada para este método.", classificationRole: "TARGET" },
    { sampleCode: "P2", parameterCode: "B", interpretable: false, reason: "Faixa não homologada para este método.", classificationRole: "TARGET" },
    { sampleCode: "P1", parameterCode: "P", interpretable: true, classification: "AUX", classificationRole: "AUXILIARY" },
  ],
});

const phosphorus = rows.find((row) => row.parameterCode === "P");
assert.ok(phosphorus);
assert.equal(phosphorus.mean, 10);
assert.equal(phosphorus.min, 8);
assert.equal(phosphorus.max, 12);
assert.equal(phosphorus.unit, "mg/dm3");
assert.deepEqual(phosphorus.classificationCounts, [
  { classification: "LOW", count: 1 },
  { classification: "MEDIUM", count: 1 },
]);
assert.equal(phosphorus.classifiedCount, 2);
assert.equal(phosphorus.unclassifiedCount, 0);
assert.deepEqual(phosphorus.methods, ["Mehlich-1"]);

const boron = rows.find((row) => row.parameterCode === "B");
assert.ok(boron, "Boro precisa aparecer mesmo sem classificação homologada.");
assert.equal(boron.mean, 0.35);
assert.equal(boron.classifiedCount, 0);
assert.equal(boron.unclassifiedCount, 2);
assert.deepEqual(boron.reasons, ["Faixa não homologada para este método."]);

const zinc = rows.find((row) => row.parameterCode === "ZN");
assert.ok(zinc);
assert.equal(zinc.mixedUnits, true);
assert.equal(zinc.mean, null, "Unidades diferentes não podem ser convertidas/mediadas silenciosamente.");
assert.equal(zinc.unit, null);

console.log("published-result-dashboard: fatos congelados, micros sem classificação e unidades mistas aprovados");
