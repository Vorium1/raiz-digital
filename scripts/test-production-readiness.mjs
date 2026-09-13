import assert from "node:assert/strict";
import { evaluateProductionReadiness } from "./check-production-readiness.mjs";

const s3 = {
  STORAGE_PROVIDER: "s3",
  S3_ENDPOINT: "https://1234567890.r2.cloudflarestorage.com",
  S3_REGION: "auto",
  S3_BUCKET: "raiz-private",
  S3_ACCESS_KEY: "access-key-configured",
  S3_SECRET_KEY: "secret-key-configured",
};

const safeBase = {
  DATA_MODE: "database",
  APP_DATABASE_URL: "postgresql://raiz_app:runtime-password@ep-green-field-123456.sa-east-1.aws.neon.tech/raiz?sslmode=require",
  DATABASE_URL: "postgresql://raiz_admin:admin-password@ep-green-field-123456.sa-east-1.aws.neon.tech/raiz?sslmode=require",
  DATABASE_SSL: "require",
  AUTH_SECRET: "4a52f2d8709ecf43f5d27b8ff36e4375d45d32af",
  APP_URL: "https://app.raizdigital.com.br",
  EMAIL_PROVIDER: "resend",
  RESEND_API_KEY: "re_live_configured_key",
  EMAIL_FROM: "RAIZ Digital <no-reply@raizdigital.com.br>",
  ...s3,
  REPORT_STORAGE_PROVIDER: "inline",
  RAIZ_ASSISTANT_MODE: "local",
  COPERNICUS_CLIENT_ID: "copernicus-client",
  COPERNICUS_CLIENT_SECRET: "copernicus-secret",
};

const good = evaluateProductionReadiness({
  ...safeBase,
  MERCADO_PAGO_ACCESS_TOKEN: "mp-token",
  MERCADO_PAGO_WEBHOOK_SECRET: "mp-secret",
  MERCADO_PAGO_CHECKOUT_ENABLED: "false",
});
assert.equal(good.ok, true, "Configuração comercial válida não pode ser bloqueada.");
assert.equal(good.failures.length, 0);
assert.ok(good.checks.some((item) => item.name === "raw-import-archive" && item.level === "PASS"));
assert.ok(good.checks.some((item) => item.name === "billing" && item.level === "PASS"));
assert.ok(good.checks.some((item) => item.name === "billing-checkout" && item.level === "PASS"));

const goodWithCheckout = evaluateProductionReadiness({
  ...safeBase,
  MERCADO_PAGO_ACCESS_TOKEN: "mp-token",
  MERCADO_PAGO_WEBHOOK_SECRET: "mp-secret",
  MERCADO_PAGO_CHECKOUT_ENABLED: "true",
});
assert.equal(goodWithCheckout.ok, true, "Checkout explicitamente habilitado com credenciais completas pode passar o preflight.");
assert.ok(goodWithCheckout.checks.some((item) => item.name === "billing-checkout" && item.level === "PASS"));

const unsafeBillingActivation = evaluateProductionReadiness({
  ...safeBase,
  MERCADO_PAGO_ACCESS_TOKEN: "mp-token",
  MERCADO_PAGO_WEBHOOK_SECRET: "",
  MERCADO_PAGO_CHECKOUT_ENABLED: "true",
});
assert.equal(unsafeBillingActivation.ok, false, "Checkout habilitado sem credenciais completas deve bloquear promoção.");
assert.ok(unsafeBillingActivation.failures.some((item) => item.name === "billing-checkout"));

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
for (const required of ["data-mode", "app-database", "least-privilege", "database-ssl", "auth-secret", "app-url", "email-provider", "email-api-key", "email-from", "report-storage", "raw-import-archive", "assistant-mode"]) {
  assert.ok(unsafe.failures.some((item) => item.name === required), `Preflight deveria bloquear ${required}.`);
}
assert.ok(unsafe.checks.some((item) => item.name === "billing-checkout" && item.level === "PASS"), "Checkout ausente/desligado deve continuar sendo um estado seguro.");

const noAdminRuntime = evaluateProductionReadiness({
  DATA_MODE: "database",
  APP_DATABASE_URL: "postgresql://raiz_app:runtime-password@ep-green-field-123456.sa-east-1.aws.neon.tech/raiz",
  DATABASE_SSL: "require",
  AUTH_SECRET: "89bd6b04b7ce3f44836a37643c9dde1183bcd237",
  APP_URL: "https://app.raizdigital.com.br",
  EMAIL_PROVIDER: "resend",
  RESEND_API_KEY: "re_live_configured_key",
  EMAIL_FROM: "RAIZ Digital <no-reply@raizdigital.com.br>",
  ...s3,
  REPORT_STORAGE_PROVIDER: "inline",
  RAIZ_ASSISTANT_MODE: "local",
  MERCADO_PAGO_CHECKOUT_ENABLED: "false",
});
assert.equal(noAdminRuntime.ok, true, "DATABASE_URL administrativo pode ficar fora do runtime quando migrations rodam separadamente.");
assert.ok(noAdminRuntime.warnings.some((item) => item.name === "migration-database"));

const incompleteObjectStorage = evaluateProductionReadiness({
  DATA_MODE: "database",
  APP_DATABASE_URL: "postgresql://raiz_app:runtime-password@ep-green-field-123456.sa-east-1.aws.neon.tech/raiz",
  DATABASE_SSL: "require",
  AUTH_SECRET: "89bd6b04b7ce3f44836a37643c9dde1183bcd237",
  APP_URL: "https://app.raizdigital.com.br",
  EMAIL_PROVIDER: "resend",
  RESEND_API_KEY: "re_live_configured_key",
  EMAIL_FROM: "RAIZ Digital <no-reply@raizdigital.com.br>",
  STORAGE_PROVIDER: "s3",
  S3_ENDPOINT: "http://localhost:9000",
  S3_REGION: "auto",
  S3_BUCKET: "raiz-private",
  S3_ACCESS_KEY: "access-key-configured",
  S3_SECRET_KEY: "",
  REPORT_STORAGE_PROVIDER: "inline",
  RAIZ_ASSISTANT_MODE: "local",
  MERCADO_PAGO_CHECKOUT_ENABLED: "false",
});
assert.equal(incompleteObjectStorage.ok, false);
assert.ok(incompleteObjectStorage.failures.some((item) => item.name === "raw-import-archive"));

console.log("production-readiness: cenários seguro, checkout explícito, ativação inconsistente, runtime sem admin e S3 incompleto aprovados");
