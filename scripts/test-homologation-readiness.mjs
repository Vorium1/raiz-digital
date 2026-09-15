import assert from "node:assert/strict";
import { evaluateHomologationReadiness } from "./check-homologation-readiness.mjs";

const remoteDb = (user, host, database) => ["postgresql://", user, ":", "pw", "@", host, "/", database].join("");
const configured = (name) => `${name}-configured-value`;

const safeBase = {
  DATA_MODE: "database",
  APP_DATABASE_URL: remoteDb("raiz_app", "db-runtime.test", "raiz"),
  DATABASE_URL: remoteDb("raiz_admin", "db-admin.test", "raiz"),
  DATABASE_SSL: "require",
  AUTH_SECRET: "a".repeat(40),
  APP_URL: "https://app.raiz.test",
  EMAIL_PROVIDER: "resend",
  RESEND_API_KEY: configured("resend"),
  EMAIL_FROM: "RAIZ Digital <no-reply@raiz.test>",
  STORAGE_PROVIDER: "s3",
  S3_ENDPOINT: "https://storage.raiz.test",
  S3_REGION: "auto",
  S3_BUCKET: "raiz-private",
  S3_ACCESS_KEY: configured("storage-access"),
  S3_SECRET_KEY: configured("storage-secret"),
  REPORT_STORAGE_PROVIDER: "inline",
  RAIZ_ASSISTANT_MODE: "local",
  COPERNICUS_CLIENT_ID: configured("copernicus-client"),
  COPERNICUS_CLIENT_SECRET: configured("copernicus-secret"),
  MERCADO_PAGO_ACCESS_TOKEN: configured("billing-access"),
  MERCADO_PAGO_WEBHOOK_SECRET: configured("billing-webhook"),
  MERCADO_PAGO_CHECKOUT_ENABLED: "false",
  HOMOLOGATION_DATABASE_URL: remoteDb("audit_user", "db-homologation.test", "raiz_homologation"),
  CABEDA_TENANT_ID: "123e4567-e89b-42d3-a456-426614174000",
};

const complete = evaluateHomologationReadiness(safeBase);
assert.equal(complete.automatedOk, true, "Contexto técnico completo não deve ter blocker automatizado.");
assert.equal(complete.releaseReady, false, "Preflight nunca pode emitir GO de produção automaticamente.");
assert.ok(complete.manualGates.length > 0, "Gates externos/humanos precisam permanecer explícitos.");
assert.ok(complete.checks.some((item) => item.name === "cabeda-audit-context" && item.status === "READY_TO_EXECUTE"));

const missingCabeda = evaluateHomologationReadiness({
  ...safeBase,
  HOMOLOGATION_DATABASE_URL: "",
  CABEDA_TENANT_ID: "",
});
assert.equal(missingCabeda.automatedOk, false, "Auditoria Cabeda sem contexto precisa permanecer bloqueada.");
assert.ok(missingCabeda.blocked.some((item) => item.name === "cabeda-audit-context"));

const invalidCabeda = evaluateHomologationReadiness({
  ...safeBase,
  HOMOLOGATION_DATABASE_URL: remoteDb("audit", "localhost", "raiz"),
  CABEDA_TENANT_ID: "cabeda",
});
assert.equal(invalidCabeda.automatedOk, false, "Host local/tenant inválido não pode autorizar auditoria Cabeda.");
assert.ok(invalidCabeda.blocked.some((item) => item.name === "cabeda-audit-context"));

const missingBilling = evaluateHomologationReadiness({
  ...safeBase,
  MERCADO_PAGO_ACCESS_TOKEN: "",
  MERCADO_PAGO_WEBHOOK_SECRET: "",
});
assert.equal(missingBilling.automatedOk, false, "Homologação financeira prevista no piloto precisa de configuração mínima.");
assert.ok(missingBilling.blocked.some((item) => item.name === "mercado-pago-config"));

const serialized = JSON.stringify(complete);
for (const secret of [
  safeBase.AUTH_SECRET,
  safeBase.RESEND_API_KEY,
  safeBase.S3_ACCESS_KEY,
  safeBase.S3_SECRET_KEY,
  safeBase.MERCADO_PAGO_ACCESS_TOKEN,
  safeBase.MERCADO_PAGO_WEBHOOK_SECRET,
  safeBase.COPERNICUS_CLIENT_SECRET,
  safeBase.HOMOLOGATION_DATABASE_URL,
]) {
  assert.equal(serialized.includes(secret), false, "Resultado privacy-safe não pode serializar valores sensíveis.");
}

console.log("homologation-readiness: configuração, Cabeda, financeiro, manual gates e privacy-safe aprovados");
