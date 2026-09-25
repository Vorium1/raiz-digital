import { test, expect, type Page } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const SESSION_TOKEN = process.env.E2E_SESSION_TOKEN?.trim() ?? "";
const ANALYSIS_ID = process.env.E2E_ANALYSIS_ID?.trim() ?? "";
const EVIDENCE_DIR = join(process.cwd(), "test-results", "final-visual-report-evidence");

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

async function openPublishedReport(page: Page) {
  await authenticate(page);
  await page.goto("/relatorios/talhao/" + ANALYSIS_ID + "?versao=publicada", {
    waitUntil: "domcontentloaded",
    timeout: 60_000,
  });
  await expect(page).not.toHaveURL(/\/login(?:\/|$|\?)/);
  await expect(page.locator(".report-final-pages")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(/snapshot IMUTÁVEL publicado/i)).toBeVisible();
  return page.locator(".report-final-pages");
}

async function assertNoHorizontalOverflow(page: Page) {
  await expect.poll(
    async () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth),
    { timeout: 5_000 },
  ).toBeLessThanOrEqual(1);
}

test.describe("Issue #103 · relatório final visual", () => {
  test.setTimeout(120_000);

  test("desktop renderiza três páginas com diagnóstico, manejo e fechamento", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1100 });
    const report = await openPublishedReport(page);

    const pages = report.locator(".report-a4-page");
    await expect(pages).toHaveCount(3);
    await expect(pages.nth(0)).toContainText("Diagnóstico visual");
    await expect(pages.nth(0)).toContainText("Talhão e pontos");
    await expect(pages.nth(0)).toContainText("Indicadores e nutrientes");
    await expect(pages.nth(1)).toContainText("Recomendação e manejo");
    await expect(pages.nth(1)).toContainText("Necessidade agronômica");
    await expect(pages.nth(2)).toContainText("Fechamento para o produtor");
    await expect(pages.nth(2)).toContainText(/Rastreabilidade/i);
    await expect(pages.nth(2)).toContainText(/Hash verificado/i);

    expect(await pages.nth(0).locator(".report-parameter-card").count(), "o diagnóstico precisa expor os parâmetros congelados").toBeGreaterThan(0);
    const recommendationRows = await pages.nth(1).locator(".report-recommendation-table tbody tr").count();
    const explicitNoDose = await pages.nth(1).getByText(/Sem dose inventada/i).count();
    expect(recommendationRows + explicitNoDose, "recomendação deve mostrar dose aprovada ou ausência explícita").toBeGreaterThan(0);

    await assertNoHorizontalOverflow(page);
    await mkdir(EVIDENCE_DIR, { recursive: true });
    await pages.nth(0).screenshot({ path: join(EVIDENCE_DIR, "page-1-diagnostico.png") });
    await pages.nth(1).screenshot({ path: join(EVIDENCE_DIR, "page-2-manejo.png") });
    await pages.nth(2).screenshot({ path: join(EVIDENCE_DIR, "page-3-fechamento.png") });
  });

  test("mobile permanece legível e sem overflow horizontal", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const report = await openPublishedReport(page);
    await expect(report.locator(".report-a4-page")).toHaveCount(3);
    await assertNoHorizontalOverflow(page);

    await mkdir(EVIDENCE_DIR, { recursive: true });
    await page.screenshot({ path: join(EVIDENCE_DIR, "mobile-390x844.png"), fullPage: true });
  });

  test("impressão A4 gera exatamente três páginas", async ({ page }) => {
    await page.setViewportSize({ width: 1240, height: 1754 });
    const report = await openPublishedReport(page);
    await page.emulateMedia({ media: "print" });
    await expect(report.locator(".report-a4-page")).toHaveCount(3);

    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      preferCSSPageSize: true,
    });
    await mkdir(EVIDENCE_DIR, { recursive: true });
    await writeFile(join(EVIDENCE_DIR, "relatorio-final-a4.pdf"), pdf);

    const metrics = await report.locator(".report-a4-page").evaluateAll((pages) =>
      pages.map((element) => ({
        clientHeight: element.clientHeight,
        scrollHeight: element.scrollHeight,
        renderedHeight: Math.round(element.getBoundingClientRect().height),
      })),
    );
    console.log("PRINT_PAGE_METRICS", JSON.stringify(metrics));

    const ascii = pdf.toString("latin1");
    const pageObjects = ascii.match(/\/Type\s*\/Page\b/g) ?? [];
    expect(pageObjects.length, "PDF A4 não pode ganhar página vazia/extra por overflow").toBe(3);
  });
});
