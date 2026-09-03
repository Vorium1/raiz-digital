import { test, expect, type Page } from "@playwright/test";
import { Client } from "pg";
import { totpAtCounter, currentTotpCounter } from "./helpers/totp";

// Cobre o fluxo de 2FA (src/lib/auth/two-factor.ts, src/lib/auth/totp.ts e as rotas
// src/app/api/auth/2fa/*) contra o banco real. Usa uma conta dedicada (e2e-2fa@raiz.local, ver
// e2e/README.md) para não interferir em contas usadas por gente de verdade.
//
// Senha vem de variável de ambiente (repositório é público, nunca commitar senha real).
const EMAIL = "e2e-2fa@raiz.local";
const PASSWORD = (() => {
  const value = process.env.E2E_TWO_FACTOR_PASSWORD;
  if (!value) throw new Error("E2E_TWO_FACTOR_PASSWORD precisa estar definida para rodar os testes e2e (ver e2e/README.md).");
  return value;
})();

function dbUrl() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL precisa estar definida para rodar os testes e2e (mesma variável usada pelo `npm run dev`).");
  return url;
}

async function withDb<T>(work: (client: Client) => Promise<T>) {
  const client = new Client({ connectionString: dbUrl(), ssl: process.env.DATABASE_SSL === "require" ? { rejectUnauthorized: false } : undefined });
  await client.connect();
  try {
    return await work(client);
  } finally {
    await client.end();
  }
}

async function resetAccount() {
  await withDb(async (client) => {
    await client.query("UPDATE users SET two_factor_enabled = false, totp_secret = NULL, totp_last_counter = NULL WHERE email = $1::citext", [EMAIL]);
    await client.query("DELETE FROM totp_backup_codes WHERE user_id = (SELECT id FROM users WHERE email = $1::citext)", [EMAIL]);
    await client.query("DELETE FROM pending_two_factor_logins WHERE user_id = (SELECT id FROM users WHERE email = $1::citext)", [EMAIL]);
    await client.query("DELETE FROM login_attempts WHERE email = $1::citext", [EMAIL]);
  });
}

async function login(page: Page) {
  await page.goto("/login");
  await page.fill('input[name="email"]', EMAIL);
  await page.fill('input[name="password"]', PASSWORD);
  await Promise.all([page.waitForURL(/dashboard/, { timeout: 15_000 }), page.click(".login-submit")]);
}

test.beforeEach(async () => { await resetAccount(); });
test.afterAll(async () => { await resetAccount(); });

test("ativar 2FA gera QR code, exige codigo correto e entrega 10 codigos de backup", async ({ page }) => {
  await login(page);
  await page.goto("/configuracoes");
  await page.click('button:has-text("Ativar verificação em duas etapas")');

  const secret = (await page.locator(".two-factor-setup code").textContent())?.trim();
  expect(secret).toBeTruthy();

  await page.fill('.two-factor-setup input[placeholder="Código de 6 dígitos"]', "000000");
  await page.click('button:has-text("Confirmar e ativar")');
  await expect(page.locator(".import-message.danger")).toBeVisible();

  await page.fill('.two-factor-setup input[placeholder="Código de 6 dígitos"]', totpAtCounter(secret!, currentTotpCounter()));
  await page.click('button:has-text("Confirmar e ativar")');
  await expect(page.locator(".backup-codes-grid code")).toHaveCount(10);
});

test("login com 2FA ativo pede o codigo, rejeita errado e aceita o certo", async ({ page }) => {
  const { secret, activationCounter } = await ativarViaApi(page);
  await page.evaluate(() => fetch("/api/auth/logout", { method: "POST" }));

  await page.goto("/login");
  await page.fill('input[name="email"]', EMAIL);
  await page.fill('input[name="password"]', PASSWORD);
  await page.click(".login-submit");
  await expect(page.locator('input[name="code"]')).toBeVisible();

  await page.fill('input[name="code"]', "000000");
  await page.click('button:has-text("Confirmar")');
  await expect(page.locator(".login-error")).toBeVisible();

  // Usa o passo seguinte ao consumido na ativação (não o "agora" de novo): a proteção contra replay
  // rejeitaria corretamente o mesmo passo de 30s usado para confirmar o 2FA há poucos segundos.
  await page.fill('input[name="code"]', totpAtCounter(secret, activationCounter + 1));
  await Promise.all([page.waitForURL(/dashboard/, { timeout: 15_000 }), page.click('button:has-text("Confirmar")')]);
});

test("codigo TOTP nao pode ser reaproveitado (protecao contra replay)", async ({ page }) => {
  const { secret, activationCounter } = await ativarViaApi(page);
  await page.evaluate(() => fetch("/api/auth/logout", { method: "POST" }));

  const code = totpAtCounter(secret, activationCounter + 1); // passo diferente do consumido na ativacao

  const first = await postJson(page, "/api/auth/login", { email: EMAIL, password: PASSWORD });
  const firstVerify = await postJson(page, "/api/auth/2fa/verify", { pendingToken: first.payload.pendingToken, code });
  expect(firstVerify.status).toBe(200);

  await postJson(page, "/api/auth/logout", undefined);
  const second = await postJson(page, "/api/auth/login", { email: EMAIL, password: PASSWORD });
  const replay = await postJson(page, "/api/auth/2fa/verify", { pendingToken: second.payload.pendingToken, code });
  expect(replay.status).toBe(422);
});

test("reconfigurar 2FA ja ativo exige a senha atual", async ({ page }) => {
  await ativarViaApi(page);

  const semSenha = await postJson(page, "/api/auth/2fa/setup", undefined);
  expect(semSenha.status).toBe(400);

  const senhaErrada = await postJson(page, "/api/auth/2fa/setup", { password: "senha-errada-qualquer" });
  expect(senhaErrada.status).toBe(401);

  const senhaCerta = await postJson(page, "/api/auth/2fa/setup", { password: PASSWORD });
  expect(senhaCerta.status).toBe(200);
});

test("desativar exige senha e realmente desliga a exigencia", async ({ page }) => {
  await ativarViaApi(page);

  const senhaErrada = await page.evaluate(async (password) => {
    const res = await fetch("/api/auth/2fa", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ password }) });
    return res.status;
  }, "senha-errada");
  expect(senhaErrada).toBe(401);

  const senhaCerta = await page.evaluate(async (password) => {
    const res = await fetch("/api/auth/2fa", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ password }) });
    return res.status;
  }, PASSWORD);
  expect(senhaCerta).toBe(200);

  await page.evaluate(() => fetch("/api/auth/logout", { method: "POST" }));
  await page.goto("/login");
  await page.fill('input[name="email"]', EMAIL);
  await page.fill('input[name="password"]', PASSWORD);
  await Promise.all([page.waitForURL(/dashboard/, { timeout: 15_000 }), page.click(".login-submit")]);
});

async function postJson(page: Page, url: string, body: unknown) {
  return page.evaluate(async ({ url, body }) => {
    const res = await fetch(url, { method: "POST", headers: body ? { "content-type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
    return { status: res.status, payload: await res.json().catch(() => ({})) };
  }, { url, body });
}

/** Ativa o 2FA pela API (mais rápido que repetir o fluxo de tela em todo teste) e devolve o secret
 *  junto com o passo de 30s consumido na confirmação, para quem for logar em seguida usar um passo
 *  diferente (a proteção contra replay rejeitaria reusar o mesmo). */
async function ativarViaApi(page: Page) {
  await login(page);
  const setup = await page.evaluate(async () => {
    const res = await fetch("/api/auth/2fa/setup", { method: "POST" });
    return res.json();
  });
  const secret = setup.secret as string;
  const activationCounter = currentTotpCounter();
  const confirm = await page.evaluate(async (code) => {
    const res = await fetch("/api/auth/2fa/confirm", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code }) });
    return { status: res.status, payload: await res.json().catch(() => ({})) };
  }, totpAtCounter(secret, activationCounter));
  expect(confirm.status).toBe(200);
  return { secret, activationCounter };
}
