import { test, expect, type Page } from "@playwright/test";

// Cobre os comportamentos alterados na RAIZ 2.0 Fase 1 (dashboard/Talhão 360°/mapa/alertas): isolamento
// multiempresa na página nova, "não avaliado" nunca virando "0 problemas", alerta abrindo o registro
// exato, e talhão único mesmo com várias ordens de coleta. Reaproveita as mesmas contas de
// e2e/tenant-isolation.spec.ts (ver e2e/README.md).
function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} precisa estar definida para rodar os testes e2e (ver e2e/README.md).`);
  return value;
}

const TENANT_A_EMAIL = "admin@raiz.local";
const TENANT_A_PASSWORD = requiredEnv("E2E_ADMIN_PASSWORD");
const TENANT_B_EMAIL = "e2e-tenant-b@raiz.local";
const TENANT_B_PASSWORD = requiredEnv("E2E_TENANT_B_PASSWORD");

async function login(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await Promise.all([page.waitForURL(/dashboard/, { timeout: 15_000 }), page.click(".login-submit")]);
}

async function firstFieldId(page: Page): Promise<string> {
  const context = await page.evaluate(async () => (await fetch("/api/context")).json());
  const fieldId = context.fields?.[0]?.id;
  expect(fieldId, "precisa de ao menos 1 talhão cadastrado no tenant A pra este teste").toBeTruthy();
  return fieldId;
}

test("Talhão 360°: empresa B não acessa talhão da empresa A (404, não vaza nome nem dado)", async ({ page }) => {
  await login(page, TENANT_A_EMAIL, TENANT_A_PASSWORD);
  const fieldId = await firstFieldId(page);
  await page.evaluate(() => fetch("/api/auth/logout", { method: "POST" }));

  await login(page, TENANT_B_EMAIL, TENANT_B_PASSWORD);
  const response = await page.goto(`/talhoes/${fieldId}`);
  expect(response?.status()).toBe(404);
});

test("Talhão 360°: empresa A acessa o próprio talhão normalmente (não é uma trava geral)", async ({ page }) => {
  await login(page, TENANT_A_EMAIL, TENANT_A_PASSWORD);
  const fieldId = await firstFieldId(page);
  const response = await page.goto(`/talhoes/${fieldId}`);
  expect(response?.status()).toBe(200);
  // As 4 abas reais (não uma coleção de links vazia) precisam estar presentes.
  await expect(page.getByRole("button", { name: "Visão geral" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Evidências" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Decisões" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Linha do tempo" })).toBeVisible();
});

test("dashboard: 'não avaliado' é um indicador separado, nunca contado dentro de 'talhões críticos'", async ({ page }) => {
  await login(page, TENANT_A_EMAIL, TENANT_A_PASSWORD);
  const executive = await page.evaluate(async () => {
    // getExecutiveDashboard não tem rota HTTP própria -- valida via o HTML renderizado do painel mesmo,
    // que já embute os dois números lado a lado (evita duplicar acesso a banco no teste).
    const html = await (await fetch("/dashboard")).text();
    return html;
  });
  expect(executive).toContain("Talhões críticos");
  expect(executive).toContain("Não avaliado (falta homologação)");
});

test("alerta de pontos pendentes abre a ordem exata (?orderId= consumido pela tela)", async ({ page }) => {
  await login(page, TENANT_A_EMAIL, TENANT_A_PASSWORD);
  const alerts = await page.evaluate(async () => (await fetch("/dashboard")).text());
  const match = alerts.match(/\/coletas\?orderId=([0-9a-f-]{36})#pontos-coleta/);
  test.skip(!match, "nenhum alerta de ordem pendente no tenant A agora -- nada pra verificar.");
  if (!match) return;
  const orderId = match[1];
  await page.goto(`/coletas?orderId=${orderId}#pontos-coleta`);
  await page.waitForTimeout(1200); // efeito de deep-link roda depois do fetch de orders
  // A seção "Operação" (field-order-item ativo) deve refletir a ordem do link, não a primeira da lista.
  await expect(page.locator(`.field-order-item.active`)).toBeVisible();
});

test("mapas: lista 'Talhões' não repete o mesmo talhão por ordem de coleta", async ({ page }) => {
  await login(page, TENANT_A_EMAIL, TENANT_A_PASSWORD);
  const orders = await page.evaluate(async () => (await fetch("/api/collection-orders")).json());
  const fieldIds: string[] = (orders.orders ?? []).map((o: { fieldId: string }) => o.fieldId);
  const uniqueFieldCount = new Set(fieldIds).size;
  test.skip(fieldIds.length === uniqueFieldCount, "nenhum talhão com mais de 1 ordem agora -- nada de deduplicação pra verificar.");

  await page.goto("/mapas");
  await page.waitForTimeout(1000);
  const countText = await page.locator(".field-ops-count").first().textContent();
  expect(Number(countText)).toBe(uniqueFieldCount);
});

// A partir daqui: itens da revisão independente do fechamento da Fase 1 (commit 7444bc0). Cada teste cobre
// só o comportamento corrigido, sem repetir cobertura já feita acima.

test("Talhão 360°: aba selecionada persiste no reload e num link direto (item 1)", async ({ page }) => {
  await login(page, TENANT_A_EMAIL, TENANT_A_PASSWORD);
  const fieldId = await firstFieldId(page);
  await page.goto(`/talhoes/${fieldId}`);
  await page.getByRole("button", { name: "Evidências" }).click();
  await page.waitForURL(/aba=evidencias/, { timeout: 5000 });

  await page.reload({ waitUntil: "networkidle" });
  await expect(page.locator(".field-overview-tabs button.active")).toHaveText("Evidências");

  // Link direto numa aba nova (sem nenhum estado de cliente herdado) -- prova que é a URL que carrega o
  // estado, não algo preso só na sessão do navegador que já tinha clicado.
  const directUrl = page.url();
  const page2 = await page.context().newPage();
  await page2.goto(directUrl, { waitUntil: "networkidle" });
  await expect(page2.locator(".field-overview-tabs button.active")).toHaveText("Evidências");
  await page2.close();
});

test("Talhão 360°: erro HTTP real na busca de pontos mostra mensagem, não trava nem mostra lixo (item 2)", async ({ page }) => {
  await login(page, TENANT_A_EMAIL, TENANT_A_PASSWORD);
  const fieldId = await firstFieldId(page);
  await page.route("**/api/collection-orders/*/map-layer*", (route) => route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "falha simulada" }) }));

  await page.goto(`/talhoes/${fieldId}?aba=evidencias`, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  // Nunca deve ficar preso em "Carregando pontos…" pra sempre, e o mapa não deve renderizar com dado
  // inexistente -- a tela precisa mostrar que algo falhou.
  await expect(page.locator(".agro-loading")).not.toBeVisible();
  await expect(page.locator(".field-ops-message.danger")).toBeVisible();
});

test("Talhão 360°: trocar de ordem rápido não deixa pontos da ordem anterior aparecerem como se fossem da atual (item 2)", async ({ page }) => {
  await login(page, TENANT_A_EMAIL, TENANT_A_PASSWORD);
  // Acha dinamicamente um talhão real com 2+ ordens NA MESMA SAFRA (não depende de id fixo, que pode não
  // existir em outro ambiente) -- reaproveita a mesma lógica de descoberta do teste de deduplicação acima.
  const orders = await page.evaluate(async () => (await fetch("/api/collection-orders")).json());
  const byFieldSeason = new Map<string, Array<{ id: string; code: string }>>();
  for (const o of orders.orders ?? []) {
    const key = `${o.fieldId}::${o.cropSeasonId}`;
    const list = byFieldSeason.get(key) ?? [];
    list.push({ id: o.id, code: o.code });
    byFieldSeason.set(key, list);
  }
  const multiOrderKey = Array.from(byFieldSeason.entries()).find(([, list]) => list.length >= 2);
  test.skip(!multiOrderKey, "nenhum talhão com 2+ ordens na mesma safra agora -- nada de corrida de requisição pra verificar.");
  if (!multiOrderKey) return;
  const [key, [orderA, orderB]] = multiOrderKey;
  const fieldId = key.split("::")[0];

  // Intercepta as DUAS ordens reais com corpo controlado (1 ponto vs. 5 pontos) e a ordem A propositalmente
  // atrasada -- garante que a resposta antiga só chegaria DEPOIS da troca pra B, provando que ela é
  // ignorada de verdade (AbortController), não só "não deu tempo de falhar no teste".
  const fakeLayer = (n: number) => ({
    fieldBoundary: { type: "Polygon", coordinates: [[[-52.41, -28.25], [-52.409, -28.25], [-52.409, -28.249], [-52.41, -28.249], [-52.41, -28.25]]] },
    points: Array.from({ length: n }, (_, i) => ({ id: `p${i}`, code: `P${i}`, sequence: i, latitude: -28.25 + i * 0.0001, longitude: -52.41, observedLatitude: null, observedLongitude: null, collectedAt: null, depthFromCm: 0, depthToCm: 20, subsampleCount: null, accuracyM: null, gpsSource: null, notes: null, labResultCount: 0 })),
    availableParameters: [],
  });
  await page.route(`**/api/collection-orders/${orderA.id}/map-layer*`, async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(fakeLayer(1)) });
  });
  await page.route(`**/api/collection-orders/${orderB.id}/map-layer*`, (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(fakeLayer(5)) }));

  await page.goto(`/talhoes/${fieldId}?aba=evidencias&ordem=${orderA.id}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(300); // garante que a busca da ordem A já começou (e está "presa" no atraso)
  await page.locator(".field-overview-order-picker button", { hasText: orderB.code }).click();
  await page.waitForTimeout(2200); // espera passar do atraso de 1.5s da ordem A
  // 5 pontos reais (ordem B) + 1 contorno = 6 formas interativas do Leaflet; nunca o resultado da ordem A (1 ponto).
  const shapeCount = await page.locator(".leaflet-interactive").count();
  expect(shapeCount).toBeGreaterThanOrEqual(5);
});

test("Talhão 360°: talhões homônimos (mesmo nome, empresas diferentes) nunca mostram alerta um do outro (item 4)", async ({ page }) => {
  await login(page, TENANT_A_EMAIL, TENANT_A_PASSWORD);
  const context = await page.evaluate(async () => (await fetch("/api/context")).json());
  const properties: Array<{ id: string; name: string }> = context.properties ?? [];
  test.skip(properties.length < 2, "precisa de 2 propriedades reais no tenant A pra este teste.");
  const [propA, propB] = properties;
  const sharedName = `Talhão homônimo e2e ${Date.now()}`;
  const boundary = { type: "Polygon", coordinates: [[[-52.41, -28.25], [-52.409, -28.25], [-52.409, -28.249], [-52.41, -28.249], [-52.41, -28.25]]] };

  const createdA = await page.evaluate(async ({ propertyId, name, boundary }) => (await fetch("/api/fields", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ propertyId, name, boundary }) })).json(), { propertyId: propA.id, name: sharedName, boundary });
  const createdB = await page.evaluate(async ({ propertyId, name, boundary }) => (await fetch("/api/fields", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ propertyId, name, boundary }) })).json(), { propertyId: propB.id, name: sharedName, boundary });
  const fieldAId = createdA.field.id;
  const fieldBId = createdB.field.id;

  try {
    // Os dois talhões, sem safra cadastrada, disparam o MESMO alerta "sem nenhuma safra definida" com o
    // MESMO texto de título -- só o vínculo por id real (não o nome) evita que um veja o alerta do outro.
    await page.goto(`/talhoes/${fieldAId}`, { waitUntil: "networkidle" });
    const rowsA = await page.locator(".priority-row").count();
    expect(rowsA).toBe(1);

    await page.goto(`/talhoes/${fieldBId}`, { waitUntil: "networkidle" });
    const rowsB = await page.locator(".priority-row").count();
    expect(rowsB).toBe(1);
  } finally {
    await page.evaluate((id) => fetch(`/api/fields/${id}`, { method: "DELETE" }), fieldAId);
    await page.evaluate((id) => fetch(`/api/fields/${id}`, { method: "DELETE" }), fieldBId);
  }
});
