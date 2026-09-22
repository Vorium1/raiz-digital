import { test, expect, type Page } from "@playwright/test";
import { Client } from "pg";

// Fase 4, Bloco 5 -- prova de UX real (não só a API): o painel contextual do Assistente RAIZ
// (`assistant-raiz-widget.tsx`) precisa mostrar, na TELA de verdade, o cabeçalho contextual correto,
// sugestões específicas por tela, reação visível a troca de contexto, e uma ação validada abrindo a rota
// exata quando clicada -- tudo isso já é coberto no nível de API por `assistant-fase4a.spec.ts` e
// `assistant-actions.spec.ts`; este arquivo prova que o COMPONENTE realmente usa esse contrato, não um
// caminho paralelo desenhado só pra passar em teste.
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

async function openAssistant(page: Page) {
  await page.click(".assistant-fab");
  await expect(page.locator(".assistant-panel")).toBeVisible();
}

async function contextBadgeText(page: Page): Promise<string> {
  // Espera o rótulo real (`/api/assistant/context`) resolver -- o painel começa em "Contexto indisponível"
  // de propósito (reset ao abrir/trocar de contexto, ver `assistant-raiz-widget.tsx`) até a resposta
  // chegar; só "não vazio" não prova que resolveu, porque o texto do estado indisponível também não é vazio.
  await expect(page.locator(".assistant-context-badge:not(.unavailable)")).toBeVisible({ timeout: 10_000 });
  return (await page.locator(".assistant-context-badge span").textContent())?.trim() ?? "";
}

test("Talhão 360°: cabeçalho mostra o talhão real e as sugestões são específicas de talhão (nunca as mesmas 5 do Dashboard)", async ({ page }) => {
  test.skip(!process.env.DATABASE_URL, "precisa de DATABASE_URL no ambiente pra este teste.");
  if (!process.env.DATABASE_URL) return;
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  let field: { fieldId: string; fieldName: string } | undefined;
  try {
    const row = await client.query(
      `SELECT f.id::text AS "fieldId", f.name AS "fieldName" FROM fields f
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
  await page.goto(`/talhoes/${field.fieldId}`, { waitUntil: "networkidle" });

  // Ponto de entrada contextual na própria tela (Bloco 5) -- discreto, mas real, com o nome do talhão.
  await expect(page.locator(".assistant-entry-button")).toContainText(field.fieldName);

  await openAssistant(page);
  const badge = await contextBadgeText(page);
  expect(badge).toContain(field.fieldName);

  const suggestions = await page.locator(".assistant-suggestions button").allTextContents();
  expect(suggestions).toContain("Compare esta safra com a anterior.");
  // A sugestão de laudos do mês é do Dashboard, nunca do talhão -- prova de que a lista muda por tela.
  expect(suggestions).not.toContain("Quantos laudos entraram este mês?");
});

test("Análise: cabeçalho mostra o código real da análise (nunca um id cru, nunca 'Central de Decisão')", async ({ page }) => {
  test.skip(!process.env.DATABASE_URL, "precisa de DATABASE_URL no ambiente pra este teste.");
  if (!process.env.DATABASE_URL) return;
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  let analysis: { analysisId: string; code: string } | undefined;
  try {
    const row = await client.query(
      `SELECT id::text AS "analysisId", code FROM analyses
       WHERE tenant_id = (SELECT tenant_id FROM tenant_members tm JOIN users u ON u.id = tm.user_id WHERE u.email = $1 LIMIT 1)
       ORDER BY created_at DESC LIMIT 1`,
      [TENANT_A_EMAIL],
    );
    analysis = row.rows[0];
  } finally {
    await client.end();
  }
  test.skip(!analysis, "precisa de 1 análise real no tenant A.");
  if (!analysis) return;

  await login(page, TENANT_A_EMAIL, TENANT_A_PASSWORD);
  await page.goto(`/analises/${analysis.analysisId}`, { waitUntil: "networkidle" });
  await openAssistant(page);
  const badge = await contextBadgeText(page);
  expect(badge).toBe(`Análise ${analysis.code}`);

  const suggestions = await page.locator(".assistant-suggestions button").allTextContents();
  expect(suggestions).toContain("Qual a confiabilidade desta interpretação?");
});

test("Inteligência: a resposta reflete o MESMO filtro aplicado na URL, nunca a fila inteira sem filtro", async ({ page }) => {
  await login(page, TENANT_A_EMAIL, TENANT_A_PASSWORD);
  await page.goto("/inteligencia?interpretationState=BLOQUEADA", { waitUntil: "networkidle" });

  const realCount = await page.locator(".intelligence-queue-row").count();
  test.skip(realCount === 0, "precisa de pelo menos 1 item real no bucket BLOQUEADA pra este tenant.");
  if (realCount === 0) return;

  await openAssistant(page);
  await page.fill(".assistant-panel-form input", "Quantos itens estão na fila com os filtros atuais?");
  await page.click('.assistant-panel-form button[type="submit"]');
  await expect(page.locator(".assistant-entry").last()).toContainText(`${realCount} item`, { timeout: 10_000 });
});

test("Mapa com seleção: cabeçalho mostra 'Mapa · <talhão>'; trocar de talhão na mesma tela muda o cabeçalho SEM recarregar a página (nunca deixa resposta antiga parecer do novo contexto)", async ({ page }) => {
  await login(page, TENANT_A_EMAIL, TENANT_A_PASSWORD);
  await page.goto("/mapas", { waitUntil: "networkidle" });

  const fieldButtons = page.locator(".field-order-item");
  const count = await fieldButtons.count();
  test.skip(count < 2, "precisa de pelo menos 2 talhões reais com ordem de coleta pra este tenant.");
  if (count < 2) return;

  const firstName = (await fieldButtons.nth(0).locator("strong").textContent())?.trim();
  const secondName = (await fieldButtons.nth(1).locator("strong").textContent())?.trim();
  expect(firstName).toBeTruthy();
  expect(secondName).toBeTruthy();
  expect(firstName).not.toBe(secondName);

  await fieldButtons.nth(0).click();
  await openAssistant(page);
  const badgeBefore = await contextBadgeText(page);
  expect(badgeBefore).toBe(`Mapa · ${firstName}`);

  // Pergunta no contexto do primeiro talhão -- fica registrada no histórico com ESTE rótulo.
  await page.fill(".assistant-panel-form input", "O que estou vendo neste mapa?");
  await page.click('.assistant-panel-form button[type="submit"]');
  await expect(page.locator(".assistant-entry-context").last()).toContainText(firstName!, { timeout: 10_000 });

  // Troca de talhão -- navegação client-side (router.replace, sem reload) -- o painel continua montado.
  await fieldButtons.nth(1).click();
  await expect(page.locator(".assistant-context-badge:not(.unavailable) span")).toHaveText(`Mapa · ${secondName}`, { timeout: 10_000 });

  // A mensagem antiga continua rotulada com o talhão ANTIGO -- nunca reatribuída ao novo contexto.
  await expect(page.locator(".assistant-entry-context").first()).toContainText(firstName!);
});

test("Ação validada: clicar em 'Ver comparativo' abre exatamente /comparativos com os ids reais das duas safras", async ({ page }) => {
  test.skip(!process.env.DATABASE_URL, "precisa de DATABASE_URL no ambiente pra este teste.");
  if (!process.env.DATABASE_URL) return;
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  let field: { fieldId: string; latestSeasonId: string; previousSeasonId: string } | undefined;
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
    field = row.rows[0];
  } finally {
    await client.end();
  }
  test.skip(!field, "precisa de 1 talhão real com pelo menos 2 safras no tenant A.");
  if (!field) return;

  await login(page, TENANT_A_EMAIL, TENANT_A_PASSWORD);
  await page.goto(`/talhoes/${field.fieldId}`, { waitUntil: "networkidle" });
  await openAssistant(page);
  await page.click('.assistant-suggestions button:has-text("Compare esta safra com a anterior.")');

  const actionLink = page.locator(".assistant-action", { hasText: "Ver comparativo" });
  await expect(actionLink).toBeVisible({ timeout: 10_000 });
  const expectedHref = `/comparativos?mode=seasons&a=${field.latestSeasonId}&b=${field.previousSeasonId}`;
  await expect(actionLink).toHaveAttribute("href", expectedHref);

  await actionLink.click();
  await page.waitForURL(`**${expectedHref}`);
  expect(page.url()).toContain(expectedHref);
});

test("Mobile 390×844: painel abre como drawer de altura cheia, sem estourar a viewport, com a caixa de pergunta sempre alcançável", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page, TENANT_A_EMAIL, TENANT_A_PASSWORD);
  await page.goto("/dashboard", { waitUntil: "networkidle" });
  await openAssistant(page);

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);

  const input = page.locator(".assistant-panel-form input");
  await expect(input).toBeVisible();
  const inputBox = await input.boundingBox();
  expect(inputBox).not.toBeNull();
  expect(inputBox!.y + inputBox!.height).toBeLessThanOrEqual(844);

  // Pergunta real funciona dentro do drawer mobile -- não é só uma casca visual.
  await page.click(".assistant-suggestions button >> nth=0");
  await expect(page.locator(".assistant-answer").last()).toBeVisible({ timeout: 10_000 });
});
