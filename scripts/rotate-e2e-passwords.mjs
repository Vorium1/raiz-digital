// Gera senha nova e forte para cada conta de teste de e2e/README.md e aplica pelo fluxo REAL do
// app (POST /api/auth/forgot-password -> token sai no log do dev server, só funciona com
// EMAIL_PROVIDER=console -> POST /api/auth/reset-password). Nunca escreve direto no banco.
//
// Uso: 1) `npm run dev` rodando, com a saída redirecionada para um arquivo de log;
//      2) `node scripts/rotate-e2e-passwords.mjs <caminho-do-log>`
//
// Escreve as senhas novas em `.env.e2e.local` (raiz do projeto, já coberto por `.env*` no
// .gitignore — nunca commitar). Não imprime nenhuma senha no terminal.
import { readFileSync, writeFileSync } from "fs";
import { randomBytes } from "node:crypto";

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const [, , logPath] = process.argv;
if (!logPath) throw new Error("uso: node scripts/rotate-e2e-passwords.mjs <caminho-do-log-do-dev-server>");

// email -> nome da variável que e2e/*.spec.ts espera (ver e2e/README.md).
const ACCOUNTS = {
  "admin@raiz.local": "E2E_ADMIN_PASSWORD",
  "e2e-tenant-b@raiz.local": "E2E_TENANT_B_PASSWORD",
  "e2e-2fa@raiz.local": "E2E_TWO_FACTOR_PASSWORD",
  "rbac-agronomist@raiz.local": "E2E_RBAC_AGRONOMIST_PASSWORD",
  "rbac-field-tech@raiz.local": "E2E_RBAC_FIELD_TECH_PASSWORD",
  "rbac-commercial@raiz.local": "E2E_RBAC_COMMERCIAL_PASSWORD",
  "rbac-viewer@raiz.local": "E2E_RBAC_VIEWER_PASSWORD",
};

function generatePassword(length = 24) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const bytes = randomBytes(length);
  return Array.from(bytes, (b) => chars[b % chars.length]).join("");
}

function readLog() {
  try { return readFileSync(logPath, "utf8"); } catch { return ""; }
}

function extractLatestTokenFor(email, logText) {
  const idx = logText.lastIndexOf(`Para: ${email}`);
  if (idx === -1) return null;
  const match = logText.slice(idx).match(/redefinir-senha\?token=([a-f0-9]{64})/);
  return match ? match[1] : null;
}

const envLines = [
  "# Credenciais locais para `npm run test:e2e` — gerado por scripts/rotate-e2e-passwords.mjs.",
  "# NUNCA commitar (.env* já está no .gitignore).",
  "",
];
const results = [];

for (const [email, envVar] of Object.entries(ACCOUNTS)) {
  const password = generatePassword();
  const logBefore = readLog();

  const forgot = await fetch(`${BASE}/api/auth/forgot-password`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email }),
  });
  if (!forgot.ok) { results.push({ email, ok: false, step: "forgot-password" }); continue; }

  await new Promise((r) => setTimeout(r, 400));
  const newLog = readLog().slice(logBefore.length);
  const token = extractLatestTokenFor(email, newLog);
  if (!token) { results.push({ email, ok: false, step: "extract-token (EMAIL_PROVIDER=console configurado?)" }); continue; }

  const reset = await fetch(`${BASE}/api/auth/reset-password`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token, newPassword: password }),
  });
  if (!reset.ok) { results.push({ email, ok: false, step: "reset-password" }); continue; }

  const loginCheck = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  results.push({ email, ok: loginCheck.ok, step: "done" });
  if (loginCheck.ok) envLines.push(`${envVar}=${password}`);
}

writeFileSync(".env.e2e.local", envLines.join("\n") + "\n");

console.log(results.map(({ email, ok, step }) => `${ok ? "OK  " : "FAIL"} ${email}${ok ? "" : ` (${step})`}`).join("\n"));
const failed = results.filter((r) => !r.ok);
if (failed.length) { console.error(`\n${failed.length} conta(s) falharam — senhas não foram alteradas para elas.`); process.exit(1); }
console.log("\nTodas as contas rotacionadas. Senhas novas em .env.e2e.local (não commitado, não impresso aqui).");
