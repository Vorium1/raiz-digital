import { test, expect, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

const SESSION_TOKEN = process.env.E2E_SESSION_TOKEN?.trim() ?? "";
const BASE_URL = process.env.E2E_BASE_URL?.trim() || "http://127.0.0.1:3000";
const EVIDENCE_DIR = join(process.cwd(), "test-results", "compatible-comparisons");

if (!SESSION_TOKEN) throw new Error("E2E_SESSION_TOKEN é obrigatório.");

const FIELD_ID = "00000000-0000-4000-8000-000000000701";
const OLDER_ID = "00000000-0000-4000-8000-000000000711";
const NEWER_ID = "00000000-0000-4000-8000-000000000712";

const contextPayload = {
  fields: [{ id: FIELD_ID, name: "Talhão QA Comparável", propertyId: "00000000-0000-4000-8000-000000000700" }],
  properties: [],
  seasons: [],
};

const older = {
  id: OLDER_ID,
  code: "AN-QA-ANTIGA",
  fieldId: FIELD_ID,
  fieldName: "Talhão QA Comparável",
  seasonLabel: "2025/26",
  collectionOrderId: "00000000-0000-4000-8000-000000000721",
  collectionOrderCode: "COLETA-QA-A",
  createdAt: "2025-09-02T10:00:00Z",
  firstCollectedAt: "2025-09-01T10:00:00Z",
  lastCollectedAt: "2025-09-01T12:00:00Z",
  evidenceAt: "2025-09-01T12:00:00Z",
  evidenceDateSource: "COLLECTION",
};
const newer = {
  id: NEWER_ID,
  code: "AN-QA-RECENTE",
  fieldId: FIELD_ID,
  fieldName: "Talhão QA Comparável",
  seasonLabel: "2026/27",
  collectionOrderId: "00000000-0000-4000-8000-000000000722",
  collectionOrderCode: "COLETA-QA-B",
  createdAt: "2026-09-02T10:00:00Z",
  firstCollectedAt: "2026-09-01T10:00:00Z",
  lastCollectedAt: "2026-09-01T12:00:00Z",
  evidenceAt: "2026-09-01T12:00:00Z",
  evidenceDateSource: "COLLECTION",
};

const candidatesPayload = {
  field: { id: FIELD_ID, name: "Talhão QA Comparável" },
  analyses: [newer, older],
};

const resultPayload = {
  field: { id: FIELD_ID, name: "Talhão QA Comparável" },
  labelA: "AN-QA-ANTIGA · 2025/26",
  labelB: "AN-QA-RECENTE · 2026/27",
  analysisA: older,
  analysisB: newer,
  inputOrderReversed: false,
  spatialContext: {
    sameField: true,
    pointCountA: 4,
    pointCountB: 6,
    exactPointLayoutMatch: false,
    note: "As duas coletas pertencem ao mesmo talhão, mas a malha de pontos não é idêntica. O delta é uma comparação agregada do talhão, não uma evolução ponto a ponto.",
  },
  rows: [
    {
      parameterCode: "P",
      unitA: "mg/dm³",
      unitB: "mg/dm³",
      methodsA: ["Mehlich-1"],
      methodsB: ["Mehlich-1"],
      sampleTypesA: ["SOIL"],
      sampleTypesB: ["SOIL"],
      depthA: { from: 0, to: 20 },
      depthB: { from: 0, to: 20 },
      nA: 4,
      nB: 6,
      avgA: 8.4,
      avgB: 12.1,
      classificationA: "Baixo",
      classificationB: "Médio",
      comparable: true,
      incompatibilityReasons: [],
      absoluteDifference: 3.7,
      direction: "INCREASE",
      isPercentUnit: false,
    },
    {
      parameterCode: "AL",
      unitA: "cmolc/dm³",
      unitB: "cmolc/dm³",
      methodsA: ["KCl 1 mol/L"],
      methodsB: ["KCl 1 mol/L"],
      sampleTypesA: ["SOIL"],
      sampleTypesB: ["SOIL"],
      depthA: { from: 0, to: 20 },
      depthB: { from: 0, to: 20 },
      nA: 4,
      nB: 6,
      avgA: 0.1,
      avgB: 0.2,
      classificationA: null,
      classificationB: null,
      comparable: true,
      incompatibilityReasons: [],
      absoluteDifference: 0.1,
      direction: "INCREASE",
      isPercentUnit: false,
    },
    {
      parameterCode: "K",
      unitA: "mg/dm³",
      unitB: "mg/dm³",
      methodsA: ["Mehlich-1"],
      methodsB: ["Resina"],
      sampleTypesA: ["SOIL"],
      sampleTypesB: ["SOIL"],
      depthA: { from: 0, to: 20 },
      depthB: { from: 0, to: 20 },
      nA: 4,
      nB: 6,
      avgA: 138,
      avgB: 142,
      classificationA: null,
      classificationB: null,
      comparable: false,
      incompatibilityReasons: ["Método analíticos diferentes (Mehlich-1 vs. Resina)."],
      absoluteDifference: null,
      direction: "NOT_COMPARABLE",
      isPercentUnit: false,
    },
  ],
};

async function openHistory(page: Page, width: number, height: number) {
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

  await page.route("**/api/context", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(contextPayload) });
  });
  await page.route("**/api/comparisons/history?fieldId=*", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(candidatesPayload) });
  });
  await page.route("**/api/comparisons?mode=history&*", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(resultPayload) });
  });

  await page.goto("/historico", { waitUntil: "domcontentloaded", timeout: 60_000 });
  await expect(page).not.toHaveURL(/\/login(?:\/|$|\?)/);
  const explorer = page.getByTestId("historical-comparison-explorer");
  await expect(explorer).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("AN-QA-ANTIGA · 2025/26 × AN-QA-RECENTE · 2026/27")).toBeVisible({ timeout: 20_000 });
  return explorer;
}

test.describe("Item 7 · comparativos e deltas compatíveis", () => {
  test.setTimeout(120_000);

  test("desktop mostra delta neutro, contexto de medição e incompatibilidade localizada", async ({ page }) => {
    const explorer = await openHistory(page, 1440, 1100);

    await expect(explorer).toContainText("Delta = B − A");
    await expect(explorer).toContainText("não significa melhora/piora");
    await expect(explorer).toContainText("malha de pontos não é idêntica");
    await expect(explorer).toContainText("comparação agregada do talhão");
    await expect(explorer).toContainText("+3,7 mg/dm³");
    await expect(explorer).toContainText("+0,1 cmolc/dm³");
    await expect(explorer).toContainText("Mehlich-1 · SOIL · 0–20 cm");
    await expect(explorer).toContainText("Método analíticos diferentes");
    await expect(explorer).toContainText("Não comparável");

    const neutralDeltas = page.locator(".comparison-diff-neutral");
    await expect(neutralDeltas).toHaveCount(2);
    await expect(page.locator(".comparison-diff-up, .comparison-diff-down")).toHaveCount(0);
    await expect(explorer).not.toContainText(/melhorou|piorou/i);

    await mkdir(EVIDENCE_DIR, { recursive: true });
    await explorer.screenshot({ path: join(EVIDENCE_DIR, "history-desktop.png") });
  });

  test("mobile 390px mantém comparação utilizável sem overflow de página", async ({ page }) => {
    const explorer = await openHistory(page, 390, 844);
    await expect(explorer).toContainText("AN-QA-ANTIGA");
    await expect(explorer).toContainText("AN-QA-RECENTE");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);

    await mkdir(EVIDENCE_DIR, { recursive: true });
    await explorer.screenshot({ path: join(EVIDENCE_DIR, "history-mobile.png") });
  });
});
