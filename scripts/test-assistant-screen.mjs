import assert from "node:assert/strict";
import { inferScreenContext, inferScreenState } from "../src/lib/ai/assistant-screen.ts";

// Fase 4A, Bloco 1 -- resolução de rota/contexto e estado de tela do Assistente RAIZ. Cobre exatamente as
// rotas reais do app (nenhuma inventada) e prova a separação real entre ScreenContext (qual entidade) e
// ScreenState (filtro/seleção visível), correção pedida pelo diretor na revisão da arquitetura.

const UUID_A = "11111111-1111-1111-1111-111111111111";
// UUID válido (versão 4, variante 10xx) -- necessário pra bater no regex real usado em produção
// (`field-overview.ts`/`assistant-screen.ts`), não um id qualquer de 36 caracteres.
const REAL_UUID = "9f8b6e2a-4c1d-4a7e-9b3a-2f6d8c1e5a90";

function searchParams(entries) {
  const map = new Map(Object.entries(entries));
  return { get: (key) => (map.has(key) ? map.get(key) : null) };
}

// 1. Dashboard.
assert.deepEqual(inferScreenContext("/dashboard"), { type: "dashboard" });
assert.deepEqual(inferScreenContext("/dashboard/"), { type: "dashboard" });

// 2. Análise -- exige uuid real, id malformado nunca vira contexto de análise.
assert.deepEqual(inferScreenContext(`/analises/${REAL_UUID}`), { type: "analysis", id: REAL_UUID });
assert.equal(inferScreenContext("/analises/nao-e-um-uuid"), undefined);
assert.equal(inferScreenContext("/analises/nova"), undefined);

// 3. Talhão.
assert.deepEqual(inferScreenContext(`/talhoes/${REAL_UUID}`), { type: "field", id: REAL_UUID });

// 4. Relatório por talhão / por propriedade.
assert.deepEqual(inferScreenContext(`/relatorios/talhao/${REAL_UUID}`), { type: "report-field", id: REAL_UUID });
assert.deepEqual(inferScreenContext(`/relatorios/propriedade/${REAL_UUID}`), { type: "report-property", id: REAL_UUID });

// 5. Mapas / comparativos / inteligência -- telas sem entidade única (o "qual" é resolvido pelo ScreenState).
assert.deepEqual(inferScreenContext("/mapas"), { type: "map" });
assert.deepEqual(inferScreenContext("/comparativos"), { type: "comparison" });
assert.deepEqual(inferScreenContext("/inteligencia"), { type: "intelligence" });

// 6. Rotas sem inferência automática hoje (honesto: não existe página própria de propriedade, por
// exemplo) -- devolve undefined, nunca um contexto forjado.
assert.equal(inferScreenContext("/clientes"), undefined);
assert.equal(inferScreenContext("/coletas"), undefined);
assert.equal(inferScreenContext("/relatorios/evolucao/" + REAL_UUID), undefined);
assert.equal(inferScreenContext("/"), undefined);

// 7. Case-insensitive no uuid (URLs reais podem vir em maiúsculas por engano de cópia) -- normaliza pra
// minúsculo, nunca guarda o id com caixa inconsistente.
assert.deepEqual(inferScreenContext(`/talhoes/${REAL_UUID.toUpperCase()}`), { type: "field", id: REAL_UUID });

// 8. ScreenState do mapa -- exatamente os mesmos nomes de query param que agronomic-map-explorer.tsx já lê.
assert.deepEqual(
  inferScreenState("/mapas", searchParams({ ordem: "abc", parametro: "P", status: "pending", satelite: "1" })),
  { screen: "map", collectionOrderId: "abc", parameter: "P", status: "pending", satellite: true },
);
assert.deepEqual(inferScreenState("/mapas", searchParams({})), { screen: "map", collectionOrderId: undefined, parameter: undefined, status: undefined, satellite: false });

// 9. ScreenState do comparativo -- só A escolhido (B ainda não), cenário real de pré-seleção via URL.
assert.deepEqual(
  inferScreenState("/comparativos", searchParams({ mode: "fields", a: UUID_A })),
  { screen: "comparison", mode: "fields", a: UUID_A, b: undefined },
);
// modo inválido nunca é aceito como se fosse um dos 4 reais.
assert.equal(inferScreenState("/comparativos", searchParams({ mode: "invalido" })).mode, undefined);

// 10. ScreenState da inteligência.
assert.deepEqual(
  inferScreenState("/inteligencia", searchParams({ clientId: "c1", fieldId: "f1" })),
  { screen: "intelligence", clientId: "c1", propertyId: undefined, fieldId: "f1", seasonId: undefined, interpretationState: undefined, reviewState: undefined },
);

// 11. Tela sem ScreenState definido (ex.: dashboard) -> undefined, nunca um objeto vazio inventado.
assert.equal(inferScreenState("/dashboard", searchParams({})), undefined);

console.log("assistant-screen: 11 cenários aprovados (ScreenContext cobre as 9 rotas reais; ScreenState lê os MESMOS query params já usados pelas telas; nenhum id malformado vira contexto)");
