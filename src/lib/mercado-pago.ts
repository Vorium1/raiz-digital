import { createHmac, timingSafeEqual } from "node:crypto";

const MERCADO_PAGO_API = "https://api.mercadopago.com";
const EXTERNAL_REFERENCE_PREFIX = "rz";

export type MercadoPagoPayment = {
  id: string;
  status: string;
  status_detail?: string | null;
  external_reference?: string | null;
  transaction_amount: number;
  currency_id: string;
  date_approved?: string | null;
};

export type InternalPaymentStatus = "PENDING" | "PAID" | "FAILED" | "REFUNDED" | "CANCELED";

export class MercadoPagoApiError extends Error {
  constructor(message: string, public status: number | null = null) {
    super(message);
    this.name = "MercadoPagoApiError";
  }
}

function parseSignatureHeader(signature: string) {
  const parts = new Map<string, string>();
  for (const segment of signature.split(",")) {
    const separator = segment.indexOf("=");
    if (separator < 1) continue;
    const key = segment.slice(0, separator).trim();
    const value = segment.slice(separator + 1).trim();
    if (key && value && !parts.has(key)) parts.set(key, value);
  }
  return { ts: parts.get("ts") ?? null, v1: parts.get("v1") ?? null };
}

/**
 * Valida a assinatura de Webhook conforme o manifesto documentado pelo Mercado Pago:
 * id:<data.id>;request-id:<x-request-id>;ts:<ts>;
 *
 * A RAIZ exige data.id e x-request-id em vez de aceitar um manifesto parcial. Isso deixa
 * o recurso financeiro explicitamente vinculado à assinatura e evita processar um corpo
 * alterado usando apenas request-id/timestamp.
 */
export function verifyMercadoPagoWebhookSignature(input: {
  signature: string;
  requestId: string;
  dataId: string;
  secret: string;
}) {
  const { ts, v1 } = parseSignatureHeader(input.signature);
  if (!ts || !/^\d{10,16}$/.test(ts)) return false;
  if (!v1 || !/^[a-f0-9]{64}$/i.test(v1)) return false;
  if (!input.requestId.trim() || !input.dataId.trim() || !input.secret) return false;

  const manifest = `id:${input.dataId};request-id:${input.requestId};ts:${ts};`;
  const expectedHex = createHmac("sha256", input.secret).update(manifest).digest("hex");
  const expected = Buffer.from(expectedHex, "hex");
  const received = Buffer.from(v1, "hex");
  return expected.length === received.length && timingSafeEqual(expected, received);
}

export function mapMercadoPagoPaymentStatus(status: string): InternalPaymentStatus {
  switch (status.toLowerCase()) {
    case "approved":
      return "PAID";
    case "rejected":
      return "FAILED";
    case "cancelled":
    case "canceled":
    case "expired":
      return "CANCELED";
    case "refunded":
    case "charged_back":
    case "chargedback":
      return "REFUNDED";
    case "pending":
    case "in_process":
    case "inmediation":
    case "authorized":
    default:
      return "PENDING";
  }
}

export function amountInCents(value: number) {
  if (!Number.isFinite(value) || value < 0) return null;
  return Math.round((value + Number.EPSILON) * 100);
}

function uuidToCompact(uuid: string) {
  const hex = uuid.replaceAll("-", "").toLowerCase();
  if (!/^[a-f0-9]{32}$/.test(hex)) throw new Error("UUID inválido para referência financeira.");
  return Buffer.from(hex, "hex").toString("base64url");
}

function compactToUuid(value: string) {
  if (!/^[A-Za-z0-9_-]{22}$/.test(value)) return null;
  const bytes = Buffer.from(value, "base64url");
  if (bytes.length !== 16) return null;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * Fica abaixo do limite de 64 caracteres e usa apenas caracteres aceitos pelo campo
 * external_reference. O tenant faz parte da referência para que a reconciliação possa
 * entrar no contexto RLS correto sem uma consulta global a invoices.
 */
export function buildRaizInvoiceExternalReference(tenantId: string, invoiceId: string) {
  return `${EXTERNAL_REFERENCE_PREFIX}_${uuidToCompact(tenantId)}_${uuidToCompact(invoiceId)}`;
}

export function parseRaizInvoiceExternalReference(value: string | null | undefined) {
  if (!value) return null;
  const match = /^rz_([A-Za-z0-9_-]{22})_([A-Za-z0-9_-]{22})$/.exec(value);
  if (!match) return null;
  const tenantId = compactToUuid(match[1]);
  const invoiceId = compactToUuid(match[2]);
  if (!tenantId || !invoiceId) return null;
  return { tenantId, invoiceId };
}

function accessToken() {
  const token = process.env.MERCADO_PAGO_ACCESS_TOKEN?.trim();
  if (!token) throw new MercadoPagoApiError("MERCADO_PAGO_ACCESS_TOKEN não configurado.");
  return token;
}

export async function getMercadoPagoPayment(paymentId: string): Promise<MercadoPagoPayment> {
  const id = paymentId.trim();
  if (!/^[A-Za-z0-9-]{1,80}$/.test(id)) throw new MercadoPagoApiError("ID de pagamento do Mercado Pago inválido.", 400);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetch(`${MERCADO_PAGO_API}/v1/payments/${encodeURIComponent(id)}`, {
      method: "GET",
      headers: { Authorization: `Bearer ${accessToken()}`, Accept: "application/json" },
      cache: "no-store",
      signal: controller.signal,
    });
    const body = await response.json().catch(() => ({})) as Record<string, unknown>;
    if (!response.ok) {
      const providerMessage = typeof body.message === "string" ? body.message : "falha sem mensagem";
      throw new MercadoPagoApiError(`Mercado Pago respondeu ${response.status}: ${providerMessage}`, response.status);
    }

    const amount = Number(body.transaction_amount);
    if (!body.id || typeof body.status !== "string" || !Number.isFinite(amount) || typeof body.currency_id !== "string") {
      throw new MercadoPagoApiError("Resposta de pagamento do Mercado Pago incompleta.", 502);
    }

    return {
      id: String(body.id),
      status: body.status,
      status_detail: typeof body.status_detail === "string" ? body.status_detail : null,
      external_reference: typeof body.external_reference === "string" ? body.external_reference : null,
      transaction_amount: amount,
      currency_id: body.currency_id,
      date_approved: typeof body.date_approved === "string" ? body.date_approved : null,
    };
  } catch (error) {
    if (error instanceof MercadoPagoApiError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new MercadoPagoApiError("Timeout consultando o status oficial no Mercado Pago.", 504);
    }
    throw new MercadoPagoApiError(error instanceof Error ? error.message : "Falha consultando o Mercado Pago.", 502);
  } finally {
    clearTimeout(timeout);
  }
}
