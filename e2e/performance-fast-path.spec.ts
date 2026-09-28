import { test, expect, type Page } from "@playwright/test";

const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL?.trim() || "admin@raiz.local";
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD?.trim() || "";
const SESSION_TOKEN = process.env.E2E_SESSION_TOKEN?.trim() || "";

if (!ADMIN_PASSWORD && !SESSION_TOKEN) {
  throw new Error("E2E_ADMIN_PASSWORD ou E2E_SESSION_TOKEN precisa estar definido para o QA de performance.");
}

async function loginOnce(page: Page) {
  const started = Date.now();

  if (SESSION_TOKEN) {
    const baseUrl = new URL(process.env.E2E_BASE_URL || page.url());
    await page.context().addCookies([{
      name: "raiz_session",
      value: SESSION_TOKEN,
      domain: baseUrl.hostname,
      path: "/",
      httpOnly: true,
      secure: baseUrl.protocol === "https:",
      sameSite: "Lax",
    }]);
    await page.goto("/inicio", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/inicio(?:\/|$|\?)/);
    return Date.now() - started;
  }

  await page.goto("/login", { waitUntil: "domcontentloaded" });
  await page.fill('input[name="email"]', ADMIN_EMAIL);
  await page.fill('input[name="password"]', ADMIN_PASSWORD);
  await Promise.all([
    page.waitForURL((url) => /\/inicio(?:\/|$|\?)/.test(url.pathname + url.search), { timeout: 20_000 }),
    page.click(".login-submit"),
  ]);
  return Date.now() - started;
}

async function timing(page: Page, label: string, action: () => Promise<void>) {
  const started = Date.now();
  await action();
  const elapsedMs = Date.now() - started;
  await test.info().attach(`timing-${label}`, {
    body: Buffer.from(JSON.stringify({ label, elapsedMs }, null, 2)),
    contentType: "application/json",
  });
  return elapsedMs;
}

test.describe("Performance fast path · Preview", () => {
  test.setTimeout(90_000);

  test("login entra com um único clique e termina diretamente em /inicio", async ({ page }) => {
    test.skip(!ADMIN_PASSWORD, "Senha E2E não configurada neste ambiente; navegação autenticada será validada via sessão temporária.");
    const elapsedMs = await loginOnce(page);
    await expect(page).toHaveURL(/\/inicio(?:\/|$|\?)/);
    await expect(page.locator(".simple-home")).toBeVisible();
    await expect(page.locator(".login-submit")).toHaveCount(0);

    await test.info().attach("login-one-click", {
      body: Buffer.from(JSON.stringify({ elapsedMs, destination: new URL(page.url()).pathname }, null, 2)),
      contentType: "application/json",
    });
  });

  test("Home → Talhões → Talhão abre o conteúdo principal antes dos detalhes técnicos", async ({ page }) => {
    await loginOnce(page);

    await timing(page, "talhoes", async () => {
      await page.goto("/talhoes", { waitUntil: "domcontentloaded" });
      await expect(page.locator(".simple-fields-page, .simple-home")).toBeVisible();
    });

    const fieldLink = page.locator('a[href^="/talhoes/"]').first();
    await expect(fieldLink).toBeVisible();
    const href = await fieldLink.getAttribute("href");
    expect(href).toMatch(/^\/talhoes\/[0-9a-f-]{36}/i);

    await timing(page, "talhao-360-fast-path", async () => {
      await page.goto(href!, { waitUntil: "domcontentloaded" });
      await expect(page.locator(".simple-field-page")).toBeVisible();
      await expect(page.locator(".simple-field-head")).toBeVisible();
    });

    const technical = page.locator(".simple-technical-details");
    await expect(technical).toBeVisible();
    await expect(technical).not.toHaveAttribute("open", "");

    const deferred = technical.locator(".deferred-field-overview-tabs");
    await expect(deferred).toHaveAttribute("data-state", "idle");

    const technicalStarted = Date.now();
    await technical.locator("summary").click();
    await expect(technical).toHaveAttribute("open", "");
    await expect(deferred).toHaveAttribute("data-state", "ready", { timeout: 20_000 });
    await expect(deferred.locator(".field-overview")).toBeVisible();

    await test.info().attach("timing-talhao-technical-on-demand", {
      body: Buffer.from(JSON.stringify({ elapsedMs: Date.now() - technicalStarted }, null, 2)),
      contentType: "application/json",
    });
  });

  test("Resultados e Atenção abrem no Preview autenticado sem erro de aplicação", async ({ page }) => {
    await loginOnce(page);

    await timing(page, "resultados", async () => {
      await page.goto("/resultados", { waitUntil: "domcontentloaded" });
      await expect(page.locator(".simple-results-page")).toBeVisible();
      await expect(page.getByRole("heading", { name: "Resultados", exact: true })).toBeVisible();
    });

    await timing(page, "atencao", async () => {
      await page.goto("/atencao", { waitUntil: "domcontentloaded" });
      await expect(page.locator("body")).not.toContainText(/Application error|Internal Server Error/i);
      await expect(page.locator("main, .main-content")).toBeVisible();
    });
  });

  test("mobile mantém navegação utilizável após as otimizações", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await loginOnce(page);
    await expect(page.locator(".simple-mobile-nav")).toBeVisible();

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);

    await page.goto("/resultados", { waitUntil: "domcontentloaded" });
    const resultsOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(resultsOverflow).toBeLessThanOrEqual(1);
  });
});
