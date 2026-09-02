import assert from "node:assert/strict";
import { validateAgronomicNarrative } from "../src/lib/ai/agronomic-narrative-schema.ts";

const valid = {
  summary: "Resumo real",
  observations: ["a"],
  trends: [],
  attentionPoints: ["b"],
  missingInformation: [],
  technicalReferences: [],
  requiresProfessionalReview: true,
};
assert.deepEqual(validateAgronomicNarrative(valid), valid);

assert.equal(validateAgronomicNarrative(null), null);
assert.equal(validateAgronomicNarrative("texto livre"), null);
assert.equal(validateAgronomicNarrative({ ...valid, summary: "" }), null);
assert.equal(validateAgronomicNarrative({ ...valid, observations: "não é array" }), null);
assert.equal(validateAgronomicNarrative({ ...valid, requiresProfessionalReview: "true" }), null);
const { summary, ...missingSummary } = valid;
assert.equal(validateAgronomicNarrative(missingSummary), null);

console.log("agronomic-narrative-schema: 7 cenários aprovados");
