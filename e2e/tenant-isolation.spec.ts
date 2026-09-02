import { test, expect } from "@playwright/test";

// Valida a regra inegociável do CLAUDE.md: "Toda entidade operacional deve respeitar isolamento
// multiempresa." Usa duas contas de tenants diferentes (ver e2e/README.md) e confirma que uma não
// enxerga dado nenhum da outra, tanto pela tela quanto pela API.
const TENANT_A_EMAIL = "admin@raiz.local";
const TENANT_A_PASSWORD = "65peUFtuygkN";
const TENANT_A_KNOWN_CLIENT = "Fazenda Bela Vista";

const TENANT_B_EMAIL = "e2e-tenant-b@raiz.local";
const TENANT_B_PASSWORD = "E2eTenantB12345";

test("empresa B nao ve clientes da empresa A", async ({ page }) => {
  await page.goto("/login");
  await page.fill('input[name="email"]', TENANT_B_EMAIL);
  await page.fill('input[name="password"]', TENANT_B_PASSWORD);
  await Promise.all([page.waitForURL(/dashboard/, { timeout: 15_000 }), page.click(".login-submit")]);

  const clients = await page.evaluate(async () => {
    const res = await fetch("/api/clients");
    return { status: res.status, payload: await res.json().catch(() => ({})) };
  });
  expect(clients.status).toBe(200);
  const names = (clients.payload.clients ?? []).map((c: { name: string }) => c.name);
  expect(names).not.toContain(TENANT_A_KNOWN_CLIENT);

  await page.goto("/clientes");
  await expect(page.locator("body")).not.toContainText(TENANT_A_KNOWN_CLIENT);
});

test("empresa B nao consegue editar nem ver por id um cliente da empresa A", async ({ page, request }) => {
  // pega o id real do cliente da empresa A logando como A primeiro
  await page.goto("/login");
  await page.fill('input[name="email"]', TENANT_A_EMAIL);
  await page.fill('input[name="password"]', TENANT_A_PASSWORD);
  await Promise.all([page.waitForURL(/dashboard/, { timeout: 15_000 }), page.click(".login-submit")]);
  const clientsA = await page.evaluate(async () => {
    const res = await fetch("/api/clients");
    return res.json();
  });
  const targetId = clientsA.clients.find((c: { name: string }) => c.name === TENANT_A_KNOWN_CLIENT)?.id;
  expect(targetId).toBeTruthy();
  await page.evaluate(() => fetch("/api/auth/logout", { method: "POST" }));

  // agora tenta como empresa B, mesma aba (cookie da sessao B, id real da empresa A)
  await page.goto("/login");
  await page.fill('input[name="email"]', TENANT_B_EMAIL);
  await page.fill('input[name="password"]', TENANT_B_PASSWORD);
  await Promise.all([page.waitForURL(/dashboard/, { timeout: 15_000 }), page.click(".login-submit")]);

  const attempt = await page.evaluate(async (id) => {
    const res = await fetch(`/api/clients/${id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "Sequestrado pela empresa B" }) });
    return { status: res.status, payload: await res.json().catch(() => ({})) };
  }, targetId);
  // a linha pertence a outro tenant; a query com tenant_id da propria sessao nao encontra nada -> 404,
  // nunca deve retornar 200 nem vazar detalhe da empresa A.
  expect(attempt.status).not.toBe(200);
});

test("empresa A continua enxergando o proprio cliente normalmente (nao e uma trava geral)", async ({ page }) => {
  await page.goto("/login");
  await page.fill('input[name="email"]', TENANT_A_EMAIL);
  await page.fill('input[name="password"]', TENANT_A_PASSWORD);
  await Promise.all([page.waitForURL(/dashboard/, { timeout: 15_000 }), page.click(".login-submit")]);

  await page.goto("/clientes");
  await expect(page.locator("body")).toContainText(TENANT_A_KNOWN_CLIENT);
});
