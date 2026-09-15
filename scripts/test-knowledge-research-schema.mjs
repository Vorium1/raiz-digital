import assert from "node:assert/strict";
import { validateKnowledgeResearchSources } from "../src/lib/ai/knowledge-research-schema.ts";
import "./test-agronomic-evidence-transferability.mjs";
import "./test-gypsum-response-diagnostic.mjs";
import "./test-carinata-global-evidence.mjs";
import "./test-rice-potassium-sosbai-2025.mjs";

const valid = [
  { title: "Manual de Calagem e Adubação RS/SC", institution: "CQFS RS/SC", editionYear: 2016, subject: "Fósforo", content: "Resumo técnico completo sobre faixas de fósforo por classe de solo.", regionCode: "RS-PLANALTO" },
];
assert.deepEqual(validateKnowledgeResearchSources(valid), valid);

// não-array
assert.equal(validateKnowledgeResearchSources(null), null);
assert.equal(validateKnowledgeResearchSources("texto livre"), null);
assert.equal(validateKnowledgeResearchSources({}), null);

// array vazio é válido (pesquisa pode não achar nada confiável para uma cultura)
assert.deepEqual(validateKnowledgeResearchSources([]), []);

// item sem title/subject/content é rejeitado
assert.equal(validateKnowledgeResearchSources([{ institution: "CQFS", editionYear: 2016, subject: "Fósforo", content: "texto", regionCode: null }]), null);
assert.equal(validateKnowledgeResearchSources([{ ...valid[0], subject: "" }]), null);
assert.equal(validateKnowledgeResearchSources([{ ...valid[0], content: "" }]), null);

// institution/editionYear/regionCode nulos são aceitos (nem toda fonte tem edição/região)
assert.deepEqual(validateKnowledgeResearchSources([{ title: "Fonte", institution: null, editionYear: null, subject: "Assunto", content: "Conteúdo", regionCode: null }]), [
  { title: "Fonte", institution: null, editionYear: null, subject: "Assunto", content: "Conteúdo", regionCode: null },
]);

// editionYear não-numérico vira null em vez de rejeitar o item inteiro (campo secundário)
assert.deepEqual(validateKnowledgeResearchSources([{ ...valid[0], editionYear: "2016" }])[0].editionYear, null);

const structured = [{
  ...valid[0],
  evidenceType: "CONTROLLED_FIELD_TRIAL",
  evidenceStrength: "EXPERIMENTAL",
  contextProfile: {
    constraints: {
      crop: { kind: "CATEGORICAL", allowed: ["SOJA"] },
      clayPct: { kind: "NUMERIC_RANGE", min: 45, max: 80, unit: "%" },
    },
    optionalDimensions: ["region"],
  },
  criticalDimensions: ["crop", "clayPct"],
  requiresLocalCalibration: true,
  requiresAgronomistReview: true,
  quantitativeUseStatus: "REVIEW_ONLY",
  quantitativeApplicabilityApproved: false,
  homologatedRuleId: null,
  sourceLocator: "Tabela 3, p. 18",
  sourceUrl: "https://example.org/primary-source",
  doi: "10.0000/example",
  studyDesign: "Ensaio de campo randomizado",
  peerReviewed: true,
}];
const validatedStructured = validateKnowledgeResearchSources(structured);
assert.ok(validatedStructured);
assert.equal(validatedStructured[0].evidenceType, "CONTROLLED_FIELD_TRIAL");
assert.deepEqual(validatedStructured[0].criticalDimensions, ["crop", "clayPct"]);
assert.equal(validatedStructured[0].quantitativeUseStatus, "REVIEW_ONLY");

assert.equal(validateKnowledgeResearchSources([{ ...structured[0], evidenceType: "BLOG_POST" }]), null);
assert.equal(validateKnowledgeResearchSources([{ ...structured[0], contextProfile: [] }]), null);
assert.equal(validateKnowledgeResearchSources([{ ...structured[0], criticalDimensions: ["crop", ""] }]), null);
assert.equal(validateKnowledgeResearchSources([{ ...structured[0], peerReviewed: "sim" }]), null);

// Pesquisa não homologa dose. A promoção quantitativa precisa acontecer em curadoria separada.
assert.equal(validateKnowledgeResearchSources([{
  ...structured[0],
  quantitativeUseStatus: "HOMOLOGATED_DETERMINISTIC",
  quantitativeApplicabilityApproved: true,
  homologatedRuleId: "RULE-TEST",
}]), null);

console.log("knowledge-research-schema: compatibilidade legada + metadados científicos aprovados");
