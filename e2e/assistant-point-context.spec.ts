import { test, expect, type Page } from "@playwright/test";

const SESSION_TOKEN = process.env.E2E_SESSION_TOKEN?.trim() ?? "";
const ORDER_ID = process.env.E2E_ORDER_ID?.trim() ?? "";
const POINT_ID = process.env.E2E_POINT_ID?.trim() ?? "";
const POINT_CODE = process.env.E2E_POINT_CODE?.trim() ?? "";
const FIELD_NAME = process.env.E2E_FIELD_NAME?.trim() ?? "";
const PARAMETER = process.env.E2E_PARAMETER?.trim() ?? "";
const BASE_URL = process.env.E2E_BASE_URL?.trim() || "http://127.0.0.1:3000";

if (!SESSION_TOKEN || !ORDER_ID || !POINT_ID || !POINT_CODE || !FIELD_NAME || !PARAMETER) {
  throw new Error("Contexto E2E de ordem/ponto real é obrigatório.");
}

async function openMapWithSelectedPoint(page: Page, width: number, height: number) {
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

  const query = new URLSearchParams({ ordem: ORDER_ID, ponto: POINT_ID, parametro: PARAMETER });
  await page.goto("/mapas?" + query.toString(), { waitUntil: "domcontentloaded", timeout: 60_000 });
  await expect(page).not.toHaveURL(/\/login(?:\/|$|\?)/);

  const panel = page.locator(".real-field-map-panel");
  await expect(panel).toBeVisible({ timeout: 30_000 });
  await expect(panel.locator(".real-field-map-panel-head strong")).toHaveText(POINT_CODE);
  await expect.poll(() => new URL(page.url()).searchParams.get("ponto")).toBe(POINT_ID);
  return panel;
}

async function openAssistant(page: Page) {
  await page.locator(".assistant-fab").click();
  await expect(page.locator(".assistant-panel")).toBeVisible();
  const badge = page.locator(".assistant-context-badge:not(.unavailable)");
  await expect(badge).toBeVisible({ timeout: 15_000 });
  return badge;
}

test.describe("Item 8 · contexto exato de ponto no Assistente RAIZ", () => {
  test.setTimeout(120_000);

  test("mapa, URL e Assistente apontam para o mesmo ponto real", async ({ page }) => {
    const panel = await openMapWithSelectedPoint(page, 1440, 1100);
    const badge = await openAssistant(page);

    await expect(badge).toContainText(FIELD_NAME);
    await expect(badge).toContainText("Ponto " + POINT_CODE);

    const pointSuggestion = page.locator(".assistant-suggestions button", { hasText: "Explique este ponto." });
    await expect(pointSuggestion).toBeVisible();
    await pointSuggestion.click();

    const entry = page.locator(".assistant-entry").last();
    await expect(entry).toContainText("Ponto " + POINT_CODE, { timeout: 20_000 });
    await expect(entry).toContainText("Profundidade");
    await expect(entry).toContainText("Posição");
    await expect(entry).not.toContainText("Hipótese — não é fato confirmado");

    await panel.getByRole("button", { name: "Fechar" }).click();
    await expect.poll(() => new URL(page.url()).searchParams.get("ponto")).toBeNull();

    await expect(page.locator(".assistant-context-badge:not(.unavailable)")).not.toContainText("Ponto " + POINT_CODE, { timeout: 15_000 });
    await expect(page.locator(".assistant-suggestions button", { hasText: "Explique este ponto." })).toHaveCount(0);

    await expect(entry.locator(".assistant-entry-context")).toContainText("Ponto " + POINT_CODE);
  });

  test("mobile 390×844 preserva contexto e caixa de pergunta sem overflow", async ({ page }) => {
    await openMapWithSelectedPoint(page, 390, 844);
    const badge = await openAssistant(page);
    await expect(badge).toContainText("Ponto " + POINT_CODE);

    const input = page.locator(".assistant-panel-form input");
    await expect(input).toBeVisible();
    const box = await input.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.y + box!.height).toBeLessThanOrEqual(844);

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });
});
