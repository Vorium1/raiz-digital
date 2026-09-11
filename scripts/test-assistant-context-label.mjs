import assert from "node:assert/strict";
import { deriveContextLabel } from "../src/lib/ai/assistant-context-label.ts";

// Fase 4, Bloco 5 -- rótulo contextual do painel do Assistente. Sempre derivado do Evidence Package JÁ
// resolvido/validado -- nunca do que o client afirma. `found: false` (entidade não encontrada/outro
// tenant) e `kind: "invalid"` (contexto malformado) sempre devolvem `null` -- o painel mostra "Contexto
// indisponível" nesses dois casos, nunca inventa um rótulo.

// 1. Dashboard.
assert.equal(deriveContextLabel({ found: true, kind: "dashboard", evidence: {}, entityIds: {} }), "Central de Decisão");

// 2. Talhão -- nome do talhão + propriedade, dados reais do Evidence Package.
assert.equal(
  deriveContextLabel({ found: true, kind: "field", evidence: { field: { name: "Talhão 04", propertyName: "Fazenda Cabeda" } }, entityIds: {} }),
  "Talhão 04 · Fazenda Cabeda",
);

// 3. Propriedade / relatório de propriedade -- mesmo rótulo, dois contextos diferentes.
assert.equal(deriveContextLabel({ found: true, kind: "property", evidence: { property: { name: "Fazenda Cabeda" } }, entityIds: {} }), "Fazenda Cabeda");
assert.equal(deriveContextLabel({ found: true, kind: "report-property", evidence: { property: { name: "Fazenda Cabeda" } }, entityIds: {} }), "Fazenda Cabeda");

// 4. Análise -- código real, nunca um id cru.
assert.equal(deriveContextLabel({ found: true, kind: "analysis", evidence: { analysis: { code: "AN-2026-014" } }, entityIds: {} }), "Análise AN-2026-014");

// 5. Relatório por talhão.
assert.equal(deriveContextLabel({ found: true, kind: "report-field", evidence: { analysis: { fieldName: "Talhão 04" } }, entityIds: {} }), "Relatório · Talhão 04");

// 6. Comparativo -- só mostra os dois lados quando já está "ready" (calculado); antes disso, rótulo
// genérico honesto (nunca "Comparativo · undefined × undefined").
assert.equal(
  deriveContextLabel({ found: true, kind: "comparison", evidence: { ready: true, labelA: "Talhão 04", labelB: "Talhão 07" }, entityIds: {} }),
  "Comparativo · Talhão 04 × Talhão 07",
);
assert.equal(deriveContextLabel({ found: true, kind: "comparison", evidence: { ready: false, mode: null }, entityIds: {} }), "Comparativos");

// 7. Inteligência.
assert.equal(deriveContextLabel({ found: true, kind: "intelligence", evidence: {}, entityIds: {} }), "Inteligência Agronômica");

// 8. Mapa -- com talhão delegado vs. sem nenhuma seleção (dashboard).
assert.equal(
  deriveContextLabel({ found: true, kind: "map", evidence: { delegatedTo: "field", field: { field: { name: "Talhão 04" } } }, entityIds: {} }),
  "Mapa · Talhão 04",
);
assert.equal(deriveContextLabel({ found: true, kind: "map", evidence: { delegatedTo: "dashboard", dashboard: {} }, entityIds: {} }), "Mapa");

// 9. `found: false` (entidade não encontrada/outro tenant) -> null, sempre, pra qualquer kind.
assert.equal(deriveContextLabel({ found: false, kind: "field", entityIds: {} }), null);
assert.equal(deriveContextLabel({ found: false, kind: "analysis", entityIds: {} }), null);
assert.equal(deriveContextLabel({ found: false, kind: "property", entityIds: {} }), null);

// 10. Contexto explicitamente inválido -> null (o painel mostra "Contexto indisponível").
assert.equal(deriveContextLabel({ found: false, kind: "invalid", entityIds: {} }), null);

console.log("assistant-context-label: 10 cenários aprovados (rótulo sempre derivado do Evidence Package real; found:false e contexto inválido nunca viram um rótulo inventado)");
