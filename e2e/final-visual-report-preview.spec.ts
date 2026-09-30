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

async function openPublishedTechnicalReport(page: Page) {
  await authenticate(page);
  await page.goto("/relatorios/talhao/" + ANALYSIS_ID, {
    waitUntil: "domcontentloaded",
    timeout: 60_000,
  });
  await expect(page).not.toHaveURL(/\/login(?:\/|$|\?)/);
  await expect(page.locator(".concept-report")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(/snapshot IMUTÁVEL publicado/i)).toBeVisible();
  await expect(page.locator(".report-version-toggle a.active")).toContainText("Versão publicada");
  return page.locator(".concept-report");
}

async function openProducerReport(page: Page) {
  await authenticate(page);
  await page.goto("/resultado/" + ANALYSIS_ID, {
    waitUntil: "domcontentloaded",
    timeout: 60_000,
  });
  await expect(page).not.toHaveURL(/\/login(?:\/|$|\?)/);
  const report = page.locator(".concept-report");
  await expect(report).toBeVisible({ timeout: 20_000 });
  const pageCount = await report.locator(".concept-report-page").count();
  expect([4, 5]).toContain(pageCount);
  return report;
}

async function assertNoHorizontalOverflow(page: Page) {
  await expect.poll(
    async () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth),
    { timeout: 5_000 },
  ).toBeLessThanOrEqual(1);
}

function fieldNameLocator(report: ReturnType<Page["locator"]>) {
  return report
    .locator(".concept-cover-meta-identified > div")
    .filter({ hasText: "TALHÃO" })
    .locator("strong");
}

test.describe("Relatório final visual · decisão congelada", () => {
  test.setTimeout(120_000);

  test("visão técnica usa publicação por padrão e versão atual exige escolha explícita", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1100 });
    await openPublishedTechnicalReport(page);

    await page.getByRole("link", { name: "Versão atual" }).click();
    await expect(page).toHaveURL(/versao=atual/);
    await expect(page.locator(".report-version-toggle a.active")).toContainText("Versão atual");
    await expect(page.locator(".concept-report")).toBeVisible();
    await expect(page.getByText(/snapshot IMUTÁVEL publicado/i)).toHaveCount(0);
  });

  test("produtor e técnico publicado usam o mesmo snapshot e a mesma paginação", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1100 });
    const technical = await openPublishedTechnicalReport(page);
    const technicalField = (await fieldNameLocator(technical).innerText()).trim();
    expect(technicalField).toBeTruthy();
    const technicalPageCount = await technical.locator(".concept-report-page").count();
    expect([4, 5]).toContain(technicalPageCount);
    await expect(technical.locator(".concept-technical-appendix")).toBeVisible();

    const producer = await openProducerReport(page);
    const producerField = (await fieldNameLocator(producer).innerText()).trim();
    expect(producerField).toBe(technicalField);
    expect(await producer.locator(".concept-report-page").count()).toBe(technicalPageCount);
    await expect(producer.locator(".concept-technical-appendix")).toHaveCount(0);
    await expect(producer.getByText("PARECER FINAL", { exact: true })).toBeVisible();
  });

  test("desktop omite execução vazia e mantém as páginas conceituais sem overflow", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1100 });
    const report = await openProducerReport(page);
    const pages = report.locator(".concept-report-page");

    const pageCount = await pages.count();
    const executionCount = await report.getByText("03 / EXECUÇÃO DA SAFRA", { exact: true }).count();

    await expect(pages.nth(0)).toContainText("RELATÓRIO");
    await expect(pages.nth(0)).toContainText("AGRONÔMICO");
    await expect(pages.nth(0)).toContainText("IDENTIFICAÇÃO DA ÁREA");
    await expect(pages.nth(1)).toContainText("A ÁREA EM UMA");
    await expect(pages.nth(1)).toContainText("VISÃO");
    await expect(pages.nth(2)).toContainText("O QUE O SEU SOLO");
    await expect(pages.nth(2)).toContainText("PEDE");

    if (executionCount) {
      expect(pageCount).toBe(5);
      await expect(pages.nth(3)).toContainText("EXECUÇÃO DA SAFRA");
      await expect(pages.nth(3)).toContainText("APLICAÇÃO / POSICIONAMENTO");
    } else {
      expect(pageCount).toBe(4);
    }

    const finalPage = report.locator(".concept-final-page");
    await expect(finalPage).toContainText("PLANO PARA");
    await expect(finalPage).toContainText("PARECER FINAL");
    await expect(finalPage).toContainText("Responsável técnico");

    await assertNoHorizontalOverflow(page);
    await mkdir(EVIDENCE_DIR, { recursive: true });
    for (let index = 0; index < pageCount; index++) {
      await pages.nth(index).screenshot({ path: join(EVIDENCE_DIR, `pagina-${index + 1}.png`) });
    }
  });

  test("mobile permanece legível e sem overflow horizontal", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const report = await openProducerReport(page);
    expect([4, 5]).toContain(await report.locator(".concept-report-page").count());
    await assertNoHorizontalOverflow(page);

    await mkdir(EVIDENCE_DIR, { recursive: true });
    await page.screenshot({ path: join(EVIDENCE_DIR, "mobile-390x844.png"), fullPage: true });
  });

  test("impressão do relatório do produtor usa somente páginas A4 com conteúdo", async ({ page }) => {
    await page.setViewportSize({ width: 1240, height: 1754 });
    const report = await openProducerReport(page);
    await page.emulateMedia({ media: "print" });
    const pages = report.locator(".concept-report-page");
    const expectedPageCount = await pages.count();
    expect([4, 5]).toContain(expectedPageCount);

    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      preferCSSPageSize: true,
    });
    await mkdir(EVIDENCE_DIR, { recursive: true });
    await writeFile(join(EVIDENCE_DIR, `relatorio-produtor-${expectedPageCount}-paginas-a4.pdf`), pdf);

    const metrics = await pages.evaluateAll((elements) =>
      elements.map((element) => ({
        clientHeight: element.clientHeight,
        scrollHeight: element.scrollHeight,
        renderedHeight: Math.round(element.getBoundingClientRect().height),
      })),
    );
    console.log("PRINT_PAGE_METRICS", JSON.stringify(metrics));
    for (const metric of metrics) {
      expect(metric.scrollHeight - metric.clientHeight, "página conceitual não pode estourar verticalmente").toBeLessThanOrEqual(2);
    }

    const ascii = pdf.toString("latin1");
    const pageObjects = ascii.match(/\/Type\s*\/Page\b/g) ?? [];
    expect(pageObjects.length, "PDF do produtor não pode ganhar página vazia/extra por overflow").toBe(expectedPageCount);
  });
});
