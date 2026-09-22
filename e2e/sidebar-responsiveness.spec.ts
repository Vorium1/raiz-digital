import { test, expect, type Page } from "@playwright/test";

// Patch de responsividade (Fase 3, fechamento final): o diretor reportou que em notebook/desktop comum,
// com o navegador em 100% de zoom, não dava pra acessar a sidebar inteira -- só reduzindo o Chrome pra
// ~50-60% de zoom. Causa raiz: a `.sidebar` era um único bloco com `overflow-y: auto`, sem separar
// topo/rodapé fixos da navegação rolável -- em telas de menor altura (ex.: notebook 1366×768), o
// navegador não tinha como mostrar tudo sem reduzir o zoom. Este arquivo prova, em viewport CSS normal
// (nunca simulando zoom reduzido), que a sidebar continua totalmente acessível: topo visível, navegação
// rolável internamente, Configurações e perfil sempre alcançáveis, sem scroll horizontal.
function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} precisa estar definida para rodar os testes e2e (ver e2e/README.md).`);
  return value;
}

const TENANT_A_EMAIL = "admin@raiz.local";
const TENANT_A_PASSWORD = requiredEnv("E2E_ADMIN_PASSWORD");

async function login(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await Promise.all([page.waitForURL(/dashboard/, { timeout: 15_000 }), page.click(".login-submit")]);
}

test("Sidebar 1366×768: navegação rola internamente, topo e rodapé (Configurações/perfil) nunca desaparecem, sem reduzir zoom", async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await login(page, TENANT_A_EMAIL, TENANT_A_PASSWORD);
  await page.goto("/dashboard", { waitUntil: "networkidle" });

  const sidebar = page.locator(".sidebar");
  await expect(sidebar).toBeVisible();
  await expect(page.locator(".sidebar .brand")).toBeVisible();

  // A navegação central de verdade tem mais conteúdo (perfil admin: 6 seções, ~12 links) do que cabe nos
  // 768px de altura -- é exatamente o cenário real que motivou o pedido. Se isso um dia deixar de ser
  // verdade (menos itens de menu), o teste segue válido: os asserts abaixo continuam provando que nada
  // fica inacessível, com ou sem overflow real.
  const nav = page.locator(".sidebar-nav");
  const navMetrics = await nav.evaluate((el) => ({ scrollHeight: el.scrollHeight, clientHeight: el.clientHeight }));
  expect(navMetrics.scrollHeight).toBeGreaterThan(navMetrics.clientHeight);

  // Configurações e o cartão de perfil (rodapé fixo) já ficam visíveis sem precisar rolar a navegação até
  // o fim -- são uma zona separada, nunca empurrada pra fora da viewport.
  const settingsLink = page.locator('.sidebar-bottom a[href="/configuracoes"]');
  await expect(settingsLink).toBeVisible();
  await expect(page.locator(".sidebar .user-card")).toBeVisible();

  // Rolar a navegação até o fim revela o último item real do menu -- ele precisa terminar dentro da área
  // da própria navegação, sem sobrepor o rodapé fixo nem sumir acima do topo.
  const lastNavLink = page.locator(".sidebar-nav a").last();
  await lastNavLink.scrollIntoViewIfNeeded();
  const [navBox, bottomBox, lastLinkBox] = await Promise.all([nav.boundingBox(), page.locator(".sidebar-bottom").boundingBox(), lastNavLink.boundingBox()]);
  expect(navBox).not.toBeNull();
  expect(bottomBox).not.toBeNull();
  expect(lastLinkBox).not.toBeNull();
  expect(lastLinkBox!.y).toBeGreaterThanOrEqual(navBox!.y - 1);
  expect(lastLinkBox!.y + lastLinkBox!.height).toBeLessThanOrEqual(bottomBox!.y + 1);
  // Ainda visível e clicável depois de rolar até ele (não é só "existe no DOM").
  await expect(lastNavLink).toBeVisible();

  // Sem scroll horizontal em nenhum nível: a página inteira e a própria navegação interna.
  const pageHorizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(pageHorizontalOverflow).toBeLessThanOrEqual(1);
  const navHorizontalOverflow = await nav.evaluate((el) => el.scrollWidth - el.clientWidth);
  expect(navHorizontalOverflow).toBeLessThanOrEqual(1);

  // A sidebar não invade o conteúdo principal, e a topbar continua correta (à direita da sidebar).
  const [sidebarBox, mainBox, topbarBox] = await Promise.all([sidebar.boundingBox(), page.locator(".main-content").boundingBox(), page.locator(".topbar").boundingBox()]);
  expect(sidebarBox).not.toBeNull();
  expect(mainBox).not.toBeNull();
  expect(topbarBox).not.toBeNull();
  expect(mainBox!.x).toBeGreaterThanOrEqual(sidebarBox!.x + sidebarBox!.width - 1);
  expect(topbarBox!.x).toBeGreaterThanOrEqual(sidebarBox!.x + sidebarBox!.width - 1);
});

test("Sidebar em várias resoluções reais de notebook/desktop: sem sobreposição, sem scroll horizontal, mapas e dashboard continuam usáveis", async ({ page }) => {
  // Este teste deliberadamente navega 8 vezes (4 viewports × /dashboard + /mapas, esta última pesada --
  // mapa real + tiles), cada uma esperando "networkidle". Isso passa perto do limite mesmo sozinho (~28s
  // observado) e estourava os 30s padrão do Playwright quando rodava ao lado de outro worker (achado real
  // na validação pós-merge da Fase 3 -> develop, 2026-09-10) -- não é falha de aplicação (o mesmo teste,
  // isolado, sempre passou), é margem de tempo insuficiente para o volume de trabalho que o teste mesmo
  // decide fazer. Timeout maior, sem enfraquecer nenhuma asserção abaixo.
  test.setTimeout(90_000);
  await login(page, TENANT_A_EMAIL, TENANT_A_PASSWORD);

  for (const viewport of [{ width: 1366, height: 768 }, { width: 1440, height: 900 }, { width: 1536, height: 864 }, { width: 1920, height: 1080 }]) {
    await page.setViewportSize(viewport);

    await page.goto("/dashboard", { waitUntil: "networkidle" });
    await expect(page.locator(".sidebar")).toBeVisible();
    await expect(page.locator('.sidebar-bottom a[href="/configuracoes"]')).toBeVisible();
    await expect(page.locator(".sidebar .user-card")).toBeVisible();
    let overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `scroll horizontal em /dashboard @ ${viewport.width}x${viewport.height}`).toBeLessThanOrEqual(1);

    // Mapas é a tela mais pesada de layout (mapa real + painéis) -- confirma que a reestruturação da
    // sidebar não quebrou nenhuma página que depende de `.main-content`/`margin-left`.
    await page.goto("/mapas", { waitUntil: "networkidle" });
    await expect(page.locator(".sidebar")).toBeVisible();
    overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `scroll horizontal em /mapas @ ${viewport.width}x${viewport.height}`).toBeLessThanOrEqual(1);
  }
});

test("Sidebar mobile (abaixo do breakpoint) continua com a navegação inferior própria, sem a sidebar desktop", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page, TENANT_A_EMAIL, TENANT_A_PASSWORD);
  await page.goto("/dashboard", { waitUntil: "networkidle" });

  // Abaixo de 820px a `.sidebar` desktop fica oculta (regra pré-existente, não alterada por este patch) --
  // o mobile usa MobileNavigation, com sua própria ação de "Criar nova análise". Este teste garante que a
  // remoção do CTA duplicado da sidebar desktop não afetou a experiência mobile.
  await expect(page.locator(".sidebar")).toBeHidden();
  await expect(page.locator('a[aria-label="Criar nova análise"]')).toBeVisible();
});
