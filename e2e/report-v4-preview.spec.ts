import { test, expect, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

const SESSION_TOKEN = process.env.E2E_SESSION_TOKEN?.trim() ?? "";
const ANALYSIS_ID = process.env.E2E_ANALYSIS_ID?.trim() ?? "";
const EXPECTED_RECOMMENDATION_COUNT = Number(process.env.E2E_EXPECTED_RECOMMENDATION_COUNT ?? "0");
const EXPECTED_RECOMMENDATION_GROUPS = Number(process.env.E2E_EXPECTED_RECOMMENDATION_GROUPS ?? "0");
const EXPECTED_MANAGEMENT_COUNT = Number(process.env.E2E_EXPECTED_MANAGEMENT_COUNT ?? "0");
const EXPECTED_COMMERCIAL = process.env.E2E_EXPECTED_COMMERCIAL === "1";
const EXPECTED_COMMERCIAL_PRODUCTS = Number(process.env.E2E_EXPECTED_COMMERCIAL_PRODUCTS ?? "0");
const EVIDENCE_DIR = join(process.cwd(), "test-results", "report-v4-evidence");

if (!SESSION_TOKEN) throw new Error("E2E_SESSION_TOKEN é obrigatório.");
if (!ANALYSIS_ID) throw new Error("E2E_ANALYSIS_ID é obrigatório.");

async function authenticate(page: Page) {
  const baseUrl = new URL(process.env.E2E_BASE_URL ?? "");
  await page.context().addCookies([{
    name: "raiz_session",
    value: SESSION_TOKEN,
    domain: baseUrl.hostname,
    path: "/",
    httpOnly: true,
    secure: true,
    sameSite: "Lax",
  }]);
}

async function openReport(page: Page) {
  await authenticate(page);
  await page.goto("/resultado/" + ANALYSIS_ID, { waitUntil: "networkidle", timeout: 60_000 });
  await expect(page).not.toHaveURL(/\/login(?:\/|$|\?)/);
  const document = page.locator(".simple-result-document");
  await expect(document).toBeVisible({ timeout: 20_000 });
  return document;
}

async function assertNoHorizontalOverflow(page: Page) {
  await expect.poll(
    async () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth),
    { timeout: 5_000 },
  ).toBeLessThanOrEqual(1);
}

test.describe("Item 2 · relatório publicado em 2–3 páginas visuais", () => {
  test.setTimeout(120_000);

  test("desktop organiza a entrega em três folhas com diagnóstico, recomendação e fechamento", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1200 });
    const document = await openReport(page);
    const sheets = document.locator(".report-v4-sheet");
    await expect(sheets).toHaveCount(3);

    const page1 = sheets.nth(0);
    const page2 = sheets.nth(1);
    const page3 = sheets.nth(2);

    await expect(page1).toContainText(/DIAGNÓSTICO DO SOLO/i);
    expect(await page1.locator(".report-v4-parameter-card").count(), "Página 1 precisa ter gráficos/cards dos parâmetros congelados.").toBeGreaterThan(0);
    await expect(page2).toContainText(/O QUE FAZER|CONCLUSÃO TÉCNICA/i);
    await expect(page2.locator(".report-v4-action-summary")).toBeVisible();
    await expect(page2.locator(".report-v4-recommendation-dashboard")).toBeVisible();
    const recommendationCards = await page2.locator(".report-v4-recommendation-card").count();
    expect(recommendationCards, "Página 2 precisa ter cards práticos das recomendações aprovadas.").toBeGreaterThan(0);
    if (EXPECTED_RECOMMENDATION_COUNT > 0) {
      expect(recommendationCards, "Fixture rico precisa renderizar todas as recomendações congeladas.").toBe(EXPECTED_RECOMMENDATION_COUNT);
    }
    if (EXPECTED_RECOMMENDATION_GROUPS > 0) {
      await expect(page2.locator(".report-v4-recommendation-group")).toHaveCount(EXPECTED_RECOMMENDATION_GROUPS);
    }
    if (EXPECTED_MANAGEMENT_COUNT > 0) {
      await expect(page2.locator(".report-v4-management-grid > span")).toHaveCount(EXPECTED_MANAGEMENT_COUNT);
    }
    await expect(page2).toContainText(/CONVERSÃO OPERACIONAL/i);
    await expect(page2.locator(".report-v4-commercial")).toBeVisible();
    if (EXPECTED_COMMERCIAL) {
      await expect(page2.locator(".report-v4-commercial-grid")).toBeVisible();
      await expect(page2.locator(".report-v4-commercial-grid > article")).toHaveCount(EXPECTED_COMMERCIAL_PRODUCTS);
      await expect(page2.locator(".report-v4-commercial-total")).toBeVisible();
      await expect(page2.locator(".report-v4-commercial-empty")).toHaveCount(0);
    }
    await expect(page3).toContainText(/FECHAMENTO DO TALHÃO/i);
    await expect(page3.locator(".report-v4-final-metrics")).toBeVisible();
    await expect(page3).toContainText(/RESUMO FINAL/i);
    await expect(page3).toContainText(/Resumo para o produtor/i);
    await expect(page3.locator(".report-v4-opinion")).toBeVisible();
    await expect(page3).toContainText(/BASE DA DECISÃO/i);
    await expect(page3.locator(".report-v4-trace-grid")).toBeVisible();
    await expect(page3).toContainText(/De onde veio este resultado/i);
    await expect(page3.locator(".simple-result-signature")).toBeVisible();
    const signatureContent = await page3.locator(".simple-result-signature").innerText();
    expect(signatureContent.trim().length, "Página 3 não pode terminar com bloco de assinatura vazio.").toBeGreaterThan(0);

    await assertNoHorizontalOverflow(page);
    await mkdir(EVIDENCE_DIR, { recursive: true });
    await page1.screenshot({ path: join(EVIDENCE_DIR, "report-v4-page-1.png") });
    await page2.screenshot({ path: join(EVIDENCE_DIR, "report-v4-page-2.png") });
    await page3.screenshot({ path: join(EVIDENCE_DIR, "report-v4-page-3.png") });
  });

  test("mobile 390×844 continua legível sem overflow", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const document = await openReport(page);
    await expect(document.locator(".report-v4-sheet")).toHaveCount(3);
    await assertNoHorizontalOverflow(page);
    await mkdir(EVIDENCE_DIR, { recursive: true });
    await page.screenshot({ path: join(EVIDENCE_DIR, "report-v4-mobile-390x844.png"), fullPage: true });
  });

  test("print força três folhas lógicas com page break explícito", async ({ page }) => {
    await page.setViewportSize({ width: 1240, height: 1754 });
    const document = await openReport(page);
    await page.emulateMedia({ media: "print" });
    const sheets = document.locator(".report-v4-sheet");
    await expect(sheets).toHaveCount(3);

    const breaks = await sheets.evaluateAll((elements) => elements.map((element) => {
      const style = getComputedStyle(element);
      return { breakAfter: style.breakAfter, pageBreakAfter: style.pageBreakAfter };
    }));
    expect(["page", "always"]).toContain(breaks[0].breakAfter === "auto" ? breaks[0].pageBreakAfter : breaks[0].breakAfter);
    expect(["page", "always"]).toContain(breaks[1].breakAfter === "auto" ? breaks[1].pageBreakAfter : breaks[1].breakAfter);

    const sheetHeights = await sheets.evaluateAll((elements) =>
      elements.map((element) => Math.ceil(element.getBoundingClientRect().height)),
    );
    for (const [index, height] of sheetHeights.entries()) {
      expect(height, `Folha ${index + 1} precisa caber no viewport A4 de QA sem criar uma folha extra.`).toBeLessThanOrEqual(1754);
    }

    await mkdir(EVIDENCE_DIR, { recursive: true });
    await page.screenshot({ path: join(EVIDENCE_DIR, "report-v4-print-full.png"), fullPage: true });
  });
});
