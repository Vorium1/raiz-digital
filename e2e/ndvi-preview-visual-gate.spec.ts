import { test, expect, type Page } from "@playwright/test";

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} precisa estar definida para rodar o QA visual do Preview.`);
  return value;
}

const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? "admin@raiz.local";
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD?.trim() ?? "";
const SESSION_TOKEN = process.env.E2E_SESSION_TOKEN?.trim() ?? "";

if (!ADMIN_PASSWORD && !SESSION_TOKEN) {
  throw new Error("E2E_ADMIN_PASSWORD ou E2E_SESSION_TOKEN precisa estar definido para rodar o QA visual.");
}

async function login(page: Page) {
  if (SESSION_TOKEN) {
    const baseUrl = new URL(requiredEnv("E2E_BASE_URL"));
    await page.context().addCookies([{
      name: "raiz_session",
      value: SESSION_TOKEN,
      domain: baseUrl.hostname,
      path: "/",
      httpOnly: true,
      secure: baseUrl.protocol === "https:",
      sameSite: "Lax",
    }]);
    await page.goto("/inicio");
    const currentUrl = new URL(page.url());
    if (
      currentUrl.hostname !== baseUrl.hostname
      || /\/login(?:\/|$|\?)/.test(currentUrl.pathname + currentUrl.search)
    ) {
      throw new Error("E2E_SESSION_TOKEN não foi aceito pelo Preview.");
    }
    return;
  }

  await page.goto("/login");
  await page.fill('input[name="email"]', ADMIN_EMAIL);
  await page.fill('input[name="password"]', ADMIN_PASSWORD);
  await Promise.all([
    page.waitForURL((url) => /\/(dashboard|inicio)(?:\/|$|\?)/.test(url.pathname + url.search), { timeout: 20_000 }),
    page.click(".login-submit"),
  ]);
}

type NdviPayload = {
  latest?: { capturedAt?: string | null } | null;
  history?: Array<{
    capturedAt: string;
    rasterObjectKey?: string | null;
  }>;
  fieldBoundary?: {
    type: "Polygon" | "MultiPolygon";
    coordinates: unknown;
  } | null;
};

function flattenCoordinates(value: unknown, out: Array<[number, number]> = []): Array<[number, number]> {
  if (!Array.isArray(value)) return out;
  if (
    value.length >= 2
    && typeof value[0] === "number"
    && typeof value[1] === "number"
    && Number.isFinite(value[0])
    && Number.isFinite(value[1])
  ) {
    out.push([value[0], value[1]]);
    return out;
  }
  for (const item of value) flattenCoordinates(item, out);
  return out;
}

async function fieldWithArchivedNdvi(page: Page) {
  const contextResult = await page.evaluate(async () => {
    const response = await fetch("/api/context", { cache: "no-store" });
    let body: any = null;
    try { body = await response.json(); } catch {}
    return { status: response.status, ok: response.ok, body };
  });

  expect(
    contextResult.ok,
    `/api/context deveria responder 2xx no Preview autenticado; status=${contextResult.status}; body=${JSON.stringify(contextResult.body)}`,
  ).toBe(true);

  const fields: Array<{ id: string; name?: string }> = contextResult.body?.fields ?? [];
  expect(fields.length, "A homologação da #84 deve expor pelo menos um talhão à sessão E2E.").toBeGreaterThan(0);

  const diagnostics: Array<Record<string, unknown>> = [];
  for (const field of fields) {
    const result = await page.evaluate(async (fieldId) => {
      const response = await fetch(`/api/fields/${fieldId}/ndvi`, { cache: "no-store" });
      let body: any = null;
      try { body = await response.json(); } catch {}
      return { status: response.status, ok: response.ok, body };
    }, field.id);

    const payload = result.body as NdviPayload | null;
    diagnostics.push({
      fieldId: field.id,
      fieldName: field.name ?? field.id,
      status: result.status,
      ok: result.ok,
      hasBoundary: Boolean(payload?.fieldBoundary),
      historyCount: Array.isArray(payload?.history) ? payload!.history!.length : 0,
      archivedCount: Array.isArray(payload?.history)
        ? payload!.history!.filter((snapshot) => Boolean(snapshot.rasterObjectKey)).length
        : 0,
      error: (result.body as any)?.error ?? null,
    });

    if (!result.ok || !payload?.fieldBoundary) continue;
    let effectivePayload = payload;
    let archived = (effectivePayload.history ?? []).find((snapshot) => Boolean(snapshot.rasterObjectKey));

    if (!archived?.capturedAt) {
      const refresh = await page.evaluate(async (fieldId) => {
        const response = await fetch(`/api/fields/${fieldId}/ndvi`, { method: "POST" });
        let body: any = null;
        try { body = await response.json(); } catch {}
        return { status: response.status, ok: response.ok, body };
      }, field.id);

      diagnostics.push({
        fieldId: field.id,
        refreshStatus: refresh.status,
        refreshOk: refresh.ok,
        refreshError: refresh.body?.error ?? refresh.body?.partialFailure?.error ?? null,
        refreshArchivedCount: Array.isArray(refresh.body?.history)
          ? refresh.body.history.filter((snapshot: any) => Boolean(snapshot.rasterObjectKey)).length
          : 0,
      });

      if (refresh.ok) {
        effectivePayload = refresh.body as NdviPayload;
        archived = (effectivePayload.history ?? []).find((snapshot) => Boolean(snapshot.rasterObjectKey));
      }
    }

    if (archived?.capturedAt) {
      return {
        fieldId: field.id,
        fieldName: field.name ?? field.id,
        rasterDate: archived.capturedAt.slice(0, 10),
        boundary: effectivePayload.fieldBoundary ?? payload.fieldBoundary,
      };
    }
  }

  throw new Error(`Nenhum raster NDVI arquivado ficou acessível pela API do Preview após refresh seguro. Diagnóstico: ${JSON.stringify(diagnostics)}`);
}

async function assertRasterEnvelopeContainsBoundary(page: Page, input: {
  fieldId: string;
  rasterDate: string;
  boundary: NdviPayload["fieldBoundary"];
}) {
  const result = await page.evaluate(async ({ fieldId, rasterDate }) => {
    const response = await fetch(`/api/fields/${fieldId}/ndvi/map?date=${encodeURIComponent(rasterDate)}`, { cache: "no-store" });
    return {
      ok: response.ok,
      status: response.status,
      contentType: response.headers.get("content-type"),
      bbox: response.headers.get("x-raiz-ndvi-bbox"),
      bytes: (await response.arrayBuffer()).byteLength,
    };
  }, { fieldId: input.fieldId, rasterDate: input.rasterDate });

  expect(result.ok, `raster NDVI HTTP ${result.status}`).toBe(true);
  expect(result.contentType ?? "").toContain("image/png");
  expect(result.bytes).toBeGreaterThan(100);
  expect(result.bbox).toBeTruthy();

  const bbox = result.bbox!.split(",").map(Number);
  expect(bbox).toHaveLength(4);
  expect(bbox.every(Number.isFinite)).toBe(true);
  const [minLon, minLat, maxLon, maxLat] = bbox;

  const points = flattenCoordinates(input.boundary?.coordinates);
  expect(points.length, "contorno precisa ter coordenadas reais").toBeGreaterThan(2);

  const tolerance = 1e-6;
  for (const [lon, lat] of points) {
    expect(lon, "longitude do contorno fora do envelope do raster").toBeGreaterThanOrEqual(minLon - tolerance);
    expect(lon, "longitude do contorno fora do envelope do raster").toBeLessThanOrEqual(maxLon + tolerance);
    expect(lat, "latitude do contorno fora do envelope do raster").toBeGreaterThanOrEqual(minLat - tolerance);
    expect(lat, "latitude do contorno fora do envelope do raster").toBeLessThanOrEqual(maxLat + tolerance);
  }
}

async function assertNoHorizontalOverflow(page: Page) {
  try {
    await expect.poll(
      async () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth),
      { timeout: 5_000 },
    ).toBeLessThanOrEqual(1);
  } catch {
    const diagnostics = await page.evaluate(() => {
      const viewportWidth = document.documentElement.clientWidth;
      const scrollWidth = document.documentElement.scrollWidth;
      const offenders = Array.from(document.querySelectorAll<HTMLElement>("body *"))
        .map((element) => {
          const rect = element.getBoundingClientRect();
          const overflowRight = Math.max(0, rect.right - viewportWidth);
          const overflowLeft = Math.max(0, -rect.left);
          return {
            tag: element.tagName.toLowerCase(),
            id: element.id || null,
            className: typeof element.className === "string" ? element.className : null,
            overflowRight: Math.round(overflowRight * 10) / 10,
            overflowLeft: Math.round(overflowLeft * 10) / 10,
            rectLeft: Math.round(rect.left * 10) / 10,
            rectRight: Math.round(rect.right * 10) / 10,
            width: Math.round(rect.width * 10) / 10,
          };
        })
        .filter((entry) => entry.overflowRight > 1 || entry.overflowLeft > 1)
        .sort((a, b) => Math.max(b.overflowRight, b.overflowLeft) - Math.max(a.overflowRight, a.overflowLeft))
        .slice(0, 12);
      return { viewportWidth, scrollWidth, overflow: scrollWidth - viewportWidth, offenders };
    });
    throw new Error(`overflow horizontal de ${diagnostics.overflow}px; elementos excedentes: ${JSON.stringify(diagnostics.offenders)}`);
  }
}

test.describe("Issue #84 · QA visual NDVI no Preview hospedado", () => {
  test.setTimeout(90_000);

  test("NDVI arquivado: leitura clara, raster cobre o contorno e mapa-base carrega", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await login(page);

    const target = await fieldWithArchivedNdvi(page);

    await assertRasterEnvelopeContainsBoundary(page, target);

    await page.goto(`/talhoes/${target.fieldId}`, { waitUntil: "networkidle" });
    const vigor = page.locator(".simple-field-vigor");
    await vigor.scrollIntoViewIfNeeded();
    await expect(vigor).toBeVisible();

    await expect(vigor).toContainText("VIGOR DA ÁREA");
    await expect(vigor).toContainText("NDVI médio");
    await expect(vigor).toContainText("MAIOR VIGOR");
    await expect(vigor).toContainText("Faixas de vigor");
    await expect(vigor).toContainText("não é uma previsão direta de produtividade");

    const map = vigor.locator(".real-field-map");
    await expect(map).toBeVisible({ timeout: 20_000 });
    await expect(map.locator(".real-field-map-canvas")).toBeVisible();
    await expect(map).toHaveAttribute("data-has-image-overlay", "true");

    const legendText = await map.locator(".real-field-map-legend").textContent();
    expect(legendText ?? "").toMatch(/Vigor baixo/i);
    expect(legendText ?? "").toMatch(/Vigor muito alto/i);

    const rasterError = vigor.locator('.simple-field-vigor-empty[role="alert"]');
    await expect(rasterError).toHaveCount(0);

    if (process.env.E2E_EXPECT_GOOGLE_MAPS === "1") {
      await expect.poll(
        async () => page.locator('script[src*="maps.googleapis.com/maps/api/js"]').count(),
        { timeout: 20_000, message: "Google Maps JavaScript API deveria estar carregado no Preview" },
      ).toBeGreaterThan(0);
      await expect(map).toHaveAttribute("data-map-provider", "google");
      await expect(map.locator(".ndvi-panel-limitation")).toHaveCount(0);
    }

    await test.info().attach("ndvi-desktop", {
      body: await vigor.screenshot(),
      contentType: "image/png",
    });
  });

  test("mobile 390×844: NDVI e navegação não criam overflow horizontal", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await login(page);

    const target = await fieldWithArchivedNdvi(page);

    await page.goto(`/talhoes/${target.fieldId}`, { waitUntil: "networkidle" });
    const vigor = page.locator(".simple-field-vigor");
    await vigor.scrollIntoViewIfNeeded();
    await expect(vigor).toBeVisible();

    await assertNoHorizontalOverflow(page);

    const box = await vigor.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(-1);
    expect(box!.x + box!.width).toBeLessThanOrEqual(391);

    const map = vigor.locator(".real-field-map");
    await expect(map).toBeVisible({ timeout: 20_000 });
    await assertNoHorizontalOverflow(page);

    await test.info().attach("ndvi-mobile-390x844", {
      body: await page.screenshot({ fullPage: true }),
      contentType: "image/png",
    });
  });

  test("Relevo: abre 3D quando disponível ou cai de forma limpa para topografia", async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await login(page);

    const contextResult = await page.evaluate(async () => {
      const response = await fetch("/api/context", { cache: "no-store" });
      let body: any = null;
      try { body = await response.json(); } catch {}
      return { status: response.status, ok: response.ok, body };
    });
    expect(
      contextResult.ok,
      `/api/context deveria responder 2xx no Preview autenticado; status=${contextResult.status}; body=${JSON.stringify(contextResult.body)}`,
    ).toBe(true);
    const fieldId = contextResult.body?.fields?.[0]?.id as string | undefined;
    expect(fieldId, "A homologação da #84 deve expor pelo menos um talhão para validar Relevo.").toBeTruthy();

    await page.goto(`/talhoes/${fieldId}`, { waitUntil: "networkidle" });
    const layers = page.locator(".simple-field-map-layers");
    await layers.scrollIntoViewIfNeeded();
    await expect(layers).toBeVisible({ timeout: 15_000 });

    const terrainButton = layers.getByRole("button", { name: "Relevo" });
    await terrainButton.click();
    await expect(terrainButton).toHaveClass(/active/);

    await expect.poll(async () => {
      const mounted3d = await layers.locator('.google-field-terrain-3d[data-map-provider="google-3d"] .google-field-terrain-3d-canvas > *').count();
      const resolvedFallback = await layers.locator('.real-field-map[data-map-provider]').count();
      return mounted3d + resolvedFallback;
    }, { timeout: 35_000, message: "Relevo precisa montar 3D de verdade ou resolver um fallback topográfico" }).toBeGreaterThan(0);

    const mounted3d = await layers.locator('.google-field-terrain-3d[data-map-provider="google-3d"] .google-field-terrain-3d-canvas > *').count();
    if (mounted3d === 0) {
      const fallback = layers.locator('.real-field-map[data-map-provider]');
      await expect(fallback).toBeVisible();
      await expect(fallback.locator(".real-field-map-hint")).toContainText(/relevo|topográfica/i);
    }

    const errorDetails = layers.locator(".simple-map-layer-error");
    if (await errorDetails.count()) {
      const text = await errorDetails.textContent();
      expect(text ?? "").not.toMatch(/TypeError|ReferenceError|Unhandled|undefined is not/i);
    }

    await expect.poll(async () => page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )).toBeLessThanOrEqual(1);

    await test.info().attach("relevo-qa", {
      body: await layers.screenshot(),
      contentType: "image/png",
    });
  });
});
