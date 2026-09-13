import assert from "node:assert/strict";
import { evaluateProductionReadiness } from "./check-production-readiness.mjs";

const good = evaluateProductionReadiness({
  DATA_MODE: "database",
  APP_DATABASE_URL: "postgresql://raiz_app:runtime-password@db.example.neon.tech/raiz?sslmode=require",
  DATABASE_URL: "postgresql://raiz_admin:admin-password@db.example.neon.tech/raiz?sslmode=require",
  DATABASE_SSL: "require",
  AUTH_SECRET: "4a52f2d8709ecf43f5d27b8ff36e4375d45d32af",
  APP_URL: "https://raiz.example.com.br",
  EMAIL_PROVIDER: "resend",
  RESEND_API_KEY: "re_live_configured_key",
  EMAIL_FROM: "RAIZ Digital <no-reply@raiz.example.com.br>",
  STORAGE_PROVIDER: "local",
  REPORT_STORAGE_PROVIDER: "inline",
  RAIZ_ASSISTANT_MODE: "local",
  COPERNICUS_CLIENT_ID: "copernicus-client",
  COPERNICUS_CLIENT_SECRET: "copernicus-secret",
  MERCADO_PAGO_ACCESS_TOKEN: "mp-token",
  MERCADO_PAGO_WEBHOOK_SECRET: "mp-secret",
});
assert.equal(good.ok, true, "Configuração comercial válida não pode ser bloqueada.");
assert.equal(good.failures.length, 0);
assert.ok(good.warnings.some((item) => item.name === "raw-import-archive"), "Retenção do arquivo bruto precisa continuar visível como dívida operacional.");

const unsafe = evaluateProductionReadiness({
  DATA_MODE: "demo",
  APP_DATABASE_URL: "postgresql://raiz:raiz@localhost:5432/raiz",
  DATABASE_URL: "postgresql://raiz:raiz@localhost:5432/raiz",
  DATABASE_SSL: "disable",
  AUTH_SECRET: "troque",
  APP_URL: "http://localhost:3000",
  EMAIL_PROVIDER: "console",
  RESEND_API_KEY: "",
  EMAIL_FROM: "RAIZ Digital <no-reply@seudominio.com.br>",
  STORAGE_PROVIDER: "local",
  REPORT_STORAGE_PROVIDER: "local",
  RAIZ_ASSISTANT_MODE: "hybrid",
});
assert.equal(unsafe.ok, false, "Configuração de desenvolvimento não pode passar como produção.");
for (const required of ["data-mode", "app-database", "least-privilege", "database-ssl", "auth-secret", "app-url", "email-provider", "email-api-key", "email-from", "report-storage", "assistant-mode"]) {
  assert.ok(unsafe.failures.some((item) => item.name === required), `Preflight deveria bloquear ${required}.`);
}

const noAdminRuntime = evaluateProductionReadiness({
  DATA_MODE: "database",
  APP_DATABASE_URL: "postgresql://raiz_app:runtime-password@db.example.neon.tech/raiz",
  DATABASE_SSL: "require",
  AUTH_SECRET: "89bd6b04b7ce3f44836a37643c9dde1183bcd237",
  APP_URL: "https://raiz.example.com.br",
  EMAIL_PROVIDER: "resend",
  RESEND_API_KEY: "re_live_configured_key",
  EMAIL_FROM: "RAIZ Digital <no-reply@raiz.example.com.br>",
  REPORT_STORAGE_PROVIDER: "inline",
  RAIZ_ASSISTANT_MODE: "local",
});
assert.equal(noAdminRuntime.ok, true, "DATABASE_URL administrativo pode ficar fora do runtime quando migrations rodam separadamente.");
assert.ok(noAdminRuntime.warnings.some((item) => item.name === "migration-database"));

console.log("production-readiness: cenários seguro, inseguro e runtime sem credencial admin aprovados");
