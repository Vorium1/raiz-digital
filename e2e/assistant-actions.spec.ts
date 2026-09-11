import { test, expect, type Page } from "@playwright/test";
import { Client } from "pg";

// Fase 4, Bloco 4 -- schema fechado de ações do Assistente RAIZ (`AssistantAction -> validateAssistantAction
// -> ResolvedAssistantAction`). A validação de FORMATO/allowlist (kind desconhecido, enum fora do
// permitido, uuid malformado) já é coberta exaustivamente por scripts/test-assistant-actions-schema.mjs (8
// cenários puros, sem banco). Este arquivo prova a integração real: o provedor só sugere ações que
// correspondem a funcionalidades que já existem, o servidor revalida posse/tenant no banco antes de
// resolver um `href`, e o `href` final aponta exatamente pra rota esperada.
//
// Nota sobre cobertura: não existe hoje nenhum caminho legítimo (sem LLM conectado) pelo qual o provedor
// local sugira uma ação referenciando uma entidade de outro tenant -- todo `AssistantAction` que ele monta
// usa um id que já veio de um Evidence Package tenant-escopado (Bloco 2) ou não é anexado (ramo de
// ausência). `verifyOwnership` (src/lib/ai/assistant-actions.ts) usa o MESMO padrão
// `WHERE tenant_id = $1::uuid AND id = $2::uuid` já provado seguro em dezenas de outros testes de
// isolamento desta base (tenant-isolation.spec.ts, field-overview-and-priorities.spec.ts, e os testes de
// isolamento do próprio assistente em assistant-fase4a.spec.ts) -- não é um mecanismo novo e não testado.
function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} precisa estar definida para rodar os testes e2e (ver e2e/README.md).`);
  return value;
}

const TENANT_A_EMAIL = "admin@raiz.local";
const TENANT_A_PASSWORD = requiredEnv("E2E_ADMIN_PASSWORD");
const FIELD_TECH_EMAIL = "rbac-field-tech@raiz.local";
const FIELD_TECH_PASSWORD = requiredEnv("E2E_RBAC_FIELD_TECH_PASSWORD");

async function login(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await Promise.all([page.waitForURL(/dashboard/, { timeout: 15_000 }), page.click(".login-submit")]);
}

async function askAssistant(page: Page, question: string, screenContext?: unknown, extraBody: Record<string, unknown> = {}) {
  return page.evaluate(
    async ({ question, screenContext, extraBody }) => {
      const res = await fetch("/api/assistant", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ question, screenContext, ...extraBody }) });
      const text = await res.text();
      let json: any = null;
      try { json = JSON.parse(text); } catch { /* corpo não é JSON -- deixado null de propósito */ }
      return { status: res.status, text, json };
    },
    { question, screenContext, extraBody },
  );
}

test("Assistente: comparar safras de um talhão real resolve suggested_actions com href EXATO pra /comparativos (Bloco 4)", async ({ page }) => {
  test.skip(!process.env.DATABASE_URL, "precisa de DATABASE_URL no ambiente pra este teste.");
  if (!process.env.DATABASE_URL) return;

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const row = await client.query(
      `SELECT f.id::text AS "fieldId",
              (SELECT id::text FROM crop_seasons WHERE tenant_id = f.tenant_id AND field_id = f.id ORDER BY created_at DESC LIMIT 1) AS "latestSeasonId",
              (SELECT id::text FROM crop_seasons WHERE tenant_id = f.tenant_id AND field_id = f.id ORDER BY created_at DESC OFFSET 1 LIMIT 1) AS "previousSeasonId"
       FROM fields f
       WHERE f.tenant_id = (SELECT tenant_id FROM tenant_members tm JOIN users u ON u.id = tm.user_id WHERE u.email = $1 LIMIT 1)
         AND (SELECT count(*) FROM crop_seasons cs WHERE cs.tenant_id = f.tenant_id AND cs.field_id = f.id) >= 2
       LIMIT 1`,
      [TENANT_A_EMAIL],
    );
    const field = row.rows[0];
    test.skip(!field, "precisa de 1 talhão real com pelo menos 2 safras no tenant A.");
    if (!field) return;

    await login(page, TENANT_A_EMAIL, TENANT_A_PASSWORD);
    const result = await askAssistant(page, "compare esta safra com a anterior", { type: "field", id: field.fieldId });
    expect(result.status).toBe(200);

    const action = result.json.suggested_actions.find((a: any) => a.kind === "open_comparison");
    expect(action, `nenhuma ação open_comparison na resposta: ${JSON.stringify(result.json.suggested_actions)}`).toBeTruthy();
    // href EXATO -- prova que o resolvedor usa URLSearchParams com os ids reais, nunca um valor inventado.
    const expectedHref = `/comparativos?mode=seasons&a=${field.latestSeasonId}&b=${field.previousSeasonId}`;
    expect(action.href).toBe(expectedHref);
    expect(action.label.length).toBeGreaterThan(0);
    expect(action.description.length).toBeGreaterThan(0);
  } finally {
    await client.end();
  }
});

test("Assistente: resumo de uma propriedade real resolve suggested_actions com href EXATO pro relatório da propriedade (Bloco 4)", async ({ page }) => {
  await login(page, TENANT_A_EMAIL, TENANT_A_PASSWORD);
  const contextA = await page.evaluate(async () => (await fetch("/api/context")).json());
  const propertyA = contextA.properties?.[0];
  test.skip(!propertyA, "precisa de 1 propriedade real no tenant A.");
  if (!propertyA) return;

  const result = await askAssistant(page, "faça um resumo da situação", { type: "property", id: propertyA.id });
  expect(result.status).toBe(200);

  const action = result.json.suggested_actions.find((a: any) => a.kind === "open_report");
  expect(action).toBeTruthy();
  expect(action.href).toBe(`/relatorios/propriedade/${propertyA.id}`);
});

test("Assistente: dentro de uma análise real, suggested_actions sempre oferece 'ver talhão' com href EXATO pro Talhão 360° (Bloco 4)", async ({ page }) => {
  test.skip(!process.env.DATABASE_URL, "precisa de DATABASE_URL no ambiente pra este teste.");
  if (!process.env.DATABASE_URL) return;

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const row = await client.query(
      `SELECT a.id::text AS "analysisId", f.id::text AS "fieldId"
       FROM analyses a
       JOIN crop_seasons cs ON cs.tenant_id = a.tenant_id AND cs.id = a.crop_season_id
       JOIN fields f ON f.tenant_id = cs.tenant_id AND f.id = cs.field_id
       WHERE a.tenant_id = (SELECT tenant_id FROM tenant_members tm JOIN users u ON u.id = tm.user_id WHERE u.email = $1 LIMIT 1)
       ORDER BY a.created_at DESC LIMIT 1`,
      [TENANT_A_EMAIL],
    );
    const target = row.rows[0];
    test.skip(!target, "precisa de 1 análise real no tenant A.");
    if (!target) return;

    await login(page, TENANT_A_EMAIL, TENANT_A_PASSWORD);
    // Pergunta que não bate em nenhum intent específico -- prova que "ver talhão" é uma affordance de
    // CONTEXTO (sempre presente quando a evidência de análise resolveu), não amarrada a uma pergunta certa.
    const result = await askAssistant(page, "explique esta análise", { type: "analysis", id: target.analysisId });
    expect(result.status).toBe(200);

    const action = result.json.suggested_actions.find((a: any) => a.kind === "open_field");
    expect(action, `nenhuma ação open_field: ${JSON.stringify(result.json.suggested_actions)}`).toBeTruthy();
    expect(action.href).toBe(`/talhoes/${target.fieldId}`);
  } finally {
    await client.end();
  }
});

test("Assistente: contexto inválido nunca sugere nenhuma ação (Bloco 4 -- fail closed também vale pra ações)", async ({ page }) => {
  await login(page, TENANT_A_EMAIL, TENANT_A_PASSWORD);
  const result = await askAssistant(page, "explique esta análise", { type: "analysis", id: "nao-e-um-uuid" });
  expect(result.status).toBe(200);
  expect(result.json.suggested_actions).toEqual([]);
});

test("Assistente: FIELD_TECH recebe ações resolvidas normalmente (nenhuma das 6 ações desta rodada é role-restrita hoje) -- mecanismo de RBAC roda sem quebrar pra uma role real (Bloco 4)", async ({ page }) => {
  await login(page, FIELD_TECH_EMAIL, FIELD_TECH_PASSWORD);
  const contextFieldTech = await page.evaluate(async () => (await fetch("/api/context")).json());
  const propertyFT = contextFieldTech.properties?.[0];
  test.skip(!propertyFT, "precisa de 1 propriedade real visível pra FIELD_TECH.");
  if (!propertyFT) return;

  const result = await askAssistant(page, "faça um resumo da situação", { type: "property", id: propertyFT.id });
  expect(result.status).toBe(200);
  const action = result.json.suggested_actions.find((a: any) => a.kind === "open_report");
  expect(action).toBeTruthy();
  expect(action.href).toBe(`/relatorios/propriedade/${propertyFT.id}`);
});

test("Assistente: filtro ativo na fila de Inteligência sugere ação filter_intelligence com href refletindo o MESMO filtro (Bloco 4)", async ({ page }) => {
  await login(page, TENANT_A_EMAIL, TENANT_A_PASSWORD);
  const result = await askAssistant(page, "quantos itens estão na fila?", { type: "intelligence" }, {
    screenState: { screen: "intelligence", reviewState: "APROVADA" },
  });
  expect(result.status).toBe(200);
  const action = result.json.suggested_actions.find((a: any) => a.kind === "filter_intelligence");
  // Só existe ação quando há itens no bucket (a intenção só monta actions no ramo com resultado -- ver
  // local-intent-assistant-provider.ts); se a fila estiver vazia pra este filtro, não há o que afirmar.
  if (result.json.facts.some((f: any) => f.label.includes("Itens na fila") && f.value !== "0")) {
    expect(action, `sem ação filter_intelligence: ${JSON.stringify(result.json.suggested_actions)}`).toBeTruthy();
    expect(action.href).toBe("/inteligencia?reviewState=APROVADA");
  }
});

test("Assistente: sem filtro nenhum aplicado na fila de Inteligência, NÃO sugere filter_intelligence (ação sem propósito real nunca é oferecida)", async ({ page }) => {
  await login(page, TENANT_A_EMAIL, TENANT_A_PASSWORD);
  const result = await askAssistant(page, "quantos itens estão na fila?", { type: "intelligence" });
  expect(result.status).toBe(200);
  const action = result.json.suggested_actions.find((a: any) => a.kind === "filter_intelligence");
  expect(action).toBeFalsy();
});
