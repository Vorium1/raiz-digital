import { test, expect, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

const SESSION_TOKEN = process.env.E2E_SESSION_TOKEN?.trim() ?? "";
const ANALYSIS_ID = process.env.E2E_ANALYSIS_ID?.trim() ?? "";
const PRODUCT_NAME = process.env.E2E_PRODUCT_NAME?.trim() ?? "KCl E2E 60%";
const EVIDENCE_DIR = join(process.cwd(), "test-results", "official-commercial-plan-evidence");

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
  await expect(summary).toContainText(/Plano comercial congelado/i);
  await expect(summary).toContainText(PRODUCT_NAME);
  await expect(summary).toContainText(/Dose do produto:/i);
  await expect(summary).toContainText(/preço congelado:/i);
  await expect(summary).toContainText(/Custo comercial/i);
  await expect(summary).toContainText(/R\$/);
  return summary;
}

async function assertNoHorizontalOverflow(page: Page) {
  await expect.poll(
    async () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth),
    { timeout: 5_000 },
  ).toBeLessThanOrEqual(1);
}

test.describe("Issue #93 · plano comercial congelado no laudo oficial", () => {
  test.setTimeout(90_000);

  test("desktop mostra produto, quantidade e custo exclusivamente do snapshot publicado", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1100 });
    const summary = await openResult(page);
    await expect(summary).toContainText(/total da área:/i);
    await mkdir(EVIDENCE_DIR, { recursive: true });
    await summary.screenshot({ path: join(EVIDENCE_DIR, "official-commercial-plan-desktop.png") });
  });

  test("mobile 390×844 permanece legível e sem overflow", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openResult(page);
    await assertNoHorizontalOverflow(page);
    await mkdir(EVIDENCE_DIR, { recursive: true });
    await page.screenshot({ path: join(EVIDENCE_DIR, "official-commercial-plan-mobile-390x844.png"), fullPage: true });
  });

  test("impressão preserva produto e custo congelados", async ({ page }) => {
    await page.setViewportSize({ width: 1240, height: 1754 });
    const summary = await openResult(page);
    await page.emulateMedia({ media: "print" });
    await expect(summary).toBeVisible();
    await expect(summary).toContainText(PRODUCT_NAME);
    await expect(summary).toContainText(/R\$/);
    await mkdir(EVIDENCE_DIR, { recursive: true });
    await page.screenshot({ path: join(EVIDENCE_DIR, "official-commercial-plan-print.png"), fullPage: true });
  });
});
