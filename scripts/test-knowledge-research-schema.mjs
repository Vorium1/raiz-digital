import assert from "node:assert/strict";
import { validateKnowledgeResearchSources } from "../src/lib/ai/knowledge-research-schema.ts";

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

console.log("knowledge-research-schema: 9 cenários aprovados");
