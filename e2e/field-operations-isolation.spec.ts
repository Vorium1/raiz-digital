import { test, expect, type Page } from "@playwright/test";

// Cobre lacunas explicitamente listadas em docs/V0.5_INTERRUPTED.md como pendentes de revisão:
// isolamento multiempresa (RLS) e RBAC nas rotas de ordem de coleta/pontos, e a regra que impede
// substituir pontos depois que a coleta já começou. Reaproveita as mesmas duas contas/tenants de
// e2e/tenant-isolation.spec.ts (ver e2e/README.md) — nenhuma conta nova precisou ser criada.
function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} precisa estar definida para rodar os testes e2e (ver e2e/README.md).`);
  return value;
}

const TENANT_A_EMAIL = "admin@raiz.local";
const TENANT_A_PASSWORD = requiredEnv("E2E_ADMIN_PASSWORD");
const TENANT_B_EMAIL = "e2e-tenant-b@raiz.local";
const TENANT_B_PASSWORD = requiredEnv("E2E_TENANT_B_PASSWORD");

// Dentro do boundary real do talhão de teste ("Talhão 3", tenant A) usado pelas outras suítes.
const INSIDE_FIELD_POINTS_CSV =
  "codigo;latitude;longitude\nT01;-28.256;-52.416\nT02;-28.254;-52.414\nT03;-28.252;-52.412\n";

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

test.describe("isolamento multiempresa — ordens de coleta e pontos", () => {
  // Identifica a ordem-fixture real e estável (grid de 81 pontos, ja usada pelas outras validações
  // manuais desta sessão) em vez de "a primeira da lista", que mudaria conforme outras suítes rodam.
  let orderAId: string;
  let pointAId: string;

  test("empresa B nao ve nenhuma ordem de coleta (so tem as da empresa A)", async ({ page }) => {
    await login(page, TENANT_B_EMAIL, TENANT_B_PASSWORD);
    const { status, payload } = await api(page, "/api/collection-orders");
    expect(status).toBe(200);
    expect(payload.orders).toEqual([]);
  });

  test("empresa B nao acessa map-layer, nao cancela, nao importa e nao coleta ponto de ordem da empresa A", async ({ page }) => {
    // Descobre o id real da ordem-fixture (grid de 81 pontos) + de um ponto dela, logado como A.
    await login(page, TENANT_A_EMAIL, TENANT_A_PASSWORD);
    const listA = await api(page, "/api/collection-orders");
    expect(listA.status).toBe(200);
    const orderA = listA.payload.orders.find((o: { plannedPoints: number; status: string }) => o.plannedPoints === 81 && o.status === "PLANNED");
    expect(orderA?.id).toBeTruthy();
    orderAId = orderA.id;
    const pointA = orderA.points[0];
    expect(pointA?.id).toBeTruthy();
    pointAId = pointA.id;
    await api(page, "/api/auth/logout", { method: "POST" });

    // Mesma aba, agora com sessao da empresa B, tentando as 4 operacoes contra os ids reais da empresa A.
    await login(page, TENANT_B_EMAIL, TENANT_B_PASSWORD);

    const mapLayer = await api(page, `/api/collection-orders/${orderAId}/map-layer`);
    expect(mapLayer.status).not.toBe(200);

    // body correto em todas (senao a rota rejeitaria por validacao de payload antes mesmo de chegar
    // no filtro por tenant, o que provaria validacao de input, nao isolamento) — a query com
    // tenant_id da sessao B nunca encontra a linha da empresa A, entao o resultado esperado e 404.
    const cancel = await api(page, `/api/collection-orders/${orderAId}`, { method: "PATCH", body: { status: "CANCELED" } });
    expect(cancel.status).toBe(404);

    const importPoints = await api(page, `/api/collection-orders/${orderAId}/points`, {
      method: "POST",
      body: { fileName: "pontos.csv", content: INSIDE_FIELD_POINTS_CSV },
    });
    expect(importPoints.status).toBe(404);

    const collect = await api(page, `/api/collection-orders/${orderAId}/points/${pointAId}`, {
      method: "PATCH",
      body: { latitude: -28.255, longitude: -52.415 },
    });
    expect(collect.status).toBe(404);
  });

  test("empresa A continua conseguindo ler e a ordem/ponto usados no teste continuam intactos", async ({ page }) => {
    // Confirma que as tentativas da empresa B acima (todas rejeitadas com 404) nao mudaram nada de
    // verdade: nao e so "retornou erro", a MESMA ordem/ponto atacados seguem exatamente como estavam.
    await login(page, TENANT_A_EMAIL, TENANT_A_PASSWORD);
    const listA = await api(page, "/api/collection-orders");
    expect(listA.status).toBe(200);
    const orderA = listA.payload.orders.find((o: { id: string }) => o.id === orderAId);
    expect(orderA).toBeTruthy();
    expect(orderA.status).toBe("PLANNED");
    const pointA = orderA.points.find((p: { id: string }) => p.id === pointAId);
    expect(pointA).toBeTruthy();
    expect(pointA.collectedAt).toBeNull();
    expect(pointA.observedLatitude).toBeNull();
  });
});

test.describe("regra: nao substituir pontos depois que a coleta comecou", () => {
  let orderId: string;

  test.afterAll(async ({ browser }) => {
    if (!orderId) return;
    const page = await browser.newPage();
    await login(page, TENANT_A_EMAIL, TENANT_A_PASSWORD);
    // Tentativa de limpeza best-effort: por regra de negócio (collections.ts, cancelCollectionOrder),
    // uma ordem só pode ser cancelada enquanto status === PLANNED. Este teste, de propósito, coleta um
    // ponto (o que muda o status para IN_PROGRESS) para provar o bloqueio de substituição — então esta
    // chamada sempre vai falhar com 409 aqui, e a ordem de 3 pontos de teste fica no banco de forma
    // permanente. É um resíduo pequeno, identificável (poucos pontos, sem dado de laudo) e inofensivo,
    // não um bug deste teste — não existe hoje um caminho para desfazer/apagar uma ordem já iniciada.
    // Se um dia vier a existir, esta chamada passa a limpar de verdade sem precisar mudar nada aqui.
    // Qualquer status diferente de 409 aqui é inesperado (nao o resultado documentado) e deve quebrar
    // o teste para nao esconder um problema novo de verdade.
    const cleanup = await api(page, `/api/collection-orders/${orderId}`, { method: "PATCH", body: { status: "CANCELED" } });
    if (cleanup.status !== 409) throw new Error(`limpeza de ${orderId} teve resultado inesperado: ${cleanup.status} ${JSON.stringify(cleanup.payload)}`);
    await page.close();
  });

  test("importar, coletar um ponto e depois tentar substituir tudo e bloqueado", async ({ page }) => {
    await login(page, TENANT_A_EMAIL, TENANT_A_PASSWORD);
    const listA = await api(page, "/api/collection-orders");
    const cropSeasonId = listA.payload.orders[0]?.cropSeasonId;
    expect(cropSeasonId).toBeTruthy();

    const created = await api(page, "/api/collection-orders", {
      method: "POST",
      body: { cropSeasonId, samplingStrategy: "IMPORTED", depthFromCm: 0, depthToCm: 20 },
    });
    expect(created.status).toBe(201);
    orderId = created.payload.order.id;

    const firstImport = await api(page, `/api/collection-orders/${orderId}/points`, {
      method: "POST",
      body: { fileName: "pontos.csv", content: INSIDE_FIELD_POINTS_CSV },
    });
    expect(firstImport.status).toBe(200);
    expect(firstImport.payload.imported).toBe(3);

    const layer = await api(page, `/api/collection-orders/${orderId}/map-layer`);
    const firstPointId = layer.payload.points[0]?.id;
    expect(firstPointId).toBeTruthy();

    const collect = await api(page, `/api/collection-orders/${orderId}/points/${firstPointId}`, {
      method: "PATCH",
      body: { latitude: -28.256, longitude: -52.416 },
    });
    expect(collect.status).toBe(200);

    const secondImport = await api(page, `/api/collection-orders/${orderId}/points`, {
      method: "POST",
      body: { fileName: "pontos2.csv", content: INSIDE_FIELD_POINTS_CSV },
    });
    expect(secondImport.status).toBe(409);
    expect(secondImport.payload.error).toMatch(/coleta foi iniciada/i);
  });
});

test.describe("concorrencia: duas importacoes simultaneas na mesma ordem nova", () => {
  let orderId: string;

  test.afterAll(async ({ browser }) => {
    if (!orderId) return;
    const page = await browser.newPage();
    await login(page, TENANT_A_EMAIL, TENANT_A_PASSWORD);
    // Nunca coleta ponto nenhum neste teste, entao o status continua PLANNED — cancelamento aqui
    // deve funcionar sempre, sem a limitação documentada no describe anterior.
    const cancel = await api(page, `/api/collection-orders/${orderId}`, { method: "PATCH", body: { status: "CANCELED" } });
    if (cancel.status !== 200) throw new Error(`limpeza falhou ao cancelar ${orderId}: ${cancel.status} ${JSON.stringify(cancel.payload)}`);
    await page.close();
  });

  test("duas importacoes concorrentes nao duplicam nem corrompem os pontos", async ({ page }) => {
    await login(page, TENANT_A_EMAIL, TENANT_A_PASSWORD);
    const listA = await api(page, "/api/collection-orders");
    const cropSeasonId = listA.payload.orders[0]?.cropSeasonId;

    const created = await api(page, "/api/collection-orders", {
      method: "POST",
      body: { cropSeasonId, samplingStrategy: "IMPORTED", depthFromCm: 0, depthToCm: 20 },
    });
    orderId = created.payload.order.id;

    const [first, second] = await Promise.all([
      api(page, `/api/collection-orders/${orderId}/points`, { method: "POST", body: { fileName: "a.csv", content: INSIDE_FIELD_POINTS_CSV } }),
      api(page, `/api/collection-orders/${orderId}/points`, { method: "POST", body: { fileName: "b.csv", content: INSIDE_FIELD_POINTS_CSV } }),
    ]);
    expect([first.status, second.status]).toContain(200);

    const layer = await api(page, `/api/collection-orders/${orderId}/map-layer`);
    // replaceExisting por padrao apaga e reinsere: mesmo com 2 chamadas concorrentes, o resultado
    // final tem que ser exatamente um conjunto (3 pontos), nunca 6 (duplicado) nem 0 (corrompido).
    expect(layer.payload.points.length).toBe(3);
  });
});

test.describe("regra: distancia maxima entre GPS observado e ponto planejado", () => {
  // Formula real (collections.ts, collectSamplePoint): permitido = maior entre 75m, precisao*2 e
  // (lado do grid)/2. Para uma ordem sem grid (gridAreaHa nulo) e sem accuracyM informado, o piso é
  // sempre 75m — é esse piso que os dois casos abaixo testam, com um ponto real do talhão de teste.
  let orderId: string;

  test.afterAll(async ({ browser }) => {
    if (!orderId) return;
    const page = await browser.newPage();
    await login(page, TENANT_A_EMAIL, TENANT_A_PASSWORD);
    // Mesma limitação documentada no describe "regra: nao substituir...": depois que a 2a coleta
    // (dentro do limite) for bem-sucedida o status vira IN_PROGRESS e cancelar deixa de ser possível.
    await api(page, `/api/collection-orders/${orderId}`, { method: "PATCH", body: { status: "CANCELED" } });
    await page.close();
  });

  test("rejeita GPS a ~224m (fora do limite) e aceita a ~20m (dentro do limite) do mesmo ponto", async ({ page }) => {
    await login(page, TENANT_A_EMAIL, TENANT_A_PASSWORD);
    const listA = await api(page, "/api/collection-orders");
    const cropSeasonId = listA.payload.orders[0]?.cropSeasonId;

    const created = await api(page, "/api/collection-orders", {
      method: "POST",
      body: { cropSeasonId, samplingStrategy: "IMPORTED", depthFromCm: 0, depthToCm: 20 },
    });
    orderId = created.payload.order.id;
    await api(page, `/api/collection-orders/${orderId}/points`, {
      method: "POST",
      body: { fileName: "pontos.csv", content: INSIDE_FIELD_POINTS_CSV }, // T01 em -28.256,-52.416
    });
    const layer = await api(page, `/api/collection-orders/${orderId}/map-layer`);
    const pointId = layer.payload.points.find((p: { code: string }) => p.code === "T01")?.id;
    expect(pointId).toBeTruthy();

    // ~100m ao norte + ~200m a leste de T01 = ~224m de distância (dist. euclidiana), acima do piso de 75m.
    const tooFar = await api(page, `/api/collection-orders/${orderId}/points/${pointId}`, {
      method: "PATCH",
      body: { latitude: -28.255102, longitude: -52.41396 },
    });
    expect(tooFar.status).toBe(409);
    expect(tooFar.payload.details?.allowedMeters).toBe(75);
    expect(tooFar.payload.details?.distanceMeters).toBeGreaterThan(75);

    // confirma que a rejeicao nao gravou nada: o ponto continua sem coleta.
    const layerAfterReject = await api(page, `/api/collection-orders/${orderId}/map-layer`);
    expect(layerAfterReject.payload.points.find((p: { id: string }) => p.id === pointId)?.collectedAt).toBeNull();

    // ~20m ao norte de T01, dentro do piso de 75m — deve suceder.
    const closeEnough = await api(page, `/api/collection-orders/${orderId}/points/${pointId}`, {
      method: "PATCH",
      body: { latitude: -28.25582, longitude: -52.416 },
    });
    expect(closeEnough.status).toBe(200);
  });
});
