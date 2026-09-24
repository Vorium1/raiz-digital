import { test, expect, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

const SESSION_TOKEN = process.env.E2E_SESSION_TOKEN?.trim() ?? "";
const ANALYSIS_ID = process.env.E2E_ANALYSIS_ID?.trim() ?? "";
const EVIDENCE_DIR = join(process.cwd(), "test-results", "producer-summary-evidence");

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

async function openResult(page: Page) {
  await authenticate(page);
  await page.goto(`/resultado/${ANALYSIS_ID}`, { waitUntil: "domcontentloaded", timeout: 45_000 });
  await expect(page).not.toHaveURL(/\/login(?:\/|$|\?)/);
  const summary = page.locator(".simple-result-section.producer-summary");
  await expect(summary).toBeVisible({ timeout: 20_000 });
  await expect(summary.getByRole("heading", { name: "Resumo para o produtor" })).toBeVisible();
  return summary;
}

async function assertNoHorizontalOverflow(page: Page) {
  await expect.poll(
    async () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth),
    { timeout: 5_000 },
  ).toBeLessThanOrEqual(1);
}

test.describe("Issue #90 · resumo final do produtor", () => {
  test.setTimeout(90_000);

  test("desktop usa somente dados aprovados e não inventa custo", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    const summary = await openResult(page);

    await expect(summary).toContainText(/somente o que já foi aprovado neste laudo/i);
    await expect(summary).toContainText(/Custo comercial/i);
    await expect(summary).toContainText(/Não incluído neste laudo oficial/i);
    await expect(summary).not.toContainText(/R\$\s*[0-9]/);

    const hasRows = await summary.locator(".simple-result-producer-summary-list article").count();
    const hasEmpty = await summary.locator(".simple-result-producer-summary-empty").count();
    expect(hasRows + hasEmpty, "Resumo precisa mostrar doses aprovadas ou a ausência explícita de dose uniforme").toBeGreaterThan(0);

    if (hasRows > 0) {
      await expect(summary).toContainText(/Dose aprovada:/i);
      const totals = await summary.getByText(/Total da área:|Usar a dose aprovada por hectare\/unidade/i).count();
      expect(totals).toBeGreaterThan(0);
    } else {
      await expect(summary).toContainText(/Nenhuma dose uniforme foi liberada/i);
      await expect(summary).toContainText(/quantidade inventada/i);
    }

    await mkdir(EVIDENCE_DIR, { recursive: true });
    await summary.screenshot({ path: join(EVIDENCE_DIR, "producer-summary-desktop.png") });
  });

  test("mobile 390×844 permanece legível e sem overflow", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const summary = await openResult(page);
    await assertNoHorizontalOverflow(page);
    await expect(summary).toBeVisible();

    await mkdir(EVIDENCE_DIR, { recursive: true });
    await page.screenshot({ path: join(EVIDENCE_DIR, "producer-summary-mobile-390x844.png"), fullPage: true });
  });

  test("impressão preserva o resumo final", async ({ page }) => {
    await page.setViewportSize({ width: 1240, height: 1754 });
    const summary = await openResult(page);
    await page.emulateMedia({ media: "print" });
    await expect(summary).toBeVisible();
    await expect(summary.getByRole("heading", { name: "Resumo para o produtor" })).toBeVisible();

    await mkdir(EVIDENCE_DIR, { recursive: true });
    await page.screenshot({ path: join(EVIDENCE_DIR, "producer-summary-print.png"), fullPage: true });
  });
});
