import { test, expect, type Page } from "@playwright/test";
import { Client } from "pg";

// Cobre a alavanca de controle de custo adicionada em 32b0063 ("limite mensal de prescricao por IA,
// por empresa cliente"): a rota de gerar prescrição recusa com 429 ANTES de tentar chamar qualquer
// provedor de IA quando a empresa já esgotou o limite do mês. Reaproveita `admin@raiz.local` (já
// TENANT_ADMIN da "Raiz Digital Demo", ver e2e/README.md) — nenhuma conta nova criada. Mexe direto no
// banco só pra baixar/restaurar o limite da empresa (não existe rota de API pra isso, de propósito: o
// próprio cliente não deve poder mudar o próprio teto) — sempre restaura o valor original, mesmo se o
// teste falhar no meio.
const EMAIL = "admin@raiz.local";
const PASSWORD = (() => {
  const value = process.env.E2E_ADMIN_PASSWORD;
  if (!value) throw new Error("E2E_ADMIN_PASSWORD precisa estar definida para rodar os testes e2e (ver e2e/README.md).");
  return value;
})();
const TENANT_NAME = "Raiz Digital Demo";

function dbUrl() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL precisa estar definida para rodar os testes e2e (mesma variável usada pelo `npm run dev`).");
  return url;
}

async function withDb<T>(work: (client: Client) => Promise<T>) {
  const client = new Client({ connectionString: dbUrl(), ssl: process.env.DATABASE_SSL === "require" ? { rejectUnauthorized: false } : undefined });
  await client.connect();
  try {
    return await work(client);
  } finally {
    await client.end();
  }
}

async function getLimit(): Promise<number> {
  return withDb(async (client) => {
    const result = await client.query("SELECT monthly_prescription_limit FROM tenants WHERE trade_name = $1", [TENANT_NAME]);
    if (!result.rows[0]) throw new Error(`Empresa "${TENANT_NAME}" não encontrada.`);
    return result.rows[0].monthly_prescription_limit;
  });
}

async function setLimit(value: number) {
  await withDb((client) => client.query("UPDATE tenants SET monthly_prescription_limit = $1 WHERE trade_name = $2", [value, TENANT_NAME]));
}

async function login(page: Page) {
  await page.goto("/login");
  await page.fill('input[name="email"]', EMAIL);
  await page.fill('input[name="password"]', PASSWORD);
  await Promise.all([page.waitForURL(/dashboard/, { timeout: 15_000 }), page.click(".login-submit")]);
}

async function api(page: Page, url: string, init?: { method?: string; body?: unknown }) {
  return page.evaluate(
    async ({ url, method, body }) => {
      const res = await fetch(url, {
        method: method ?? "GET",
        headers: body !== undefined ? { "content-type": "application/json" } : undefined,
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
      return { status: res.status, payload: await res.json().catch(() => ({})) };
    },
    { url, method: init?.method, body: init?.body },
  );
}

let originalLimit: number;
test.beforeAll(async () => { originalLimit = await getLimit(); });
test.afterAll(async () => { await setLimit(originalLimit); });

test("limite mensal zerado bloqueia a geracao de prescricao com 429, antes de chamar qualquer IA", async ({ page }) => {
  await setLimit(0);
  await login(page);

  const usage = await api(page, "/api/analyses/00000000-0000-0000-0000-000000000000/agronomic-prescription");
  expect(usage.status).toBe(200);
  expect(usage.payload.usage).toEqual({ monthlyLimit: 0, usedThisMonth: 0 });

  // ID de análise inexistente de propósito: a checagem de limite acontece antes de buscar a análise,
  // então o 429 tem que aparecer mesmo sem nenhum dado real por trás — prova que a ordem das checagens
  // está certa (custo nunca é arriscado antes do teto ser verificado).
  const blocked = await api(page, "/api/analyses/00000000-0000-0000-0000-000000000000/agronomic-prescription", { method: "POST" });
  expect(blocked.status).toBe(429);
  expect(blocked.payload.error).toContain("0/0");

  await setLimit(50);
  const restored = await api(page, "/api/analyses/00000000-0000-0000-0000-000000000000/agronomic-prescription");
  expect(restored.payload.usage.monthlyLimit).toBe(50);
});
