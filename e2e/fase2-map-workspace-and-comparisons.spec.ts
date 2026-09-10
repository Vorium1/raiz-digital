import { test, expect, type Page } from "@playwright/test";

// Cobre os comportamentos novos da RAIZ 2.0 Fase 2 (Blocos A/B/C/E): mapa como área de trabalho
// (busca + estado na URL), Solo e Fertilidade nunca escondendo valor observado por falta de
// homologação, síntese da Visão Geral com ação real, e comparativos com diferença calculada de
// verdade. Reaproveita as mesmas contas de e2e/tenant-isolation.spec.ts (ver e2e/README.md).
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

test("Mapas: ordem/parâmetro/status/satélite selecionados persistem na URL e sobrevivem a um reload (Bloco A)", async ({ page }) => {
  await login(page, TENANT_A_EMAIL, TENANT_A_PASSWORD);
  await page.goto("/mapas");
  await page.waitForTimeout(1000);

  const parameterSelect = page.locator(".map-explorer-toolbar select").first();
  const options = await parameterSelect.locator("option").allTextContents();
  test.skip(options.length < 2, "nenhum parâmetro disponível na primeira ordem agora -- nada de estado de parâmetro pra verificar.");

  const value = await parameterSelect.locator("option").nth(1).getAttribute("value");
  await parameterSelect.selectOption(value!);
  await page.waitForURL(new RegExp(`parametro=${value}`), { timeout: 5000 });
  await page.locator(".map-explorer-satellite-toggle input").check();
  await page.waitForURL(/satelite=1/, { timeout: 5000 });

  const urlBeforeReload = page.url();
  await page.reload({ waitUntil: "networkidle" });
  expect(page.url()).toBe(urlBeforeReload);
  await expect(page.locator(".map-explorer-toolbar select").first()).toHaveValue(value!);
  await expect(page.locator(".map-explorer-satellite-toggle input")).toBeChecked();
});

test("Mapas: busca filtra a lista de talhões por nome real (Bloco A)", async ({ page }) => {
  await login(page, TENANT_A_EMAIL, TENANT_A_PASSWORD);
  await page.goto("/mapas");
  await page.waitForTimeout(1000);

  const fieldNames = await page.locator(".map-explorer-list .field-order-item strong").allTextContents();
  test.skip(fieldNames.length < 2, "precisa de 2+ talhões reais no tenant A pra este teste.");
  const targetName = fieldNames[0];

  await page.locator(".map-explorer-search input").fill(targetName);
  await page.waitForTimeout(400);
  const visibleNames = await page.locator(".map-explorer-list .field-order-item strong").allTextContents();
  expect(visibleNames.every((n) => n === targetName)).toBe(true);
  expect(visibleNames.length).toBeGreaterThan(0);

  // A lista sempre mantém o talhão JÁ SELECIONADO visível mesmo que a busca não bata mais com ele
  // (decisão deliberada: não perder a seleção atual só por causa do texto digitado) -- por isso o
  // resultado esperado pra uma busca sem nenhuma correspondência é exatamente 1 (o selecionado), não 0.
  const selectedName = await page.locator(".map-explorer-list .field-order-item.active strong").textContent();
  await page.locator(".map-explorer-search input").fill("nome-que-nao-existe-em-nenhum-talhao-xyz");
  await page.waitForTimeout(400);
  const namesAfterNonsenseSearch = await page.locator(".map-explorer-list .field-order-item strong").allTextContents();
  expect(namesAfterNonsenseSearch).toEqual([selectedName]);
});

test("Talhão 360° · Solo e Fertilidade: mostra o valor observado real mesmo sem faixa homologada (Bloco B)", async ({ page }) => {
  await login(page, TENANT_A_EMAIL, TENANT_A_PASSWORD);
  const orders = await page.evaluate(async () => (await fetch("/api/collection-orders")).json());
  const withCollected = (orders.orders ?? []).find((o: any) => o.collectedPoints > 0);
  test.skip(!withCollected, "nenhuma ordem com pontos coletados agora -- nada de distribuição pra verificar.");
  if (!withCollected) return;

  await page.goto(`/talhoes/${withCollected.fieldId}?aba=evidencias&evidencia=solo&ordem=${withCollected.id}`, { waitUntil: "networkidle" });
  const select = page.locator(".field-overview-parameter-toolbar select");
  const options = await select.locator("option").allTextContents();
  test.skip(options.length < 2, "nenhum parâmetro disponível nesta ordem agora.");
  const value = await select.locator("option").nth(1).getAttribute("value");
  await select.selectOption(value!);
  await page.waitForTimeout(1000);

  // O painel de distribuição precisa mostrar contagem real -- nunca "sem dado" só porque falta faixa
  // homologada (o motivo de não interpretável é uma coisa separada de ter ou não o valor observado).
  const distribution = page.locator(".field-overview-distribution");
  await expect(distribution).toBeVisible();
  const statsText = await distribution.textContent();
  expect(statsText).toMatch(/AMOSTRAS COLETADAS/i);
});

test("Talhão 360° · Visão geral: 'próxima ação' é um link real, não texto genérico (Bloco C)", async ({ page }) => {
  await login(page, TENANT_A_EMAIL, TENANT_A_PASSWORD);
  const context = await page.evaluate(async () => (await fetch("/api/context")).json());
  const fieldId = context.fields?.[0]?.id;
  test.skip(!fieldId, "precisa de ao menos 1 talhão no tenant A.");

  await page.goto(`/talhoes/${fieldId}`, { waitUntil: "networkidle" });
  const actionLink = page.locator(".field-overview-synthesis-action");
  const emptyNote = page.locator(".field-overview-synthesis-col", { hasText: "PRÓXIMA AÇÃO" }).locator(".report-empty-note");
  const hasAction = await actionLink.count();
  const hasEmpty = await emptyNote.count();
  // Ou existe uma ação real (com destino navegável), ou o estado "sem pendência" está explícito --
  // nunca as duas coisas ausentes ao mesmo tempo (não pode ficar mudo).
  expect(hasAction + hasEmpty).toBeGreaterThan(0);
  if (hasAction) {
    const href = await actionLink.getAttribute("href");
    expect(href).toBeTruthy();
    await Promise.all([page.waitForURL((url) => !url.pathname.startsWith("/talhoes/"), { timeout: 5000 }), actionLink.click()]);
  }
});

test("Comparativos · Talhão×Talhão: diferença absoluta bate com avgB-avgA real (Bloco E)", async ({ page }) => {
  await login(page, TENANT_A_EMAIL, TENANT_A_PASSWORD);
  const context = await page.evaluate(async () => (await fetch("/api/context")).json());
  const fields = context.fields ?? [];
  test.skip(fields.length < 2, "precisa de 2+ talhões no tenant A pra comparar.");

  const data = await page.evaluate(async ({ a, b }) => {
    const r = await fetch(`/api/comparisons?mode=fields&a=${a}&b=${b}`);
    return { status: r.status, body: await r.json() };
  }, { a: fields[0].id, b: fields[1].id });

  expect(data.status).toBe(200);
  const rows = data.body.rows ?? [];
  test.skip(rows.length === 0, "nenhum parâmetro em comum entre os 2 primeiros talhões agora.");
  for (const row of rows) {
    if (row.comparable) {
      expect(row.avgA).not.toBeNull();
      expect(row.avgB).not.toBeNull();
      expect(Math.abs(row.absoluteDifference - (row.avgB - row.avgA))).toBeLessThan(0.001);
    } else {
      // Nunca marca "comparável" sem listar pelo menos um motivo real de incompatibilidade.
      expect(row.incompatibilityReasons.length).toBeGreaterThan(0);
    }
  }
});
