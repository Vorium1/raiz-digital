import assert from "node:assert/strict";
import { validateAgronomicPrescription } from "../src/lib/ai/agronomic-prescription-schema.ts";

const valid = {
  summary: "Diagnóstico real da área.",
  diagnosis: [{ parameterCode: "PH", value: 5.4, unit: "índice", interpretation: "Levemente ácido", rationale: "Abaixo da faixa ideal para soja." }],
  recommendations: [{ inputType: "Calcário dolomítico", quantity: 2.5, unit: "t/ha", rationale: "Corrigir acidez para o teto produtivo informado." }],
  managementPractices: ["Escarificação antes da semeadura."],
  missingInformation: [],
  sources: [{ title: "CQFS RS/SC", institution: "CQFS", url: null }],
};
assert.deepEqual(validateAgronomicPrescription(valid), valid);

// nulo / não-objeto
assert.equal(validateAgronomicPrescription(null), null);
assert.equal(validateAgronomicPrescription("texto livre"), null);

// summary ausente ou vazio
assert.equal(validateAgronomicPrescription({ ...valid, summary: "" }), null);
const { summary, ...missingSummary } = valid;
assert.equal(validateAgronomicPrescription(missingSummary), null);

// diagnosis: não-array, ou item incompleto
assert.equal(validateAgronomicPrescription({ ...valid, diagnosis: "não é array" }), null);
assert.equal(validateAgronomicPrescription({ ...valid, diagnosis: [{ parameterCode: "PH" }] }), null);
assert.equal(validateAgronomicPrescription({ ...valid, diagnosis: [{ ...valid.diagnosis[0], value: "5.4" }] }), null);

// recommendations: quantidade zero ou negativa nunca passa (regra de negócio: nunca uma dose sem sentido)
assert.equal(validateAgronomicPrescription({ ...valid, recommendations: [{ ...valid.recommendations[0], quantity: 0 }] }), null);
assert.equal(validateAgronomicPrescription({ ...valid, recommendations: [{ ...valid.recommendations[0], quantity: -1 }] }), null);
assert.equal(validateAgronomicPrescription({ ...valid, recommendations: [{ inputType: "Calcário" }] }), null);

// managementPractices/missingInformation precisam ser array de string
assert.equal(validateAgronomicPrescription({ ...valid, managementPractices: [1, 2] }), null);
assert.equal(validateAgronomicPrescription({ ...valid, missingInformation: "não é array" }), null);

// sources: título obrigatório, institution/url aceitam null
assert.equal(validateAgronomicPrescription({ ...valid, sources: [{ institution: "CQFS", url: null }] }), null);
assert.deepEqual(validateAgronomicPrescription({ ...valid, sources: [{ title: "Fonte", institution: null, url: null }] }).sources, [{ title: "Fonte", institution: null, url: null }]);

console.log("agronomic-prescription-schema: 13 cenários aprovados");
