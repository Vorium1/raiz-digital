import { test, expect, type Page } from "@playwright/test";

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} precisa estar definida para rodar o QA visual do Preview.`);
  return value;
}

const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? "admin@raiz.local";
const ADMIN_PASSWORD = requiredEnv("E2E_ADMIN_PASSWORD");

async function login(page: Page) {
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
  const context = await page.evaluate(async () => (await fetch("/api/context", { cache: "no-store" })).json());
  const fields: Array<{ id: string; name?: string }> = context.fields ?? [];

  for (const field of fields) {
    const payload = await page.evaluate(async (fieldId) => {
      const response = await fetch(`/api/fields/${fieldId}/ndvi`, { cache: "no-store" });
      if (!response.ok) return null;
      return await response.json();
    }, field.id) as NdviPayload | null;
    if (!payload?.fieldBoundary) continue;
    const archived = (payload.history ?? []).find((snapshot) => Boolean(snapshot.rasterObjectKey));
    if (archived?.capturedAt) {
      return {
        fieldId: field.id,
        fieldName: field.name ?? field.id,
        rasterDate: archived.capturedAt.slice(0, 10),
        boundary: payload.fieldBoundary,
      };
    }
  }
  return null;
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

test.describe("Issue #84 · QA visual NDVI no Preview hospedado", () => {
  test.setTimeout(90_000);

  test("NDVI arquivado: leitura clara, raster cobre o contorno e mapa-base carrega", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await login(page);

    const target = await fieldWithArchivedNdvi(page);
    test.skip(!target, "Nenhum talhão acessível possui raster NDVI arquivado neste ambiente.");
    if (!target) return;

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
    test.skip(!target, "Nenhum talhão acessível possui raster NDVI arquivado neste ambiente.");
    if (!target) return;

    await page.goto(`/talhoes/${target.fieldId}`, { waitUntil: "networkidle" });
    const vigor = page.locator(".simple-field-vigor");
    await vigor.scrollIntoViewIfNeeded();
    await expect(vigor).toBeVisible();

    await expect.poll(async () => page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )).toBeLessThanOrEqual(1);

    const box = await vigor.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(-1);
    expect(box!.x + box!.width).toBeLessThanOrEqual(391);

    const map = vigor.locator(".real-field-map");
    await expect(map).toBeVisible({ timeout: 20_000 });
    await expect.poll(async () => page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )).toBeLessThanOrEqual(1);

    await test.info().attach("ndvi-mobile-390x844", {
      body: await page.screenshot({ fullPage: true }),
      contentType: "image/png",
    });
  });

  test("Relevo: abre 3D quando disponível ou cai de forma limpa para topografia", async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await login(page);

    const context = await page.evaluate(async () => (await fetch("/api/context", { cache: "no-store" })).json());
    const fieldId = context.fields?.[0]?.id as string | undefined;
    test.skip(!fieldId, "Nenhum talhão acessível para validar a aba Relevo.");
    if (!fieldId) return;

    await page.goto(`/talhoes/${fieldId}`, { waitUntil: "networkidle" });
    const layers = page.locator(".simple-field-map-layers");
    await layers.scrollIntoViewIfNeeded();
    await expect(layers).toBeVisible({ timeout: 15_000 });

    await layers.getByRole("button", { name: "Relevo" }).click();

    await expect.poll(async () => {
      const has3d = await layers.locator('.google-field-terrain-3d[data-map-provider="google-3d"]').count();
      const hasFallback = await layers.locator(".real-field-map").count();
      return has3d + hasFallback;
    }, { timeout: 35_000, message: "Relevo precisa abrir 3D ou fallback topográfico" }).toBeGreaterThan(0);

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
