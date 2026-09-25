import assert from "node:assert/strict";
import { getProductionRuntimeReadiness } from "../src/domain/production-runtime-readiness.ts";

const safeEnv = {
  DATA_MODE: "database",
  APP_DATABASE_URL: "postgresql://raiz_app:runtime-password@ep-green-field-123456.sa-east-1.aws.neon.tech/raiz?sslmode=require",
  DATABASE_URL: "postgresql://raiz_admin:admin-password@ep-green-field-123456.sa-east-1.aws.neon.tech/raiz?sslmode=require",
  DATABASE_SSL: "require",
  AUTH_SECRET: "4a52f2d8709ecf43f5d27b8ff36e4375d45d32af",
  APP_URL: "https://app.raizdigital.com.br",
  EMAIL_PROVIDER: "resend",
  RESEND_API_KEY: "re_live_configured_key",
  EMAIL_FROM: "RAIZ Digital <no-reply@raizdigital.com.br>",
  STORAGE_PROVIDER: "s3",
  S3_ENDPOINT: "https://1234567890.r2.cloudflarestorage.com",
  S3_REGION: "auto",
  S3_BUCKET: "raiz-private",
  S3_ACCESS_KEY: "access-key-configured",
  S3_SECRET_KEY: "secret-key-configured",
  REPORT_STORAGE_PROVIDER: "inline",
  RAIZ_ASSISTANT_MODE: "local",
  MERCADO_PAGO_CHECKOUT_ENABLED: "false",
};

const ready = getProductionRuntimeReadiness(safeEnv);
assert.equal(ready.httpStatus, 200);
assert.deepEqual(ready.payload, { status: "ready" });
assert.deepEqual(Object.keys(ready.payload), ["status"]);

const unsafe = getProductionRuntimeReadiness({
  DATA_MODE: "demo",
  AUTH_SECRET: "troque",
  APP_URL: "http://localhost:3000",
  STORAGE_PROVIDER: "local",
  REPORT_STORAGE_PROVIDER: "local",
});
assert.equal(unsafe.httpStatus, 503);
assert.deepEqual(unsafe.payload, { status: "not_ready" });
assert.deepEqual(Object.keys(unsafe.payload), ["status"]);
assert.ok(unsafe.evaluation.failures.length > 0);

const serializedPublicPayload = JSON.stringify(unsafe.payload);
for (const forbidden of [
  "APP_DATABASE_URL",
  "DATABASE_URL",
  "AUTH_SECRET",
  "S3_SECRET_KEY",
  "failure",
  "warning",
  "localhost",
]) {
  assert.equal(serializedPublicPayload.includes(forbidden), false, `Payload público não pode expor ${forbidden}.`);
}

console.log("production-runtime-readiness: ready/not_ready e payload público mínimo aprovados");
