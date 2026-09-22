import { test, expect, type Page } from "@playwright/test";
import { Client } from "pg";

// Fase 4E — Gate Pré-LLM. Bloco 1: cabeçalho contextual leve (menos consultas ao banco que o Evidence
// Package completo, com o MESMO isolamento de tenant/RBAC). Bloco 2: coerência hierárquica das ações
// `filter_intelligence` (isolamento de tenant sozinho não captura um `propertyId` de uma fazenda combinado
// com um `fieldId` de OUTRA fazenda do MESMO tenant). Bloco 3 (cards nunca vêm de um provider generativo)
// é coberto por teste puro (`scripts/test-assistant-response-schema.mjs`) — não precisa de e2e porque a
// garantia é uma função pura, testável isoladamente, chamada verbatim por `route.ts`.
function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} precisa estar definida para rodar os testes e2e (ver e2e/README.md).`);
  return value;
}

const TENANT_A_EMAIL = "admin@raiz.local";
const TENANT_A_PASSWORD = requiredEnv("E2E_ADMIN_PASSWORD");

async function login(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await Promise.all([page.waitForURL(/dashboard/, { timeout: 15_000 }), page.click(".login-submit")]);
}

async function contextDebug(page: Page, screenContext?: unknown, screenState?: unknown) {
  return page.evaluate(
    async ({ screenContext, screenState }) => {
      const res = await fetch("/api/assistant/context", { method: "POST", headers: { "content-type": "application/json", "x-debug-query-count": "1" }, body: JSON.stringify({ screenContext, screenState }) });
      return res.json();
    },
    { screenContext, screenState },
  );
}

async function evidenceDebug(page: Page, question: string, screenContext?: unknown, screenState?: unknown) {
  return page.evaluate(
    async ({ question, screenContext, screenState }) => {
      const res = await fetch("/api/assistant", { method: "POST", headers: { "content-type": "application/json", "x-debug-query-count": "1" }, body: JSON.stringify({ question, screenContext, screenState }) });
      return res.json();
    },
    { question, screenContext, screenState },
  );
}

async function askAssistant(page: Page, question: string, screenContext?: unknown, screenState?: unknown) {
  return page.evaluate(
    async ({ question, screenContext, screenState }) => {
      const res = await fetch("/api/assistant", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ question, screenContext, screenState }) });
      return { status: res.status, json: await res.json() };
    },
    { question, screenContext, screenState },
  );
}

// ---------------------------------------------------------------------------------------------
// Bloco 1 — cabeçalho contextual leve: mesmo rótulo, muito menos consultas.
// ---------------------------------------------------------------------------------------------

test("Bloco 1: Dashboard -- caminho leve do cabeçalho não executa NENHUMA consulta ao banco (rótulo é estático)", async ({ page }) => {
  await login(page, TENANT_A_EMAIL, TENANT_A_PASSWORD);
  const result = await contextDebug(page, { type: "dashboard" });
  expect(result.label).toBe("Central de Decisão");
  expect(result.valid).toBe(true);
  expect(result._debugQueryCount).toBe(0);
});

test("Bloco 1: Dashboard -- o caminho leve usa muito menos consultas que montar o Evidence Package completo pra responder uma pergunta real", async ({ page }) => {
  await login(page, TENANT_A_EMAIL, TENANT_A_PASSWORD);
  const light = await contextDebug(page, { type: "dashboard" });
  const heavy = await evidenceDebug(page, "quais são as principais pendências da minha operação?", { type: "dashboard" });
  expect(light._debugQueryCount).toBe(0);
  // getExecutiveDashboard + getPortfolioFieldSummaries + listOperationalAlerts, cada um seu próprio
  // withTenant -- bem mais que o punhado de consultas que o cabeçalho leve precisaria.
  expect(heavy._debugEvidenceQueryCount).toBeGreaterThan(10);
});

test("Bloco 1: Talhão -- caminho leve resolve o mesmo rótulo que o Evidence Package completo, com muito menos consultas", async ({ page }) => {
  test.skip(!process.env.DATABASE_URL, "precisa de DATABASE_URL no ambiente pra este teste.");
  if (!process.env.DATABASE_URL) return;
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  let field: { fieldId: string; fieldName: string; propertyName: string } | undefined;
  try {
    const row = await client.query(
      `SELECT f.id::text AS "fieldId", f.name AS "fieldName", p.name AS "propertyName" FROM fields f
       JOIN properties p ON p.tenant_id = f.tenant_id AND p.id = f.property_id
       WHERE f.tenant_id = (SELECT tenant_id FROM tenant_members tm JOIN users u ON u.id = tm.user_id WHERE u.email = $1 LIMIT 1)
       LIMIT 1`,
      [TENANT_A_EMAIL],
    );
    field = row.rows[0];
  } finally {
    await client.end();
  }
  test.skip(!field, "precisa de 1 talhão real no tenant A.");
  if (!field) return;

  await login(page, TENANT_A_EMAIL, TENANT_A_PASSWORD);
  const light = await contextDebug(page, { type: "field", id: field.fieldId });
  expect(light.label).toBe(`${field.fieldName} · ${field.propertyName}`);
  expect(light.valid).toBe(true);

  const heavy = await evidenceDebug(page, "o que mudou nesta safra?", { type: "field", id: field.fieldId });
  expect(light._debugQueryCount).toBeLessThan(heavy._debugEvidenceQueryCount);
  // Regressão: o caminho leve precisa continuar leve (1 consulta real + overhead fixo do withTenant) --
  // se algum dia alguém acidentalmente trocar `resolveContextLabelLight` por `buildAssistantEvidence`
  // de novo, este teto estoura.
  expect(light._debugQueryCount).toBeLessThanOrEqual(6);
});

test("Bloco 1: talhão/propriedade inexistente (ou de outro tenant) -> 'Contexto indisponível', nunca um rótulo inventado, mesmo no caminho leve", async ({ page }) => {
  await login(page, TENANT_A_EMAIL, TENANT_A_PASSWORD);
  const result = await contextDebug(page, { type: "field", id: "11111111-1111-4111-8111-111111111111" });
  expect(result.label).toBeNull();
  expect(result.valid).toBe(false);
});

// ---------------------------------------------------------------------------------------------
// Bloco 2 — coerência hierárquica de `filter_intelligence` (isolamento de tenant sozinho não pega isso).
//
// Nota honesta sobre cobertura (mesma classe de achado já documentado pra "ação cross-tenant" no Bloco 4):
// hoje, o ÚNICO provider real (`local-intent-assistant-provider.ts`) só anexa `filter_intelligence` quando
// `getIntelligenceQueue` já devolveu pelo menos 1 linha pros MESMOS ids -- e como um talhão só pertence a
// UMA propriedade (e uma propriedade só a UM cliente) no modelo de dados real, uma combinação
// realmente inconsistente de ids SEMPRE devolve zero linhas por construção, então a ação nunca seria
// oferecida de qualquer jeito, mesmo sem a validação nova de `belongsTo` (`assistant-actions.ts`). Os
// testes abaixo provam o comportamento OBSERVÁVEL exigido ("combinação inconsistente -> ação rejeitada"),
// que é real e correto -- mas não isolam se é o `belongsTo` novo ou o filtro natural da fila que está
// bloqueando. `belongsTo` continua sendo defesa em profundidade genuína pro dia em que outro provider (ou
// uma mudança no local) anexar uma ação sem passar pelo mesmo filtro -- exatamente como a validação de
// posse/tenant do Bloco 4 já era defesa em profundidade antes de existir um caminho real de ataque.
// ---------------------------------------------------------------------------------------------

type Fixture = {
  clientA: string; clientB: string;
  propertyUnderA: string; propertyUnderB: string;
  fieldUnderPropertyA: string; fieldUnderPropertyB: string;
  seasonUnderFieldA: string | null; seasonUnderFieldB: string | null;
};

async function loadHierarchyFixture(): Promise<Fixture | null> {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const tenantRow = await client.query(`SELECT tenant_id::text AS id FROM tenant_members tm JOIN users u ON u.id = tm.user_id WHERE u.email = $1 LIMIT 1`, [TENANT_A_EMAIL]);
    const tenantId = tenantRow.rows[0]?.id;
    if (!tenantId) return null;
    const clients = await client.query(`SELECT id::text FROM clients WHERE tenant_id = $1::uuid LIMIT 2`, [tenantId]);
    if (clients.rows.length < 2) return null;
    const [clientA, clientB] = clients.rows.map((r: { id: string }) => r.id);
    const propA = await client.query(`SELECT id::text FROM properties WHERE tenant_id = $1::uuid AND client_id = $2::uuid LIMIT 1`, [tenantId, clientA]);
    const propB = await client.query(`SELECT id::text FROM properties WHERE tenant_id = $1::uuid AND client_id = $2::uuid LIMIT 1`, [tenantId, clientB]);
    if (!propA.rows[0] || !propB.rows[0]) return null;
    const propertyUnderA = propA.rows[0].id, propertyUnderB = propB.rows[0].id;
    const fieldA = await client.query(`SELECT id::text FROM fields WHERE tenant_id = $1::uuid AND property_id = $2::uuid LIMIT 1`, [tenantId, propertyUnderA]);
    const fieldB = await client.query(`SELECT id::text FROM fields WHERE tenant_id = $1::uuid AND property_id = $2::uuid LIMIT 1`, [tenantId, propertyUnderB]);
    if (!fieldA.rows[0] || !fieldB.rows[0]) return null;
    const fieldUnderPropertyA = fieldA.rows[0].id, fieldUnderPropertyB = fieldB.rows[0].id;
    const seasonA = await client.query(`SELECT id::text FROM crop_seasons WHERE tenant_id = $1::uuid AND field_id = $2::uuid LIMIT 1`, [tenantId, fieldUnderPropertyA]);
    const seasonB = await client.query(`SELECT id::text FROM crop_seasons WHERE tenant_id = $1::uuid AND field_id = $2::uuid LIMIT 1`, [tenantId, fieldUnderPropertyB]);
    return { clientA, clientB, propertyUnderA, propertyUnderB, fieldUnderPropertyA, fieldUnderPropertyB, seasonUnderFieldA: seasonA.rows[0]?.id ?? null, seasonUnderFieldB: seasonB.rows[0]?.id ?? null };
  } finally {
    await client.end();
  }
}

test("Bloco 2: propertyId de uma fazenda + fieldId de OUTRA fazenda do MESMO tenant -> ação filter_intelligence rejeitada", async ({ page }) => {
  test.skip(!process.env.DATABASE_URL, "precisa de DATABASE_URL no ambiente pra este teste.");
  if (!process.env.DATABASE_URL) return;
  const fx = await loadHierarchyFixture();
  test.skip(!fx, "precisa de 2 clientes com propriedade+talhão cada no tenant A.");
  if (!fx) return;

  await login(page, TENANT_A_EMAIL, TENANT_A_PASSWORD);
  // propertyUnderA + fieldUnderPropertyB: os dois existem e pertencem ao tenant A (passariam num check
  // de tenant isolado), mas o talhão NÃO pertence a essa propriedade -- combinação inconsistente.
  const inconsistent = await askAssistant(page, "quantos itens estão na fila com os filtros atuais?", { type: "intelligence" }, { screen: "intelligence", propertyId: fx.propertyUnderA, fieldId: fx.fieldUnderPropertyB });
  expect(inconsistent.status).toBe(200);
  const action = inconsistent.json.suggested_actions.find((a: any) => a.kind === "filter_intelligence");
  expect(action, `ação filter_intelligence não deveria ter sido oferecida com propertyId/fieldId de fazendas diferentes: ${JSON.stringify(inconsistent.json.suggested_actions)}`).toBeUndefined();
});

test("Bloco 2: propertyId de UM cliente + clientId de OUTRO cliente do mesmo tenant -> ação filter_intelligence rejeitada", async ({ page }) => {
  test.skip(!process.env.DATABASE_URL, "precisa de DATABASE_URL no ambiente pra este teste.");
  if (!process.env.DATABASE_URL) return;
  const fx = await loadHierarchyFixture();
  test.skip(!fx, "precisa de 2 clientes com propriedade cada no tenant A.");
  if (!fx) return;

  await login(page, TENANT_A_EMAIL, TENANT_A_PASSWORD);
  const inconsistent = await askAssistant(page, "quantos itens estão na fila com os filtros atuais?", { type: "intelligence" }, { screen: "intelligence", clientId: fx.clientA, propertyId: fx.propertyUnderB });
  expect(inconsistent.status).toBe(200);
  const action = inconsistent.json.suggested_actions.find((a: any) => a.kind === "filter_intelligence");
  expect(action).toBeUndefined();
});

test("Bloco 2: seasonId de UM talhão + fieldId de OUTRO talhão -> ação filter_intelligence rejeitada", async ({ page }) => {
  test.skip(!process.env.DATABASE_URL, "precisa de DATABASE_URL no ambiente pra este teste.");
  if (!process.env.DATABASE_URL) return;
  const fx = await loadHierarchyFixture();
  test.skip(!fx || !fx.seasonUnderFieldB, "precisa de 2 talhões com pelo menos 1 safra cada no tenant A.");
  if (!fx || !fx.seasonUnderFieldB) return;

  await login(page, TENANT_A_EMAIL, TENANT_A_PASSWORD);
  const inconsistent = await askAssistant(page, "quantos itens estão na fila com os filtros atuais?", { type: "intelligence" }, { screen: "intelligence", fieldId: fx.fieldUnderPropertyA, seasonId: fx.seasonUnderFieldB });
  expect(inconsistent.status).toBe(200);
  const action = inconsistent.json.suggested_actions.find((a: any) => a.kind === "filter_intelligence");
  expect(action).toBeUndefined();
});

test("Bloco 2: cadeia hierárquica COERENTE (propertyId -> fieldId reais da mesma fazenda) -> ação filter_intelligence aceita normalmente", async ({ page }) => {
  test.skip(!process.env.DATABASE_URL, "precisa de DATABASE_URL no ambiente pra este teste.");
  if (!process.env.DATABASE_URL) return;
  const fx = await loadHierarchyFixture();
  test.skip(!fx, "precisa de 1 cliente com propriedade+talhão no tenant A.");
  if (!fx) return;

  await login(page, TENANT_A_EMAIL, TENANT_A_PASSWORD);
  const consistent = await askAssistant(page, "quantos itens estão na fila com os filtros atuais?", { type: "intelligence" }, { screen: "intelligence", propertyId: fx.propertyUnderA, fieldId: fx.fieldUnderPropertyA });
  expect(consistent.status).toBe(200);
  const action = consistent.json.suggested_actions.find((a: any) => a.kind === "filter_intelligence");
  expect(action, `ação filter_intelligence deveria ter sido oferecida (propertyId/fieldId coerentes): ${JSON.stringify(consistent.json.suggested_actions)}`).toBeTruthy();
  expect(action.href).toContain(`propertyId=${fx.propertyUnderA}`);
  expect(action.href).toContain(`fieldId=${fx.fieldUnderPropertyA}`);
});

test("Bloco 2: SEM nível intermediário informado (clientId + fieldId, sem propertyId) -> nunca inventa a relação, ação continua oferecida pra uma combinação parcial coerente", async ({ page }) => {
  test.skip(!process.env.DATABASE_URL, "precisa de DATABASE_URL no ambiente pra este teste.");
  if (!process.env.DATABASE_URL) return;
  const fx = await loadHierarchyFixture();
  test.skip(!fx, "precisa de 1 cliente com propriedade+talhão no tenant A.");
  if (!fx) return;

  // Nota sobre o que este teste PROVA e o que não prova: `clientA` e `fieldUnderPropertyA` são
  // genuinamente do mesmo cliente (consistentes) -- não dá pra isolar aqui "aceito porque não existe
  // checagem cliente<->talhão direta" de "aceito porque, coincidentemente, também é consistente", porque
  // `getIntelligenceQueue` já filtra por `client_id AND field_id` simultaneamente -- qualquer combinação
  // REALMENTE inconsistente nesse par (sem `propertyId` no meio) já devolveria zero linhas por construção
  // do próprio modelo de dados (um talhão só pertence a UM cliente), então a ação nunca seria oferecida de
  // qualquer forma, independente da validação de hierarquia existir ou não -- mesma limitação de cobertura
  // já documentada pra "ação cross-tenant" no Bloco 4 (`assistant-actions.spec.ts`). O que ESTE teste prova
  // de verdade é que a ausência de `propertyId` no meio nunca faz a ação ser recusada por engano.
  await login(page, TENANT_A_EMAIL, TENANT_A_PASSWORD);
  const result = await askAssistant(page, "quantos itens estão na fila com os filtros atuais?", { type: "intelligence" }, { screen: "intelligence", clientId: fx.clientA, fieldId: fx.fieldUnderPropertyA });
  expect(result.status).toBe(200);
  const action = result.json.suggested_actions.find((a: any) => a.kind === "filter_intelligence");
  expect(action, `sem propertyId no meio, combinação coerente parcial não deveria ser recusada por engano: ${JSON.stringify(result.json.suggested_actions)}`).toBeTruthy();
});

test("Bloco 2: fieldId de outro TENANT combinado com propertyId real -> ainda rejeitada (isolamento de tenant continua valendo, não só a hierarquia)", async ({ page }) => {
  test.skip(!process.env.DATABASE_URL, "precisa de DATABASE_URL no ambiente pra este teste.");
  if (!process.env.DATABASE_URL) return;
  const fx = await loadHierarchyFixture();
  test.skip(!fx, "precisa de 1 propriedade real no tenant A.");
  if (!fx) return;

  await login(page, TENANT_A_EMAIL, TENANT_A_PASSWORD);
  const result = await askAssistant(page, "quantos itens estão na fila com os filtros atuais?", { type: "intelligence" }, { screen: "intelligence", propertyId: fx.propertyUnderA, fieldId: "22222222-2222-4222-8222-222222222222" });
  expect(result.status).toBe(200);
  const action = result.json.suggested_actions.find((a: any) => a.kind === "filter_intelligence");
  expect(action).toBeUndefined();
});
