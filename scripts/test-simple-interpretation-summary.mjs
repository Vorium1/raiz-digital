import assert from "node:assert/strict";
import { summarizeSimpleInterpretation } from "../src/domain/simple-interpretation-summary.ts";

const uniform = summarizeSimpleInterpretation([
  { sampleCode: "P1", parameterCode: "P", interpretable: true, classification: "LOW", classificationRole: "TARGET" },
  { sampleCode: "P2", parameterCode: "P", interpretable: true, classification: "LOW", classificationRole: "TARGET" },
  { sampleCode: "P3", parameterCode: "P", interpretable: true, classification: "LOW", classificationRole: "TARGET" },
  { sampleCode: "P4", parameterCode: "P", interpretable: true, classification: "LOW", classificationRole: "TARGET" },
]);
assert.equal(uniform.length, 1);
assert.equal(uniform[0].uniformClassification, "LOW");
assert.equal(uniform[0].predominantClassification, "LOW");
assert.equal(uniform[0].predominantCount, 4);

const majority = summarizeSimpleInterpretation([
  ...Array.from({ length: 5 }, (_, index) => ({ sampleCode: `M${index + 1}`, parameterCode: "K", interpretable: true, classification: "MEDIUM", classificationRole: "TARGET" })),
  ...Array.from({ length: 3 }, (_, index) => ({ sampleCode: `L${index + 1}`, parameterCode: "K", interpretable: true, classification: "LOW", classificationRole: "TARGET" })),
]);
assert.equal(majority[0].uniformClassification, null);
assert.equal(majority[0].predominantClassification, "MEDIUM");
assert.equal(majority[0].predominantCount, 5);
assert.deepEqual(majority[0].classificationCounts, [
  { classification: "MEDIUM", count: 5 },
  { classification: "LOW", count: 3 },
]);

const tied = summarizeSimpleInterpretation([
  ...Array.from({ length: 4 }, (_, index) => ({ sampleCode: `A${index + 1}`, parameterCode: "MO", interpretable: true, classification: "MEDIUM", classificationRole: "TARGET" })),
  ...Array.from({ length: 4 }, (_, index) => ({ sampleCode: `B${index + 1}`, parameterCode: "MO", interpretable: true, classification: "HIGH", classificationRole: "TARGET" })),
]);
assert.equal(tied[0].uniformClassification, null);
assert.equal(tied[0].predominantClassification, null);
assert.equal(tied[0].totalCount, 8);

const auxiliaryIgnored = summarizeSimpleInterpretation([
  { sampleCode: "P1", parameterCode: "PH", interpretable: true, classification: "MEDIUM", classificationRole: "AUXILIARY" },
  { sampleCode: "P1", parameterCode: "ZN", interpretable: false, classificationRole: "TARGET" },
]);
assert.equal(auxiliaryIgnored.length, 0);

console.log("simple-interpretation-summary: resumo por parâmetro sem média/interpolação protegido");
