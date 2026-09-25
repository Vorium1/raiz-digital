import { test, expect, type Page } from "@playwright/test";

const SESSION_TOKEN = process.env.E2E_SESSION_TOKEN?.trim() ?? "";
const FIELD_ID = process.env.E2E_FIELD_ID?.trim() ?? "";
const BASE_URL = process.env.E2E_BASE_URL?.trim() || "http://127.0.0.1:3000";

if (!SESSION_TOKEN) throw new Error("E2E_SESSION_TOKEN é obrigatório.");
if (!FIELD_ID) throw new Error("E2E_FIELD_ID é obrigatório.");

const fixture = {
  latest: {
    id: "ndvi-b",
    capturedAt: "2026-08-21",
    source: "SENTINEL_2",
    cloudCoverPct: 9,
    meanNdvi: 0.72,
    minNdvi: 0.21,
    maxNdvi: 0.91,
    rasterObjectKey: "fixture/b.png",
    rasterAlgorithm: "fixture-v1",
    zoneBreakdownPct: { BAIXO: 10, MODERADO: 35, ALTO: 40, MUITO_ALTO: 15 },
  },
  history: [
    {
      id: "ndvi-b",
      capturedAt: "2026-08-21",
      source: "SENTINEL_2",
      cloudCoverPct: 9,
      meanNdvi: 0.72,
      minNdvi: 0.21,
      maxNdvi: 0.91,
      rasterObjectKey: "fixture/b.png",
      rasterAlgorithm: "fixture-v1",
      zoneBreakdownPct: { BAIXO: 10, MODERADO: 35, ALTO: 40, MUITO_ALTO: 15 },
    },
    {
      id: "ndvi-a",
      capturedAt: "2026-08-01",
      source: "SENTINEL_2",
      cloudCoverPct: 8,
      meanNdvi: 0.56,
      minNdvi: 0.16,
      maxNdvi: 0.82,
      rasterObjectKey: "fixture/a.png",
      rasterAlgorithm: "fixture-v1",
      zoneBreakdownPct: { BAIXO: 25, MODERADO: 45, ALTO: 25, MUITO_ALTO: 5 },
    },
  ],
  fieldBoundary: {
    type: "Polygon",
    coordinates: [[
      [-52.42, -28.28],
      [-52.41, -28.28],
      [-52.41, -28.27],
      [-52.42, -28.27],
      [-52.42, -28.28],
    ]],
  },
  runtime: { ready: true, missing: [] },
};

const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL+YQAAAABJRU5ErkJggg==",
  "base64",
);

async function openField(page: Page, width: number, height: number) {
  await page.setViewportSize({ width, height });
  const baseUrl = new URL(BASE_URL);
  await page.context().addCookies([{
    name: "raiz_session",
    value: SESSION_TOKEN,
    domain: baseUrl.hostname,
    path: "/",
    httpOnly: true,
    secure: false,
    sameSite: "Lax",
  }]);

  await page.route("**/api/fields/" + FIELD_ID + "/ndvi", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(fixture) });
  });
  await page.route("**/api/fields/" + FIELD_ID + "/ndvi/map?date=*", async (route) => {
    await route.fulfill({
      status: 200,
      body: png,
      headers: {
        "content-type": "image/png",
        "x-raiz-ndvi-bbox": "-52.42,-28.28,-52.41,-28.27",
      },
    });
  });

  await page.goto("/talhoes/" + FIELD_ID, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await expect(page).not.toHaveURL(/\/login(?:\/|$|\?)/);
  await expect(page.getByRole("region", { name: "Comparação temporal NDVI" })).toBeVisible({ timeout: 20_000 });
}

test.describe("Item 5 · comparação temporal NDVI", () => {
  test.setTimeout(120_000);

  test("desktop compara A × B e controla a aquisição exibida no mapa", async ({ page }) => {
    await openField(page, 1440, 1100);
    const comparison = page.getByRole("region", { name: "Comparação temporal NDVI" });

    await expect(comparison).toContainText("Data A × Data B");
    await expect(comparison).toContainText("+0.16");
    await expect(comparison).toContainText("Alta operacional");
    await expect(comparison).toContainText("-15.0 p.p.");
    await expect(comparison).toContainText("+25.0 p.p.");
    await expect(comparison).toContainText(/sinal para investigação/i);
    await expect(comparison).toContainText(/não identifica causa/i);

    await comparison.getByRole("button", { name: "Ver inicial no mapa" }).click();
    await expect(page.locator(".simple-field-vigor-meta strong")).toHaveText("01/08/2026");

    await comparison.getByRole("button", { name: "Ver final no mapa" }).click();
    await expect(page.locator(".simple-field-vigor-meta strong")).toHaveText("21/08/2026");
  });

  test("mobile 390px não cria overflow horizontal", async ({ page }) => {
    await openField(page, 390, 844);
    await expect(page.getByRole("region", { name: "Comparação temporal NDVI" })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });
});
