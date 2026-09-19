import assert from "node:assert/strict";
import {
  getOperationalIntegrationReadiness,
  operationalIntegrationScore,
} from "../src/domain/operational-readiness.ts";

const completeEnv = {
  EMAIL_PROVIDER: "resend",
  RESEND_API_KEY: "resend-secret-value",
  EMAIL_FROM: "RAIZ <no-reply@raiz.test>",
  STORAGE_PROVIDER: "s3",
  S3_ENDPOINT: "https://storage.raiz.test",
  S3_REGION: "auto",
  S3_BUCKET: "raiz-private",
  S3_ACCESS_KEY: "storage-access-key",
  S3_SECRET_KEY: "storage-secret-key",
  MERCADO_PAGO_ACCESS_TOKEN: "mp-access-token-secret",
  MERCADO_PAGO_WEBHOOK_SECRET: "mp-webhook-secret",
  REPORT_STORAGE_PROVIDER: "inline",
};

const ready = getOperationalIntegrationReadiness(completeEnv);
assert.deepEqual(ready, {
  email: true,
  rawStorage: true,
  mercadoPago: true,
  satelliteNdvi: true,
  reportStorage: true,
});
assert.deepEqual(operationalIntegrationScore(ready), { ready: 5, total: 5 });

const serialized = JSON.stringify(ready);
for (const secret of [
  completeEnv.RESEND_API_KEY,
  completeEnv.S3_ACCESS_KEY,
  completeEnv.S3_SECRET_KEY,
  completeEnv.MERCADO_PAGO_ACCESS_TOKEN,
  completeEnv.MERCADO_PAGO_WEBHOOK_SECRET,
]) {
  assert.equal(serialized.includes(secret), false, "o resumo operacional nunca pode carregar o valor de um segredo");
}

const incomplete = getOperationalIntegrationReadiness({
  EMAIL_PROVIDER: "console",
  STORAGE_PROVIDER: "local",
  REPORT_STORAGE_PROVIDER: "inline",
  MERCADO_PAGO_ACCESS_TOKEN: "somente-token",
});
assert.deepEqual(incomplete, {
  email: false,
  rawStorage: false,
  mercadoPago: false,
  satelliteNdvi: true,
  reportStorage: true,
});
assert.deepEqual(operationalIntegrationScore(incomplete), { ready: 2, total: 5 });

console.log("✓ Observabilidade: prontidão agregada sem exposição de segredos validada");
