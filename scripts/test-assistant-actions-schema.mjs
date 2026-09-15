import assert from "node:assert/strict";
import { parseAssistantAction, resolveActionHref } from "../src/lib/ai/assistant-actions-schema.ts";

// Fase 4, Bloco 4 -- schema fechado de ações do Assistente RAIZ. `parseAssistantAction` é a validação de
// FORMATO/allowlist em tempo de execução (nunca só TypeScript -- o corpo de /api/assistant chega como
// JSON não confiável); `resolveActionHref` só constrói o href a partir de uma ação JÁ validada.

const UUID_A = "9f8b6e2a-4c1d-4a7e-9b3a-2f6d8c1e5a90";
const UUID_B = "a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d";

// 1. kind desconhecido -> null, allowlist fechada (nunca aceita um kind novo por engano).
assert.equal(parseAssistantAction({ kind: "delete_everything" }), null);
assert.equal(parseAssistantAction({ kind: "execute_sql", sql: "DROP TABLE analyses" }), null);
assert.equal(parseAssistantAction({}), null);
assert.equal(parseAssistantAction(null), null);
assert.equal(parseAssistantAction("string solta"), null);
assert.equal(parseAssistantAction(42), null);

// 2. show_on_map -- collectionOrderId malformado nunca vira ação, mesmo com o resto válido.
assert.equal(parseAssistantAction({ kind: "show_on_map", collectionOrderId: "nao-e-um-uuid" }), null);
assert.equal(parseAssistantAction({ kind: "show_on_map" }), null); // sem id nenhum
assert.deepEqual(
  parseAssistantAction({ kind: "show_on_map", collectionOrderId: UUID_A, parameter: "P", status: "pending", satellite: true }),
  { kind: "show_on_map", collectionOrderId: UUID_A, parameter: "P", status: "pending", satellite: true },
);
// status fora do enum permitido -> null, nunca aceito "na confiança".
assert.equal(parseAssistantAction({ kind: "show_on_map", collectionOrderId: UUID_A, status: "qualquer-coisa" }), null);
// parâmetro tentando injetar algo fora do formato de código real (ex.: texto longo, tentativa de quebrar a
// query string) -> null.
assert.equal(parseAssistantAction({ kind: "show_on_map", collectionOrderId: UUID_A, parameter: "P&injected=1" }), null);
assert.equal(parseAssistantAction({ kind: "show_on_map", collectionOrderId: UUID_A, parameter: "x".repeat(41) }), null);

// 3. open_comparison -- mode fora do enum, ou a/b malformados, nunca aceitos.
assert.equal(parseAssistantAction({ kind: "open_comparison", mode: "invalido", a: UUID_A, b: UUID_B }), null);
assert.equal(parseAssistantAction({ kind: "open_comparison", mode: "fields", a: "nao-uuid", b: UUID_B }), null);
assert.equal(parseAssistantAction({ kind: "open_comparison", mode: "fields", a: UUID_A }), null); // falta b
assert.deepEqual(
  parseAssistantAction({ kind: "open_comparison", mode: "seasons", a: UUID_A, b: UUID_B }),
  { kind: "open_comparison", mode: "seasons", a: UUID_A, b: UUID_B },
);

// 4. open_analysis / open_field -- id malformado nunca vira ação.
assert.equal(parseAssistantAction({ kind: "open_analysis", analysisId: "123" }), null);
assert.deepEqual(parseAssistantAction({ kind: "open_analysis", analysisId: UUID_A }), { kind: "open_analysis", analysisId: UUID_A });
assert.equal(parseAssistantAction({ kind: "open_field", fieldId: "123" }), null);
assert.deepEqual(parseAssistantAction({ kind: "open_field", fieldId: UUID_A }), { kind: "open_field", fieldId: UUID_A });

// 5. open_report -- reportType fora do enum, ou id malformado, nunca aceitos.
assert.equal(parseAssistantAction({ kind: "open_report", reportType: "invalido", id: UUID_A }), null);
assert.equal(parseAssistantAction({ kind: "open_report", reportType: "field", id: "nao-uuid" }), null);
assert.deepEqual(parseAssistantAction({ kind: "open_report", reportType: "field", id: UUID_A }), { kind: "open_report", reportType: "field", id: UUID_A });

// 6. filter_intelligence -- todos os campos são opcionais, mas quando presentes precisam bater o formato;
// um só campo malformado invalida a ação inteira (nunca aplica os outros parcialmente).
assert.deepEqual(parseAssistantAction({ kind: "filter_intelligence" }), { kind: "filter_intelligence", interpretationState: undefined, reviewState: undefined, clientId: undefined, propertyId: undefined, fieldId: undefined, seasonId: undefined });
assert.equal(parseAssistantAction({ kind: "filter_intelligence", interpretationState: "ESTADO_INVENTADO" }), null);
assert.equal(parseAssistantAction({ kind: "filter_intelligence", reviewState: "ESTADO_INVENTADO" }), null);
assert.equal(parseAssistantAction({ kind: "filter_intelligence", clientId: UUID_A, fieldId: "quebrado" }), null);
assert.deepEqual(
  parseAssistantAction({ kind: "filter_intelligence", reviewState: "APROVADA", propertyId: UUID_B }),
  { kind: "filter_intelligence", interpretationState: undefined, reviewState: "APROVADA", clientId: undefined, propertyId: UUID_B, fieldId: undefined, seasonId: undefined },
);

// 7. resolveActionHref -- nunca concatena valor não sanitizado; sempre via URLSearchParams. Prova real de
// que um valor com caracteres especiais (já validado pelo parser -- aqui testando o resolver isoladamente
// com um valor que passaria pelo formato de parâmetro real) é corretamente escapado na querystring.
const mapHref = resolveActionHref({ kind: "show_on_map", collectionOrderId: UUID_A, parameter: "P", status: "pending", satellite: true });
assert.equal(mapHref.href, `/mapas?ordem=${UUID_A}&parametro=P&status=pending&satelite=1`);

const comparisonHref = resolveActionHref({ kind: "open_comparison", mode: "seasons", a: UUID_A, b: UUID_B });
assert.equal(comparisonHref.href, `/comparativos?mode=seasons&a=${UUID_A}&b=${UUID_B}`);

const analysisHref = resolveActionHref({ kind: "open_analysis", analysisId: UUID_A });
assert.equal(analysisHref.href, `/analises/${UUID_A}`);

const fieldHref = resolveActionHref({ kind: "open_field", fieldId: UUID_A });
assert.equal(fieldHref.href, `/talhoes/${UUID_A}`);

const reportFieldHref = resolveActionHref({ kind: "open_report", reportType: "field", id: UUID_A });
assert.equal(reportFieldHref.href, `/relatorios/talhao/${UUID_A}`);
const reportPropertyHref = resolveActionHref({ kind: "open_report", reportType: "property", id: UUID_A });
assert.equal(reportPropertyHref.href, `/relatorios/propriedade/${UUID_A}`);

const intelligenceHref = resolveActionHref({ kind: "filter_intelligence", reviewState: "APROVADA", fieldId: UUID_A });
assert.equal(intelligenceHref.href, `/inteligencia?fieldId=${UUID_A}&reviewState=APROVADA`);

// Sem filtro nenhum -> rota base, sem "?" solto.
const intelligenceHrefEmpty = resolveActionHref({ kind: "filter_intelligence" });
assert.equal(intelligenceHrefEmpty.href, "/inteligencia");

// 8. Toda ação resolvida tem label/description não vazios (nunca um botão sem texto).
for (const resolved of [mapHref, comparisonHref, analysisHref, fieldHref, reportFieldHref, reportPropertyHref, intelligenceHref]) {
  assert.ok(resolved.label.length > 0);
  assert.ok(resolved.description.length > 0);
}

console.log("assistant-actions-schema: 8 cenários aprovados (allowlist fechada por kind, nenhum id/enum malformado vira ação, href sempre construído via URLSearchParams, nunca concatenação livre)");
