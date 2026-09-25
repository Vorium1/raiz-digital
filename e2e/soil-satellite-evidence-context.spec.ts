import { test, expect, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

const SESSION_TOKEN = process.env.E2E_SESSION_TOKEN?.trim() ?? "";
const ANALYSIS_ID = process.env.E2E_ANALYSIS_ID?.trim() ?? "";
const FIELD_ID = process.env.E2E_FIELD_ID?.trim() ?? "";
const BASE_URL = process.env.E2E_BASE_URL?.trim() || "http://127.0.0.1:3000";
const EVIDENCE_DIR = join(process.cwd(), "test-results", "soil-satellite-context");

if (!SESSION_TOKEN || !ANALYSIS_ID || !FIELD_ID) {
  throw new Error("Contexto E2E de análise/talhão é obrigatório.");
}

const FIELD_BOUNDARY = {
  type: "Polygon",
  coordinates: [[
    [-52.4200, -28.2800],
    [-52.4100, -28.2800],
    [-52.4100, -28.2700],
    [-52.4200, -28.2700],
    [-52.4200, -28.2800],
  ]],
};

const NDVI_PAYLOAD = {
  latest: {
    id: "ndvi-2026-08-21",
    capturedAt: "2026-08-21T10:00:00Z",
    source: "SENTINEL_2",
    cloudCoverPct: 9,
    meanNdvi: 0.72,
    minNdvi: 0.22,
    maxNdvi: 0.91,
    rasterObjectKey: "fixture/ndvi-2026-08-21.png",
    zoneBreakdownPct: { BAIXO: 10, MODERADO: 35, ALTO: 40, MUITO_ALTO: 15 },
  },
  history: [{
    id: "ndvi-2026-08-21",
    capturedAt: "2026-08-21T10:00:00Z",
    source: "SENTINEL_2",
    cloudCoverPct: 9,
    meanNdvi: 0.72,
    minNdvi: 0.22,
    maxNdvi: 0.91,
    rasterObjectKey: "fixture/ndvi-2026-08-21.png",
    zoneBreakdownPct: { BAIXO: 10, MODERADO: 35, ALTO: 40, MUITO_ALTO: 15 },
  }],
  fieldBoundary: FIELD_BOUNDARY,
  quality: "ALTA",
  variability: { hasSignificantVariability: false, note: "Fixture visual." },
  temporal: null,
  runtime: { ready: true, copernicusConfigured: false, durableStorageConfigured: true, storageProvider: "INLINE_NEON", missing: [] },
};

const SOIL_CONTEXT = {
  context: {
    collectionOrderId: "00000000-0000-4000-8000-000000000001",
    collectionOrderCode: "QA-SOLO-001",
    seasonLabel: "2026/27",
    depthFromCm: 0,
    depthToCm: 20,
  },
};

const SOIL_LAYER = {
  fieldBoundary: FIELD_BOUNDARY,
  availableParameters: ["P", "K"],
  interpretationStatus: "APPROVED",
  interpretationCurrent: true,
  interpretationFreshnessCode: "CURRENT",
  confidence: null,
  trace: null,
  analysisId: ANALYSIS_ID,
  reportId: null,
  points: [
    {
      id: "00000000-0000-4000-8000-000000000101",
      code: "P1",
      sequence: 1,
      latitude: -28.27510,
      longitude: -52.41510,
      observedLatitude: -28.27512,
      observedLongitude: -52.41508,
      collectedAt: "2026-08-01T14:00:00Z",
      depthFromCm: 0,
      depthToCm: 20,
      subsampleCount: 12,
      accuracyM: 1.2,
      gpsSource: "GNSS_FIELD",
      notes: null,
      labResultCount: 12,
      value: 12.4,
      unit: "mg/dm³",
      method: "Mehlich-1",
      interpretable: true,
      classification: "Médio",
      notInterpretableReason: null,
    },
    {
      id: "00000000-0000-4000-8000-000000000102",
      code: "P2",
      sequence: 2,
      latitude: -28.27600,
      longitude: -52.41600,
      observedLatitude: null,
      observedLongitude: null,
      collectedAt: null,
      depthFromCm: 0,
      depthToCm: 20,
      subsampleCount: null,
      accuracyM: null,
      gpsSource: null,
      notes: null,
      labResultCount: 10,
      value: 7.1,
      unit: "mg/dm³",
      method: "Mehlich-1",
      interpretable: true,
      classification: "Baixo",
      notInterpretableReason: null,
    },
  ],
};

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL+YQAAAABJRU5ErkJggg==",
  "base64",
);

async function openCrossEvidence(page: Page, width: number, height: number) {
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
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(NDVI_PAYLOAD) });
  });
  await page.route("**/api/fields/" + FIELD_ID + "/soil-map-context", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(SOIL_CONTEXT) });
  });
  await page.route("**/api/fields/" + FIELD_ID + "/ndvi/map?date=*", async (route) => {
    await route.fulfill({
      status: 200,
      body: PNG,
      headers: {
        "content-type": "image/png",
        "x-raiz-ndvi-bbox": "-52.42,-28.28,-52.41,-28.27",
      },
    });
  });
  await page.route("**/api/collection-orders/*/map-layer*", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(SOIL_LAYER) });
  });

  await page.goto("/analises/" + ANALYSIS_ID, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await expect(page).not.toHaveURL(/\/login(?:\/|$|\?)/);

  const details = page.locator("details.ux2-technical-details");
  await expect(details).toBeVisible();
  await details.evaluate((element) => { (element as HTMLDetailsElement).open = true; });

  const satelliteButton = page.getByRole("button", { name: "Consultar satélite" });
  await expect(satelliteButton).toBeVisible({ timeout: 20_000 });
  await satelliteButton.click();

  const soilSelect = page.getByLabel("Solo × satélite");
  await expect(soilSelect).toBeVisible({ timeout: 20_000 });
  await soilSelect.selectOption("P");

  const context = page.getByTestId("soil-satellite-evidence-context");
  await expect(context).toBeVisible({ timeout: 20_000 });
  return context;
}

test.describe("Item 6 · contexto Solo × Satélite", () => {
  test.setTimeout(120_000);

  test("desktop mostra evidência por ponto sem inventar comparabilidade", async ({ page }) => {
    const context = await openCrossEvidence(page, 1440, 1100);

    await expect(context).toContainText("P nos pontos reais × aquisição NDVI escolhida");
    await expect(context).toContainText("Sem corte de dias inventado");
    await expect(context).toContainText("21/08/2026");
    await expect(context).toContainText("NDVI médio 0.72");
    await expect(context).toContainText("P1");
    await expect(context).toContainText("12.4 mg/dm³");
    await expect(context).toContainText("GPS observado");
    await expect(context).toContainText("20 dias de separação");
    await expect(context).toContainText("Datas diferentes");
    await expect(context).toContainText("P2");
    await expect(context).toContainText("Posição planejada");
    await expect(context).toContainText("Não tratar como coordenada medida em campo.");
    await expect(context).toContainText("Data do solo ausente");
    await expect(context).toContainText(/não calcula correlação nem atribui causa/i);

    await mkdir(EVIDENCE_DIR, { recursive: true });
    await context.screenshot({ path: join(EVIDENCE_DIR, "soil-satellite-desktop.png") });
  });

  test("mobile 390px preserva leitura sem overflow de página", async ({ page }) => {
    const context = await openCrossEvidence(page, 390, 844);
    await expect(context).toContainText("P1");
    await expect(context).toContainText("P2");
    const overflow = await page.evaluate(() => {
      const viewportWidth = document.documentElement.clientWidth;
      const delta = document.documentElement.scrollWidth - viewportWidth;
      const offenders = Array.from(document.querySelectorAll<HTMLElement>("body *"))
        .map((element) => {
          const rect = element.getBoundingClientRect();
          return {
            tag: element.tagName.toLowerCase(),
            id: element.id,
            className: typeof element.className === "string" ? element.className : "",
            text: (element.textContent ?? "").trim().slice(0, 80),
            left: Math.round(rect.left * 10) / 10,
            right: Math.round(rect.right * 10) / 10,
            width: Math.round(rect.width * 10) / 10,
            scrollWidth: element.scrollWidth,
            clientWidth: element.clientWidth,
          };
        })
        .filter((item) => item.right > viewportWidth + 1 || item.left < -1 || item.scrollWidth > item.clientWidth + 1)
        .sort((a, b) => Math.max(b.right - viewportWidth, b.scrollWidth - b.clientWidth) - Math.max(a.right - viewportWidth, a.scrollWidth - a.clientWidth))
        .slice(0, 20);
      return { delta, viewportWidth, pageScrollWidth: document.documentElement.scrollWidth, offenders };
    });
    console.log("MOBILE_OVERFLOW_DIAGNOSTICS", JSON.stringify(overflow));
    expect(overflow.delta).toBeLessThanOrEqual(1);

    await mkdir(EVIDENCE_DIR, { recursive: true });
    await context.screenshot({ path: join(EVIDENCE_DIR, "soil-satellite-mobile.png") });
  });
});
