import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { calculateLabImportConfidence } from "../src/domain/lab-import.ts";
import { buildLabImportConfidenceExplanation } from "../src/domain/lab-import-confidence-explanation.ts";

const rows = [
  { parameterCode: "P", unit: "mg/dm³", method: "Mehlich-1", unitInferred: false, methodInferred: false },
  { parameterCode: "K", unit: "mg/dm³", method: "Mehlich-1", unitInferred: false, methodInferred: false },
];

const clean = calculateLabImportConfidence(rows, [], { hasAgronomicContext: false, spatialLinked: false });
assert.equal(clean.score, 100, "contexto/GPS com peso zero não podem reduzir score do laudo");
assert.equal(clean.dimensions.find((d) => d.key === "context")?.weight, 0);
assert.equal(clean.dimensions.find((d) => d.key === "spatialQuality")?.weight, 0);

const cleanExplanation = buildLabImportConfidenceExplanation(clean, []);
assert.equal(cleanExplanation.dimensions.length, 3, "explicação numérica mostra somente dimensões ponderadas");
assert.deepEqual(cleanExplanation.dimensions.map((d) => d.weightPct), [35, 35, 30]);
assert.deepEqual(cleanExplanation.dimensions.map((d) => d.contribution), [35, 35, 30]);
assert.match(cleanExplanation.caveat, /peso zero/i);

const localizedIssue = {
  severity: "BLOCKER",
  code: "UNIT_UNKNOWN",
  message: "Unidade não reconhecida.",
  line: 4,
  sampleCode: "P1",
  parameterCode: "B",
};
const limited = calculateLabImportConfidence(rows, [localizedIssue], {});
const limitedExplanation = buildLabImportConfidenceExplanation(limited, [localizedIssue]);
assert.equal(limitedExplanation.localizedBlockers, 1);
assert.equal(limitedExplanation.structuralBlockers, 0);
assert.equal(limitedExplanation.issueGroups[0].scope, "LOCAL");
assert.match(limitedExplanation.issueGroups[0].requiredAction, /unidade/i);

const structuralIssue = {
  severity: "BLOCKER",
  code: "SAMPLE_COLUMN_MISSING",
  message: "Coluna de amostra ausente.",
};
const structuralExplanation = buildLabImportConfidenceExplanation(
  calculateLabImportConfidence(rows, [structuralIssue], {}),
  [structuralIssue],
);
assert.equal(structuralExplanation.structuralBlockers, 1);
assert.equal(structuralExplanation.issueGroups[0].scope, "STRUCTURAL");

console.log("lab import confidence explanation: ok");

const analysisPageSource = readFileSync("src/app/(platform)/analises/[id]/page.tsx", "utf8");
const importsRepositorySource = readFileSync("src/lib/repositories/imports.ts", "utf8");
assert.match(analysisPageSource, /getLatestAnalysisImportConfidenceDetails/, "a tela real deve buscar o detalhe do score persistido");
assert.match(analysisPageSource, /LabImportConfidenceExplainer/, "a tela real deve renderizar o explainer do laudo quando houver score");
assert.match(importsRepositorySource, /a\.confidence_score AS "confidenceScore"/, "a autoridade da nota deve ser a mesma armazenada em analyses");
assert.match(importsRepositorySource, /reconstructionMatchesStoredScore/, "decomposição histórica deve permanecer fail-closed");

