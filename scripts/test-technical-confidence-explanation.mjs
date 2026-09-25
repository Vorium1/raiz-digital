import assert from "node:assert/strict";
import { buildTechnicalConfidenceExplanation } from "../src/domain/technical-confidence-explanation.ts";

const explanation = buildTechnicalConfidenceExplanation(
  {
    score: 82,
    level: "ADEQUATE",
    dimensions: [
      { key: "completeness", label: "Completude", score: 80, weight: 0.5 },
      { key: "context", label: "Contexto agronômico", score: 100, weight: 0.3 },
      { key: "ruleCompatibility", label: "Compatibilidade de regra", score: 60, weight: 0.2 },
    ],
  },
  [
    { parameterCode: "P", interpretable: true, classificationRole: "TARGET" },
    { parameterCode: "K", interpretable: false, classificationRole: "TARGET", code: "DEPTH_UNKNOWN", reason: "Profundidade ausente." },
    { parameterCode: "CLAY", interpretable: false, classificationRole: "AUXILIARY", code: "NOT_CLASSIFICATION_TARGET", reason: "Auxiliar." },
  ],
);

assert.equal(explanation.score, 82);
assert.equal(explanation.levelLabel, "Adequada");
assert.equal(explanation.dimensions[0].contribution, 40);
assert.equal(explanation.dimensions[1].contribution, 30);
assert.equal(explanation.dimensions[2].contribution, 12);
assert.deepEqual(explanation.coverage, { classifiedTargets: 1, pendingTargets: 1, totalTargets: 2, auxiliaryResults: 1 });
assert.equal(explanation.limitations.length, 1, "dado auxiliar nunca pode virar limitação");
assert.equal(explanation.limitations[0].parameterCode, "K");
assert.match(explanation.limitations[0].requiredAction, /profundidade real/i);
assert.match(explanation.caveat, /não recebem peso numérico/i);
assert.ok(!explanation.limitations.some((item) => item.parameterCode === "CLAY"));

const complete = buildTechnicalConfidenceExplanation(
  {
    score: 100,
    level: "HIGH",
    dimensions: [
      { key: "completeness", label: "Completude", score: 100, weight: 0.5 },
      { key: "context", label: "Contexto agronômico", score: 100, weight: 0.3 },
      { key: "ruleCompatibility", label: "Compatibilidade de regra", score: 100, weight: 0.2 },
    ],
  },
  [{ parameterCode: "P", interpretable: true, classificationRole: "TARGET" }],
);
assert.equal(complete.limitations.length, 0);
assert.ok(complete.strengths.some((item) => /Cobertura: 1\/1/.test(item)));

console.log("technical confidence explanation: ok");
