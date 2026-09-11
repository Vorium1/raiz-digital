import assert from "node:assert/strict";
import { computeRequiresProfessionalReview, describeNdviFieldCoexistence } from "../src/lib/ai/assistant-response-schema.ts";

// Fase 4A, Bloco 3 -- regra explícita (não heurística textual) de quando a resposta do Assistente RAIZ
// exige revisão profissional, e a correção do diretor sobre NDVI não ter geometria espacial suficiente
// (Correção 1 da arquitetura revisada).

// 1. Resposta puramente operacional/factual (sem hipótese) -> revisão NÃO necessária.
assert.equal(computeRequiresProfessionalReview({ hypotheses: [] }), false);

// 2. Qualquer hipótese agronômica -> revisão necessária, sempre, mesmo com uma só.
assert.equal(computeRequiresProfessionalReview({ hypotheses: [{ statement: "x", supportingEvidence: [], missingToConfirm: [] }] }), true);
assert.equal(
  computeRequiresProfessionalReview({ hypotheses: [
    { statement: "a", supportingEvidence: [], missingToConfirm: [] },
    { statement: "b", supportingEvidence: [], missingToConfirm: [] },
  ] }),
  true,
);

// 3. Sem NDVI e sem pontos baixos -> nenhuma nota (nada a dizer).
assert.equal(describeNdviFieldCoexistence({ hasNdviData: false, hasLowParameterPoints: false }), null);
assert.equal(describeNdviFieldCoexistence({ hasNdviData: true, hasLowParameterPoints: false }), null);
assert.equal(describeNdviFieldCoexistence({ hasNdviData: false, hasLowParameterPoints: true }), null);

// 4. Achado real do diretor: NDVI agregado por talhão inteiro (sem geometria/raster/polígono de zona)
// NUNCA pode virar afirmação de coincidência espacial confirmada -- só coexistência no mesmo talhão, com
// a limitação declarada explicitamente em `missing_information`.
const note = describeNdviFieldCoexistence({ hasNdviData: true, hasLowParameterPoints: true, parameterCode: "P" });
assert.notEqual(note, null);
assert.match(note.note, /coexistem no mesmo talhão/i);
assert.match(note.missingInformation, /georreferenciada/i);
// A prova mais direta: os dois textos SEMPRE negam a coincidência espacial ou declaram a lacuna -- nunca
// afirmam causalidade, e a única aparição da frase "coincidência espacial" em cada texto vem logo depois
// de uma negação real ("NÃO é..."/"Não é possível afirmar...").
assert.match(note.note, /NÃO é uma coincidência espacial confirmada/i);
assert.match(note.missingInformation, /Não é possível afirmar coincidência espacial/i);
for (const text of [note.note, note.missingInformation]) {
  assert.doesNotMatch(text, /a região de menor vigor coincide/i);
  assert.doesNotMatch(text, /causou/i);
}

// 5. Sem parâmetro informado, a nota continua honesta (não inventa qual parâmetro).
const noteWithoutParam = describeNdviFieldCoexistence({ hasNdviData: true, hasLowParameterPoints: true });
assert.match(noteWithoutParam.note, /pontos classificados como baixos/i);
assert.doesNotMatch(noteWithoutParam.note, /para undefined/i);

console.log("assistant-response-schema: 5 cenários aprovados (revisão profissional é regra de código, nunca do provider; NDVI agregado nunca produz afirmação de coincidência espacial)");
