import { test, expect, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

const LAB_SESSION_TOKEN = process.env.E2E_LAB_SESSION_TOKEN?.trim() ?? "";
const LAB_ANALYSIS_ID = process.env.E2E_LAB_ANALYSIS_ID?.trim() ?? "";
const INTERPRETATION_SESSION_TOKEN = process.env.E2E_INTERPRETATION_SESSION_TOKEN?.trim() ?? "";
const INTERPRETATION_ANALYSIS_ID = process.env.E2E_INTERPRETATION_ANALYSIS_ID?.trim() ?? "";
const BASE_URL = process.env.E2E_BASE_URL?.trim() || "http://127.0.0.1:3000";
const EVIDENCE_DIR = join(process.cwd(), "test-results", "explainable-confidence");

if (!LAB_SESSION_TOKEN || !LAB_ANALYSIS_ID) throw new Error("Contexto E2E do laudo é obrigatório.");
if (!INTERPRETATION_SESSION_TOKEN || !INTERPRETATION_ANALYSIS_ID) throw new Error("Contexto E2E da interpretação é obrigatório.");

async function openAnalysis(page: Page, analysisId: string, sessionToken: string) {
  const baseUrl = new URL(BASE_URL);
  await page.context().addCookies([{
    name: "raiz_session",
    value: sessionToken,
    domain: baseUrl.hostname,
    path: "/",
    httpOnly: true,
    secure: baseUrl.protocol === "https:",
    sameSite: "Lax",
  }]);
  await page.goto("/analises/" + analysisId, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await expect(page).not.toHaveURL(/\/login(?:\/|$|\?)/);
  const details = page.locator("details.ux2-technical-details");
  await expect(details).toBeVisible();
  await details.evaluate((element) => { (element as HTMLDetailsElement).open = true; });
  return details;
}

async function assertNoHorizontalOverflow(page: Page) {
  await expect.poll(
    async () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth),
    { timeout: 5_000 },
  ).toBeLessThanOrEqual(1);
}

test.describe("Item 4 · confiabilidade explicável", () => {
  test.setTimeout(120_000);

  test("separa e explica confiança do laudo e da interpretação", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1100 });
    const labDetails = await openAnalysis(page, LAB_ANALYSIS_ID, LAB_SESSION_TOKEN);

    const lab = labDetails.getByTestId("lab-import-confidence");
    await expect(lab).toBeVisible({ timeout: 20_000 });
    await expect(lab).toContainText("CONFIABILIDADE DO LAUDO / IMPORTAÇÃO");
    await expect(lab).toContainText(/Peso 35%|Score histórico preservado/);
    await expect(lab).toContainText(/Peso 30%|Score histórico preservado/);
    await expect(lab).toContainText(/peso zero/i);

    const interpretationDetails = await openAnalysis(page, INTERPRETATION_ANALYSIS_ID, INTERPRETATION_SESSION_TOKEN);
    const interpretation = interpretationDetails.getByRole("region", { name: "Explicação da confiabilidade técnica" });
    await expect(interpretation).toBeVisible({ timeout: 20_000 });
    await expect(interpretation).toContainText("CONFIABILIDADE EXPLICÁVEL");
    await expect(interpretation).toContainText(/Peso 50%/);
    await expect(interpretation).toContainText(/Peso 30%/);
    await expect(interpretation).toContainText(/Peso 20%/);
    await expect(interpretation).toContainText(/Pendências são localizadas|Nenhuma limitação de classificação/);

    await assertNoHorizontalOverflow(page);
    await mkdir(EVIDENCE_DIR, { recursive: true });
    await lab.screenshot({ path: join(EVIDENCE_DIR, "lab-confidence-desktop.png") });
    await interpretation.screenshot({ path: join(EVIDENCE_DIR, "interpretation-confidence-desktop.png") });
  });

  test("mobile 390px mantém os dois blocos legíveis e sem overflow", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const labDetails = await openAnalysis(page, LAB_ANALYSIS_ID, LAB_SESSION_TOKEN);
    await expect(labDetails.getByTestId("lab-import-confidence")).toBeVisible({ timeout: 20_000 });
    await assertNoHorizontalOverflow(page);
    const interpretationDetails = await openAnalysis(page, INTERPRETATION_ANALYSIS_ID, INTERPRETATION_SESSION_TOKEN);
    await expect(interpretationDetails.getByRole("region", { name: "Explicação da confiabilidade técnica" })).toBeVisible({ timeout: 20_000 });
    await assertNoHorizontalOverflow(page);

    await mkdir(EVIDENCE_DIR, { recursive: true });
    await page.screenshot({ path: join(EVIDENCE_DIR, "confidence-mobile-390x844.png"), fullPage: true });
  });
});
