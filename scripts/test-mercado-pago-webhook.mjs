import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import {
  getMercadoPagoCheckoutActivation,
  isMercadoPagoBrazilCheckoutUrl,
} from "../src/domain/mercado-pago-checkout.ts";
import {
  amountInCents,
  buildRaizInvoiceExternalReference,
  mapMercadoPagoPaymentStatus,
  normalizeMercadoPagoPaymentIds,
  parseRaizInvoiceExternalReference,
  verifyMercadoPagoWebhookSignature,
} from "../src/lib/mercado-pago.ts";

const secret = "segredo-de-teste-mercado-pago";
const requestId = "123e4567-e89b-12d3-a456-426614174000";
const dataId = "987654321";
const ts = "1742505638683";
const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`;
const hash = createHmac("sha256", secret).update(manifest).digest("hex");
const signature = `ts=${ts},v1=${hash}`;

assert.equal(
  verifyMercadoPagoWebhookSignature({ signature, requestId, dataId, secret }),
  true,
  "assinatura correta deve ser aceita",
);
assert.equal(
  verifyMercadoPagoWebhookSignature({ signature, requestId, dataId: "987654322", secret }),
  false,
  "trocar o recurso assinado deve invalidar a assinatura",
);
assert.equal(
  verifyMercadoPagoWebhookSignature({ signature: `ts=${ts},v1=${"é" + "a".repeat(63)}`, requestId, dataId, secret }),
  false,
  "v1 não hexadecimal deve ser rejeitado sem lançar RangeError",
);
assert.equal(
  verifyMercadoPagoWebhookSignature({ signature: `ts=abc,v1=${hash}`, requestId, dataId, secret }),
  false,
  "timestamp malformado deve ser rejeitado",
);

const orderDataId = "ORD01JQ4S4KY8HWQ6NA5PXB65B3D3";
const orderManifest = `id:${orderDataId.toLowerCase()};request-id:${requestId};ts:${ts};`;
const orderHash = createHmac("sha256", secret).update(orderManifest).digest("hex");
const orderSignature = `ts=${ts},v1=${orderHash}`;
assert.equal(
  verifyMercadoPagoWebhookSignature({ signature: orderSignature, requestId, dataId: orderDataId, secret }),
  true,
  "assinatura de order deve normalizar data.id alfanumérico para minúsculas",
);

assert.deepEqual(
  normalizeMercadoPagoPaymentIds([" pay-1 ", "pay-1", "", "pay-2"]),
  ["pay-1", "pay-2"],
  "duplicatas idênticas não podem simular múltiplos pagamentos, mas IDs distintos devem ser preservados",
);
assert.deepEqual(
  normalizeMercadoPagoPaymentIds(["pay_ilegível", "***", "ok-123"]),
  ["ok-123"],
  "IDs fora do formato financeiro aceito não devem chegar à reconciliação",
);

const tenantId = "0f0c1a7e-7c8f-4f2d-9e7b-8a3a2c7d6e5f";
const invoiceId = "7ccac0e0-2c7c-43a8-9daf-ccbd32306517";
const reference = buildRaizInvoiceExternalReference(tenantId, invoiceId);
assert.ok(reference.length <= 64, "external_reference precisa caber no limite do provedor");
assert.match(reference, /^[A-Za-z0-9_-]+$/, "external_reference deve usar somente caracteres portáveis");
assert.deepEqual(parseRaizInvoiceExternalReference(reference), { tenantId, invoiceId });
assert.equal(parseRaizInvoiceExternalReference("pedido-do-outro-sistema"), null);
assert.equal(parseRaizInvoiceExternalReference("rz_invalido_invalido"), null);

assert.equal(mapMercadoPagoPaymentStatus("approved"), "PAID");
assert.equal(mapMercadoPagoPaymentStatus("pending"), "PENDING");
assert.equal(mapMercadoPagoPaymentStatus("in_process"), "PENDING");
assert.equal(mapMercadoPagoPaymentStatus("rejected"), "FAILED");
assert.equal(mapMercadoPagoPaymentStatus("cancelled"), "CANCELED");
assert.equal(mapMercadoPagoPaymentStatus("refunded"), "REFUNDED");
assert.equal(mapMercadoPagoPaymentStatus("charged_back"), "REFUNDED");
assert.equal(mapMercadoPagoPaymentStatus("status-futuro-desconhecido"), "PENDING", "status desconhecido deve falhar fechado em pendente");

assert.equal(amountInCents(2750), 275000);
assert.equal(amountInCents(10.99), 1099);
assert.equal(amountInCents(Number.NaN), null);

assert.equal(isMercadoPagoBrazilCheckoutUrl("https://www.mercadopago.com.br/checkout/v1/redirect?pref_id=1"), true);
assert.equal(isMercadoPagoBrazilCheckoutUrl("https://mercadopago.com.br/checkout"), true);
assert.equal(isMercadoPagoBrazilCheckoutUrl("https://sandbox.mercadopago.com.br/checkout"), true);
assert.equal(isMercadoPagoBrazilCheckoutUrl("https://evilmercadopago.com.br/checkout"), false, "sufixo sem limite de domínio não pode passar");
assert.equal(isMercadoPagoBrazilCheckoutUrl("http://www.mercadopago.com.br/checkout"), false, "checkout deve usar HTTPS");
assert.equal(isMercadoPagoBrazilCheckoutUrl("javascript:alert(1)"), false);

assert.deepEqual(
  getMercadoPagoCheckoutActivation({
    MERCADO_PAGO_ACCESS_TOKEN: "token-teste",
    MERCADO_PAGO_WEBHOOK_SECRET: "segredo-teste",
    MERCADO_PAGO_CHECKOUT_ENABLED: "false",
  }),
  { credentialsConfigured: true, explicitlyEnabled: false, available: false },
  "credenciais por si só nunca podem ligar o checkout comercial",
);
assert.deepEqual(
  getMercadoPagoCheckoutActivation({
    MERCADO_PAGO_ACCESS_TOKEN: "token-teste",
    MERCADO_PAGO_WEBHOOK_SECRET: "segredo-teste",
    MERCADO_PAGO_CHECKOUT_ENABLED: "TRUE",
  }),
  { credentialsConfigured: true, explicitlyEnabled: true, available: true },
  "checkout só fica disponível com credenciais e opt-in explícito",
);
assert.deepEqual(
  getMercadoPagoCheckoutActivation({ MERCADO_PAGO_CHECKOUT_ENABLED: "true" }),
  { credentialsConfigured: false, explicitlyEnabled: true, available: false },
  "flag sem credenciais deve falhar fechada",
);

console.log("✓ Mercado Pago: assinatura HMAC, IDs de Order/payment, referência, valores, status, domínio e gate comercial validados");
