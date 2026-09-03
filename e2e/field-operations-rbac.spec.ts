import { test, expect, type Page } from "@playwright/test";

// Fecha a última pendência de docs/V0.5_INTERRUPTED.md sobre operações de campo: RBAC por papel nas
// rotas de ordem de coleta/pontos. A checagem (`writeRoles` em cada rota) já existia no código; o que
// faltava era um teste automatizado. Usa as 4 contas fixas de e2e/README.md (uma por papel, mesmo
// tenant "Raiz Digital Demo") — nenhuma conta nova foi criada.
function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} precisa estar definida para rodar os testes e2e (ver e2e/README.md).`);
  return value;
}

const ACCOUNTS = {
  agronomist: { email: "rbac-agronomist@raiz.local", password: requiredEnv("E2E_RBAC_AGRONOMIST_PASSWORD"), canWrite: true },
  fieldTech: { email: "rbac-field-tech@raiz.local", password: requiredEnv("E2E_RBAC_FIELD_TECH_PASSWORD"), canWrite: true },
  commercial: { email: "rbac-commercial@raiz.local", password: requiredEnv("E2E_RBAC_COMMERCIAL_PASSWORD"), canWrite: false },
  viewer: { email: "rbac-viewer@raiz.local", password: requiredEnv("E2E_RBAC_VIEWER_PASSWORD"), canWrite: false },
} as const;

const INSIDE_FIELD_POINTS_CSV = "codigo;latitude;longitude\nT01;-28.256;-52.416\nT02;-28.254;-52.414\n";

async function login(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
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

for (const [roleKey, account] of Object.entries(ACCOUNTS)) {
  test(`${roleKey}: leitura sempre permitida; escrita ${account.canWrite ? "permitida" : "bloqueada (403)"}`, async ({ page }) => {
    await login(page, account.email, account.password);

    // Leitura: nunca teve checagem de papel nas rotas GET (só sessão) — vale para os 4 papéis.
    const list = await api(page, "/api/collection-orders");
    expect(list.status).toBe(200);
    const existingOrder = list.payload.orders.find((o: { plannedPoints: number }) => o.plannedPoints > 0);
    if (existingOrder) {
      const layer = await api(page, `/api/collection-orders/${existingOrder.id}/map-layer`);
      expect(layer.status).toBe(200);
    }

    const cropSeasonId = list.payload.orders[0]?.cropSeasonId;
    expect(cropSeasonId).toBeTruthy();

    const create = await api(page, "/api/collection-orders", {
      method: "POST",
      body: { cropSeasonId, samplingStrategy: "IMPORTED", depthFromCm: 0, depthToCm: 20 },
    });

    if (!account.canWrite) {
      expect(create.status).toBe(403);
      // Sem ordem criada, não há mais nada pra tentar/limpar pra este papel.
      return;
    }

    expect(create.status).toBe(201);
    const orderId = create.payload.order.id;
    try {
      const imported = await api(page, `/api/collection-orders/${orderId}/points`, {
        method: "POST",
        body: { fileName: "pontos.csv", content: INSIDE_FIELD_POINTS_CSV },
      });
      expect(imported.status).toBe(200);

      const layer = await api(page, `/api/collection-orders/${orderId}/map-layer`);
      const pointId = layer.payload.points[0]?.id;
      const collect = await api(page, `/api/collection-orders/${orderId}/points/${pointId}`, {
        method: "PATCH",
        body: { latitude: -28.256, longitude: -52.416 },
      });
      expect(collect.status).toBe(200);
    } finally {
      // best-effort: depois da coleta acima o status vira IN_PROGRESS e cancelar não é mais possível
      // (mesma limitação documentada em field-operations-isolation.spec.ts) — resíduo pequeno esperado.
      await api(page, `/api/collection-orders/${orderId}`, { method: "PATCH", body: { status: "CANCELED" } });
    }
  });
}

test("viewer e comercial tambem sao bloqueados ao tentar cancelar ou coletar ponto numa ordem existente", async ({ page }) => {
  // As duas contas com escrita bloqueada acima nunca chegam a criar ordem própria; este teste confirma
  // que o bloqueio vale também para cancelar/importar/coletar numa ordem real já existente de outro papel.
  await login(page, ACCOUNTS.agronomist.email, ACCOUNTS.agronomist.password);
  const listAsWriter = await api(page, "/api/collection-orders");
  const targetOrder = listAsWriter.payload.orders.find((o: { plannedPoints: number; status: string }) => o.plannedPoints > 0 && o.status === "PLANNED");
  expect(targetOrder).toBeTruthy();
  const targetPointId = targetOrder.points[0]?.id;
  await api(page, "/api/auth/logout", { method: "POST" });

  for (const denied of [ACCOUNTS.viewer, ACCOUNTS.commercial]) {
    await login(page, denied.email, denied.password);
    const cancel = await api(page, `/api/collection-orders/${targetOrder.id}`, { method: "PATCH", body: { status: "CANCELED" } });
    expect(cancel.status).toBe(403);
    const collect = await api(page, `/api/collection-orders/${targetOrder.id}/points/${targetPointId}`, {
      method: "PATCH",
      body: { latitude: -28.25, longitude: -52.41 },
    });
    expect(collect.status).toBe(403);
    await api(page, "/api/auth/logout", { method: "POST" });
  }
});
