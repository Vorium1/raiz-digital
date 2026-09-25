import { test, expect, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

const BASE_URL = process.env.E2E_BASE_URL?.trim() || "http://127.0.0.1:3000";
const EVIDENCE_DIR = join(process.cwd(), "test-results", "explainable-confidence");
const DEMO_ANALYSIS_ID = "AN-2026-0148";

async function openDemoAnalysis(page: Page) {
  await page.goto(BASE_URL + "/analises/" + DEMO_ANALYSIS_ID, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await expect(page.getByText("Exemplo visual.", { exact: false })).toBeVisible();
}

async function assertNoHorizontalOverflow(page: Page) {
  await expect.poll(
    async () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth),
    { timeout: 5_000 },
  ).toBeLessThanOrEqual(1);
}

test.describe("Item 4 · confiabilidade explicável", () => {
  test.setTimeout(120_000);

  test("separa visualmente confiança do laudo e da interpretação", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1100 });
    await openDemoAnalysis(page);

    const lab = page.getByTestId("lab-import-confidence");
    await expect(lab).toBeVisible();
    await expect(lab).toContainText("CONFIABILIDADE DO LAUDO / IMPORTAÇÃO");
    await expect(lab).toContainText(/Peso 35%/);
    await expect(lab).toContainText(/Peso 30%/);
    await expect(lab).toContainText(/peso zero/i);

    const interpretation = page.getByRole("region", { name: "Explicação da confiabilidade técnica" });
    await expect(interpretation).toBeVisible();
    await expect(interpretation).toContainText("CONFIABILIDADE EXPLICÁVEL");
    await expect(interpretation).toContainText(/Peso 50%/);
    await expect(interpretation).toContainText(/Peso 30%/);
    await expect(interpretation).toContainText(/Peso 20%/);
    await expect(interpretation).toContainText(/Cobertura: 2\/2/);

    await assertNoHorizontalOverflow(page);
    await mkdir(EVIDENCE_DIR, { recursive: true });
    await lab.screenshot({ path: join(EVIDENCE_DIR, "lab-confidence-desktop.png") });
    await interpretation.screenshot({ path: join(EVIDENCE_DIR, "interpretation-confidence-desktop.png") });
  });

  test("mobile 390px mantém os explainers legíveis e sem overflow", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openDemoAnalysis(page);
    await expect(page.getByTestId("lab-import-confidence")).toBeVisible();
    await expect(page.getByRole("region", { name: "Explicação da confiabilidade técnica" })).toBeVisible();
    await assertNoHorizontalOverflow(page);
    await mkdir(EVIDENCE_DIR, { recursive: true });
    await page.screenshot({ path: join(EVIDENCE_DIR, "confidence-mobile-390x844.png"), fullPage: true });
  });
});
