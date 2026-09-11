import { test, expect, type Page } from "@playwright/test";
import { Client } from "pg";

// Fase 4A (Assistente RAIZ como copiloto contextual) -- Bloco 0 (isolamento de tenant), Bloco 1/2
// (ScreenContext/ScreenState + Evidence Package Builders) e Bloco 3 (resposta estruturada), exercitando o
// endpoint real `/api/assistant`. Lacuna real confirmada na arquitetura (docs/RAIZ_2.0_FASE4_ARQUITETURA_
// ASSISTENTE.md, seção 1.3, item 7): antes da Fase 4A não existia NENHUM teste e2e cobrindo isolamento de
// tenant do assistente -- o isolamento só tinha sido validado manualmente uma vez.
function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} precisa estar definida para rodar os testes e2e (ver e2e/README.md).`);
  return value;
}

const TENANT_A_EMAIL = "admin@raiz.local";
const TENANT_A_PASSWORD = requiredEnv("E2E_ADMIN_PASSWORD");
const TENANT_B_EMAIL = "e2e-tenant-b@raiz.local";
const TENANT_B_PASSWORD = requiredEnv("E2E_TENANT_B_PASSWORD");
const FIELD_TECH_EMAIL = "rbac-field-tech@raiz.local";
const FIELD_TECH_PASSWORD = requiredEnv("E2E_RBAC_FIELD_TECH_PASSWORD");

async function login(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await Promise.all([page.waitForURL(/dashboard/, { timeout: 15_000 }), page.click(".login-submit")]);
}

async function logout(page: Page) {
  await page.evaluate(() => fetch("/api/auth/logout", { method: "POST" }));
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

/** Última linha real de auditoria (`ai_generations`, kind OPERATIONAL_ASSISTANT) da conta indicada -- usada
 *  pra inspecionar `request_payload.evidenceManifest`/`screenContext` depois de uma chamada real ao
 *  endpoint, quando a informação não é observável só pela resposta HTTP (ex.: o Evidence Package de
 *  mapa/inteligência ainda não é sempre narrado em texto pelo provedor). */
async function latestAssistantGenerationForEmail(client: Client, email: string) {
  const result = await client.query(
    `SELECT g.request_payload AS "requestPayload", g.response_payload AS "responsePayload"
     FROM ai_generations g
     WHERE g.tenant_id = (SELECT tenant_id FROM tenant_members tm JOIN users u ON u.id = tm.user_id WHERE u.email = $1 LIMIT 1)
       AND g.kind = 'OPERATIONAL_ASSISTANT'
     ORDER BY g.created_at DESC LIMIT 1`,
    [email],
  );
  return result.rows[0] as { requestPayload: any; responsePayload: any } | undefined;
}

async function latestAssistantGenerationForTenantA(client: Client) {
  return latestAssistantGenerationForEmail(client, "admin@raiz.local");
}

// ---------------------------------------------------------------------------------------------
// Bloco 0 -- isolamento de tenant
// ---------------------------------------------------------------------------------------------

test("Assistente: tenant B nunca recebe evidência (nem em texto solto na resposta) de talhão/propriedade da tenant A, mesmo enviando um ID real de A", async ({ page }) => {
  await login(page, TENANT_A_EMAIL, TENANT_A_PASSWORD);
  const contextA = await page.evaluate(async () => (await fetch("/api/context")).json());
  const fieldA = contextA.fields?.[0];
  const propertyA = contextA.properties?.[0];
  test.skip(!fieldA || !propertyA, "precisa de pelo menos 1 talhão e 1 propriedade reais no tenant A.");
  if (!fieldA || !propertyA) return;
  await logout(page);

  await login(page, TENANT_B_EMAIL, TENANT_B_PASSWORD);
  for (const screenContext of [
    { type: "field", id: fieldA.id },
    { type: "property", id: propertyA.id },
    // Propositalmente um ID de talhão passado como se fosse de análise -- prova que nem um ID "quase
    // certo" (formato válido, entidade real, mas do tipo errado E do tenant errado) vaza nada.
    { type: "analysis", id: fieldA.id },
    { type: "report-field", id: fieldA.id },
    { type: "report-property", id: propertyA.id },
  ]) {
    const result = await askAssistant(page, "resumo geral da situação", screenContext);
    // Fail closed: nunca erro/crash -- a ausência de evidência vira resposta honesta, nunca 500.
    expect(result.status, `status inesperado pra screenContext ${JSON.stringify(screenContext)}`).toBe(200);
    expect(result.text, `vazou nome do talhão real da tenant A (screenContext ${JSON.stringify(screenContext)})`).not.toContain(fieldA.name);
    expect(result.text, `vazou nome da propriedade real da tenant A (screenContext ${JSON.stringify(screenContext)})`).not.toContain(propertyA.name);
  }
});

test("Assistente: comparação de safra com talhão de outro tenant nunca usa a evidência cross-tenant -- cai no caminho seguro 'sem duas safras'", async ({ page }) => {
  await login(page, TENANT_A_EMAIL, TENANT_A_PASSWORD);
  const contextA = await page.evaluate(async () => (await fetch("/api/context")).json());
  const fieldA = contextA.fields?.[0];
  test.skip(!fieldA, "precisa de 1 talhão real no tenant A.");
  if (!fieldA) return;
  await logout(page);

  await login(page, TENANT_B_EMAIL, TENANT_B_PASSWORD);
  const result = await askAssistant(page, "compare esta safra com a anterior", { type: "field", id: fieldA.id });
  expect(result.status).toBe(200);
  // Nunca usa `fieldEvidence`/`compareLatestTwoSeasons` da tenant A -- ambos tenant-scoped
  // independentemente, então a resposta real e honesta é "este talhão (inexistente pra B) não tem duas
  // safras", nunca o nome real da safra/cultura da tenant A.
  expect(result.json?.summary).toMatch(/ainda não tem duas safras/i);
  expect(result.text).not.toContain(fieldA.name);
});

test("Assistente: tenantId enviado no corpo da requisição nunca altera o tenant da sessão", async ({ page }) => {
  await login(page, TENANT_A_EMAIL, TENANT_A_PASSWORD);
  const contextA = await page.evaluate(async () => (await fetch("/api/context")).json());
  const fieldsCountA = contextA.fields?.length ?? 0;
  test.skip(fieldsCountA === 0, "precisa de pelo menos 1 talhão real no tenant A.");

  // Corpo forjado tentando se passar por outro tenant (uuid arbitrário, nunca usado -- a rota nunca lê
  // `tenantId` do corpo, só de `session.tenantId`).
  const forged = await askAssistant(page, "quais são as principais pendências da minha operação?", undefined, { tenantId: "00000000-0000-4000-8000-000000000000" });
  const real = await askAssistant(page, "quais são as principais pendências da minha operação?", undefined);
  expect(forged.status).toBe(200);
  // Mesma contagem de talhões/ordens/pendentes com ou sem o campo forjado -- prova que o campo foi
  // simplesmente ignorado, nunca interpretado como troca de tenant.
  expect(forged.json?.facts).toEqual(real.json?.facts);
});

test("Assistente: FIELD_TECH consegue perguntar normalmente (sem ação executável ainda) -- nenhuma ação/permissão indevida concedida", async ({ page }) => {
  await login(page, FIELD_TECH_EMAIL, FIELD_TECH_PASSWORD);
  const result = await askAssistant(page, "quais talhões têm pontos pendentes?", { type: "dashboard" });
  expect(result.status).toBe(200);
  // Bloco 4 (ações executáveis reais) ainda não existe nesta etapa -- o campo precisa continuar vazio pra
  // QUALQUER role, então não há "ação que a própria tela não permitiria" possível de conceder ainda.
  expect(result.json?.suggested_actions).toEqual([]);
});

// ---------------------------------------------------------------------------------------------
// Bloco 1/2/3 -- ScreenContext/ScreenState, Evidence Package Builders e resposta estruturada
// ---------------------------------------------------------------------------------------------

test("Assistente: resposta sempre traz o novo schema estruturado (fato/atenção/padrão/hipótese/revisão), nunca o formato antigo solto", async ({ page }) => {
  await login(page, TENANT_A_EMAIL, TENANT_A_PASSWORD);
  const result = await askAssistant(page, "quais são as principais pendências da minha operação?", { type: "dashboard" });
  expect(result.status).toBe(200);
  const body = result.json;
  expect(typeof body.summary).toBe("string");
  expect(Array.isArray(body.facts)).toBe(true);
  expect(Array.isArray(body.attention_points)).toBe(true);
  expect(Array.isArray(body.patterns)).toBe(true);
  expect(Array.isArray(body.hypotheses)).toBe(true);
  expect(Array.isArray(body.missing_information)).toBe(true);
  expect(Array.isArray(body.technical_references)).toBe(true);
  expect(Array.isArray(body.cards)).toBe(true);
  // Provedor local/determinístico -- nunca produz hipótese, então a revisão profissional (regra de
  // código, não do provider) nunca é acionada por ele nesta etapa.
  expect(body.hypotheses).toEqual([]);
  expect(body.suggested_actions).toEqual([]);
  expect(body.requires_professional_review).toBe(false);
  // Formato antigo (`answer` solto) não existe mais na resposta.
  expect(body.answer).toBeUndefined();
});

test("Assistente: Evidence Package Builder de propriedade alimenta o resumo real (contagem bate com o relatório executivo da mesma propriedade)", async ({ page }) => {
  await login(page, TENANT_A_EMAIL, TENANT_A_PASSWORD);
  const contextA = await page.evaluate(async () => (await fetch("/api/context")).json());
  const propertyA = contextA.properties?.[0];
  test.skip(!propertyA, "precisa de 1 propriedade real no tenant A.");
  if (!propertyA) return;

  const result = await askAssistant(page, "faça um resumo da situação", { type: "property", id: propertyA.id });
  expect(result.status).toBe(200);
  expect(result.json.summary).toContain(propertyA.name);
  // O fato "Talhões" precisa vir do Evidence Package Builder real (getPropertyExecutiveReportData),
  // nunca um número fixo/inventado -- confere contra a mesma contagem que /api/context já revela pra essa
  // propriedade.
  const realFieldCount = contextA.fields.filter((f: any) => f.propertyId === propertyA.id).length;
  const factField = result.json.facts.find((f: any) => f.label === "Talhões");
  expect(factField).toBeTruthy();
  expect(Number(factField.value)).toBe(realFieldCount);
});

test("Assistente: talhão sem talhão nenhum informado (fora de contexto de campo) nunca inventa qual talhão comparar", async ({ page }) => {
  await login(page, TENANT_A_EMAIL, TENANT_A_PASSWORD);
  const result = await askAssistant(page, "compare esta safra com a anterior", { type: "dashboard" });
  expect(result.status).toBe(200);
  expect(result.json.missing_information.length).toBeGreaterThan(0);
  expect(result.json.summary).toMatch(/preciso saber o talhão/i);
});

// ---------------------------------------------------------------------------------------------
// Fechamento técnico (2º pedido, item 1) -- EvidenceManifest deriva ruleRefs/technicalSourceIds
// automaticamente do Evidence Package real, não fica sempre vazio.
// ---------------------------------------------------------------------------------------------

test("Assistente: manifest de auditoria registra regra técnica e fontes reais quando a análise tem crop_profile com fonte ACTIVE (fechamento técnico, item 1)", async ({ page }) => {
  test.skip(!process.env.DATABASE_URL, "precisa de DATABASE_URL no ambiente pra este teste (ver e2e/README.md).");
  if (!process.env.DATABASE_URL) return;

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const target = await client.query(
      `SELECT i.analysis_id::text AS "analysisId"
       FROM interpretations i
       JOIN crop_profiles cp ON cp.id = i.crop_profile_id
       WHERE i.tenant_id = (SELECT tenant_id FROM tenant_members tm JOIN users u ON u.id = tm.user_id WHERE u.email = 'admin@raiz.local' LIMIT 1)
         AND EXISTS (SELECT 1 FROM technical_sources ts WHERE ts.crop_profile_id = cp.id AND ts.status = 'ACTIVE')
       ORDER BY i.created_at DESC LIMIT 1`,
    );
    const row = target.rows[0];
    test.skip(!row, "precisa de uma interpretação real cujo perfil de cultura tenha fonte técnica ACTIVE associada.");
    if (!row) return;

    await login(page, TENANT_A_EMAIL, TENANT_A_PASSWORD);
    const result = await askAssistant(page, "explique esta análise", { type: "analysis", id: row.analysisId });
    expect(result.status).toBe(200);

    const generation = await latestAssistantGenerationForTenantA(client);
    expect(generation, "nenhuma linha de auditoria encontrada depois da chamada").toBeTruthy();
    const manifest = generation!.requestPayload.evidenceManifest;
    expect(manifest.ruleRefs.length, `ruleRefs veio vazio -- manifest: ${JSON.stringify(manifest)}`).toBeGreaterThan(0);
    expect(manifest.technicalSourceIds.length, `technicalSourceIds veio vazio -- manifest: ${JSON.stringify(manifest)}`).toBeGreaterThan(0);
  } finally {
    await client.end();
  }
});

test("Assistente: manifest de auditoria nunca inventa regra/fonte pra contexto sem análise (dashboard) -- arrays vazios honestos", async ({ page }) => {
  test.skip(!process.env.DATABASE_URL, "precisa de DATABASE_URL no ambiente pra este teste.");
  if (!process.env.DATABASE_URL) return;

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await login(page, TENANT_A_EMAIL, TENANT_A_PASSWORD);
    const result = await askAssistant(page, "quais são as principais pendências da minha operação?", { type: "dashboard" });
    expect(result.status).toBe(200);

    const generation = await latestAssistantGenerationForTenantA(client);
    const manifest = generation!.requestPayload.evidenceManifest;
    expect(manifest.ruleRefs).toEqual([]);
    expect(manifest.technicalSourceIds).toEqual([]);
  } finally {
    await client.end();
  }
});

// ---------------------------------------------------------------------------------------------
// Fechamento técnico (2º pedido, item 2) -- contexto inválido falha fechado, nunca vira Dashboard.
// ---------------------------------------------------------------------------------------------

test("Assistente: talhão com UUID malformado nunca vira Dashboard -- resposta honesta de contexto não identificado (fechamento técnico, item 2)", async ({ page }) => {
  await login(page, TENANT_A_EMAIL, TENANT_A_PASSWORD);
  const result = await askAssistant(page, "quais são as principais pendências da minha operação?", { type: "field", id: "nao-e-um-uuid-valido" });
  expect(result.status).toBe(200);
  expect(result.json.summary).toMatch(/não consegui identificar o contexto atual/i);
  expect(result.json.missing_information.length).toBeGreaterThan(0);
  // Nunca despeja a operação inteira (fatos do dashboard) só porque o contexto informado veio quebrado.
  expect(result.json.facts).toEqual([]);
});

test("Assistente: tipo de contexto desconhecido nunca vira Dashboard", async ({ page }) => {
  await login(page, TENANT_A_EMAIL, TENANT_A_PASSWORD);
  const result = await askAssistant(page, "quais são as principais pendências da minha operação?", { type: "tela-que-nao-existe" });
  expect(result.status).toBe(200);
  expect(result.json.summary).toMatch(/não consegui identificar o contexto atual/i);
});

test("Assistente: talhão com UUID válido de outro tenant NÃO é tratado como inválido -- continua um contexto real (found:false), só não vira Dashboard (fechamento técnico, item 2)", async ({ page }) => {
  test.skip(!process.env.DATABASE_URL, "precisa de DATABASE_URL no ambiente pra este teste.");
  if (!process.env.DATABASE_URL) return;

  await login(page, TENANT_A_EMAIL, TENANT_A_PASSWORD);
  const contextA = await page.evaluate(async () => (await fetch("/api/context")).json());
  const fieldA = contextA.fields?.[0];
  test.skip(!fieldA, "precisa de 1 talhão real no tenant A.");
  if (!fieldA) return;
  await logout(page);

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await login(page, TENANT_B_EMAIL, TENANT_B_PASSWORD);
    const result = await askAssistant(page, "quais são as principais pendências da minha operação?", { type: "field", id: fieldA.id });
    expect(result.status).toBe(200);
    // NÃO é a mensagem de fail-closed (formato de ID válido, só a entidade que não existe pra este
    // tenant) -- essa distinção já era correta antes desta correção e precisa continuar sendo.
    expect(result.json.summary).not.toMatch(/não consegui identificar o contexto atual/i);

    const generation = await latestAssistantGenerationForEmail(client, TENANT_B_EMAIL);
    // A prova real: o `screenContext` PERSISTIDO na auditoria continua `{type:"field", id:...}` --
    // nunca foi silenciosamente reescrito pra `{type:"dashboard"}` só porque a entidade não foi encontrada.
    expect(generation!.requestPayload.screenContext).toEqual({ type: "field", id: fieldA.id });
  } finally {
    await client.end();
  }
});

test("Assistente: mapa com collectionOrderId inválido/de outro tenant registra a tentativa no manifesto, nunca cai silenciosamente pro Dashboard (fechamento técnico, item 2)", async ({ page }) => {
  test.skip(!process.env.DATABASE_URL, "precisa de DATABASE_URL no ambiente pra este teste.");
  if (!process.env.DATABASE_URL) return;

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await login(page, TENANT_A_EMAIL, TENANT_A_PASSWORD);

    // Ordem inexistente (uuid bem formado, mas nenhuma linha real com esse id) -- o cenário exato que o
    // diretor descreveu: "collectionOrderId informado mas não resolve pra uma ordem válida do tenant".
    const fakeOrderId = "00000000-0000-4000-8000-000000000001";
    const result = await askAssistant(page, "quais são as principais pendências da minha operação?", { type: "map" }, {
      screenState: { screen: "map", collectionOrderId: fakeOrderId },
    });
    expect(result.status).toBe(200);

    const generation = await latestAssistantGenerationForTenantA(client);
    const entityIds = generation!.requestPayload.evidenceManifest.entityIds;
    // A prova real: o manifesto registra QUAL ordem foi tentada -- isso só existe no ramo "unavailable"
    // (nunca no ramo "dashboard", que sempre tem entityIds vazio).
    expect(entityIds.attemptedCollectionOrderId).toBe(fakeOrderId);
  } finally {
    await client.end();
  }
});

test("Assistente: mapa SEM nenhuma ordem selecionada usa o Dashboard de verdade (ausência legítima, não um erro)", async ({ page }) => {
  test.skip(!process.env.DATABASE_URL, "precisa de DATABASE_URL no ambiente pra este teste.");
  if (!process.env.DATABASE_URL) return;

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await login(page, TENANT_A_EMAIL, TENANT_A_PASSWORD);
    const result = await askAssistant(page, "quais são as principais pendências da minha operação?", { type: "map" });
    expect(result.status).toBe(200);

    const generation = await latestAssistantGenerationForTenantA(client);
    const entityIds = generation!.requestPayload.evidenceManifest.entityIds;
    expect(entityIds.attemptedCollectionOrderId).toBeUndefined();
  } finally {
    await client.end();
  }
});

test("Assistente: Dashboard real (explícito) continua funcionando normalmente -- não é afetado pelo fechamento do fail-closed (fechamento técnico, item 2)", async ({ page }) => {
  await login(page, TENANT_A_EMAIL, TENANT_A_PASSWORD);
  const result = await askAssistant(page, "quais são as principais pendências da minha operação?", { type: "dashboard" });
  expect(result.status).toBe(200);
  expect(result.json.summary).not.toMatch(/não consegui identificar o contexto atual/i);
  expect(Array.isArray(result.json.facts)).toBe(true);
});

// ---------------------------------------------------------------------------------------------
// Fechamento técnico (2º pedido, item 3) -- ScreenState de Inteligência reproduz a MESMA regra de
// bucket da tela real (interpretationQueueBucket), nunca uma segunda definição paralela.
// ---------------------------------------------------------------------------------------------

test("Assistente: evidência da fila de Inteligência com filtro 'Aprovada' bate exatamente com a contagem real visível em /inteligencia pros mesmos filtros (fechamento técnico, item 3)", async ({ page }) => {
  await login(page, TENANT_A_EMAIL, TENANT_A_PASSWORD);

  // Conta o que a TELA REAL mostra pro filtro reviewState=APROVADA -- mesma fonte de verdade que o
  // Assistente precisa reproduzir.
  await page.goto("/inteligencia?reviewState=APROVADA", { waitUntil: "networkidle" });
  const realRowCount = await page.locator(".intelligence-queue-row").count();
  test.skip(realRowCount === 0, "precisa de pelo menos 1 análise real com revisão aprovada pra este teste comparar contagens.");
  if (realRowCount === 0) return;

  const result = await askAssistant(page, "quantos itens estão na fila?", { type: "intelligence" }, {
    screenState: { screen: "intelligence", reviewState: "APROVADA" },
  });
  expect(result.status).toBe(200);
  const fact = result.json.facts.find((f: any) => f.label === "Itens na fila (com os filtros atuais)");
  expect(fact, `resposta não trouxe o fato esperado -- corpo: ${JSON.stringify(result.json)}`).toBeTruthy();
  expect(Number(fact.value)).toBe(realRowCount);
});

test("Assistente: filtro 'Dado impede interpretação' (BLOQUEADA) na fila de Inteligência nunca mistura com itens de outros buckets", async ({ page }) => {
  await login(page, TENANT_A_EMAIL, TENANT_A_PASSWORD);

  await page.goto("/inteligencia?interpretationState=BLOQUEADA", { waitUntil: "networkidle" });
  const realRowCount = await page.locator(".intelligence-queue-row").count();
  test.skip(realRowCount === 0, "precisa de pelo menos 1 análise real bloqueada (dado impede interpretação) pra este teste.");
  if (realRowCount === 0) return;

  const result = await askAssistant(page, "quantos itens estão na fila?", { type: "intelligence" }, {
    screenState: { screen: "intelligence", interpretationState: "BLOQUEADA" },
  });
  expect(result.status).toBe(200);
  const fact = result.json.facts.find((f: any) => f.label === "Itens na fila (com os filtros atuais)");
  expect(Number(fact.value)).toBe(realRowCount);
});
