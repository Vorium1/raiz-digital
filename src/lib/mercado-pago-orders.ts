import { buildRaizInvoiceExternalReference, MercadoPagoApiError } from "@/lib/mercado-pago";

const MERCADO_PAGO_API = "https://api.mercadopago.com";

export type MercadoPagoCheckoutOrder = {
  id: string;
  checkoutUrl: string;
  externalReference: string;
  status: string;
};

export type MercadoPagoOrder = {
  id: string;
  externalReference: string | null;
  totalAmount: number;
  totalPaidAmount: number;
  currency: string | null;
  status: string;
  statusDetail: string | null;
  paymentIds: string[];
};

function accessToken() {
  const token = process.env.MERCADO_PAGO_ACCESS_TOKEN?.trim();
  if (!token) throw new MercadoPagoApiError("MERCADO_PAGO_ACCESS_TOKEN não configurado.", 503);
  return token;
}

function amountFromCents(amountCents: number) {
  if (!Number.isInteger(amountCents) || amountCents <= 0) {
    throw new MercadoPagoApiError("A fatura precisa ter valor positivo em centavos.", 422);
  }
  return (amountCents / 100).toFixed(2);
}

function safeReturnUrl(path: string) {
  const base = process.env.APP_URL?.trim();
  if (!base) return undefined;
  try {
    const url = new URL(path, base.endsWith("/") ? base : `${base}/`);
    if (process.env.NODE_ENV === "production" && url.protocol !== "https:") return undefined;
    return url.toString();
  } catch {
    return undefined;
  }
}

export function isMercadoPagoBrazilCheckoutUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && (url.hostname === "mercadopago.com.br" || url.hostname.endsWith(".mercadopago.com.br"));
  } catch {
    return false;
  }
}

/**
 * Cria uma Order de Checkout Pro para uma fatura já existente na RAIZ.
 * A chamada não marca a fatura como paga; a autoridade continua sendo a
 * reconciliação assíncrona do webhook contra o recurso oficial do provedor.
 */
export async function createMercadoPagoInvoiceCheckout(input: {
  tenantId: string;
  invoiceId: string;
  amountCents: number;
}) : Promise<MercadoPagoCheckoutOrder> {
  const amount = amountFromCents(input.amountCents);
  const externalReference = buildRaizInvoiceExternalReference(input.tenantId, input.invoiceId);
  const idempotencyKey = `raiz-invoice-${input.invoiceId}`;
  const successUrl = safeReturnUrl("/financeiro?checkout=success");
  const failureUrl = safeReturnUrl("/financeiro?checkout=failure");
  const pendingUrl = safeReturnUrl("/financeiro?checkout=pending");

  const onlineConfig = successUrl && failureUrl && pendingUrl
    ? { success_url: successUrl, failure_url: failureUrl, pending_url: pendingUrl, auto_return: "approved" }
    : undefined;

  const body = {
    type: "online",
    total_amount: amount,
    external_reference: externalReference,
    processing_mode: "manual",
    capture_mode: "automatic_async",
    expiration_time: "P1D",
    description: "RAIZ Digital — mensalidade",
    items: [{
      external_code: `invoice-${input.invoiceId}`,
      title: "RAIZ Digital — mensalidade",
      description: "Fatura da plataforma RAIZ Digital",
      quantity: 1,
      unit_price: amount,
    }],
    ...(onlineConfig ? { config: { online: onlineConfig } } : {}),
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(`${MERCADO_PAGO_API}/v1/orders`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken()}`,
        "Content-Type": "application/json",
        Accept: "application/json",
        "X-Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
    if (!response.ok) {
      const message = typeof payload.message === "string" ? payload.message : "falha sem mensagem";
      throw new MercadoPagoApiError(`Mercado Pago respondeu ${response.status}: ${message}`, response.status);
    }

    const id = typeof payload.id === "string" ? payload.id : "";
    const checkoutUrl = typeof payload.checkout_url === "string" ? payload.checkout_url : "";
    const returnedReference = typeof payload.external_reference === "string" ? payload.external_reference : "";
    const status = typeof payload.status === "string" ? payload.status : "";
    if (!id || !checkoutUrl || returnedReference !== externalReference || !status) {
      throw new MercadoPagoApiError("Resposta de criação do checkout incompleta ou com referência divergente.", 502);
    }
    if (!isMercadoPagoBrazilCheckoutUrl(checkoutUrl)) {
      throw new MercadoPagoApiError("Mercado Pago devolveu uma URL de checkout não reconhecida para o Brasil.", 502);
    }

    return { id, checkoutUrl, externalReference, status };
  } catch (error) {
    if (error instanceof MercadoPagoApiError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new MercadoPagoApiError("Timeout criando o checkout no Mercado Pago.", 504);
    }
    throw new MercadoPagoApiError(error instanceof Error ? error.message : "Falha criando checkout no Mercado Pago.", 502);
  } finally {
    clearTimeout(timeout);
  }
}

export async function getMercadoPagoOrder(orderId: string): Promise<MercadoPagoOrder> {
  const id = orderId.trim();
  if (!/^ORD[A-Za-z0-9_-]{5,80}$/.test(id)) throw new MercadoPagoApiError("ID de Order do Mercado Pago inválido.", 400);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetch(`${MERCADO_PAGO_API}/v1/orders/${encodeURIComponent(id)}`, {
      method: "GET",
      headers: { Authorization: `Bearer ${accessToken()}`, Accept: "application/json" },
      cache: "no-store",
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
    if (!response.ok) {
      const message = typeof payload.message === "string" ? payload.message : "falha sem mensagem";
      throw new MercadoPagoApiError(`Mercado Pago respondeu ${response.status}: ${message}`, response.status);
    }

    const transactions = payload.transactions && typeof payload.transactions === "object"
      ? payload.transactions as { payments?: unknown[] }
      : {};
    const paymentIds = Array.isArray(transactions.payments)
      ? transactions.payments.flatMap((entry) => {
          if (!entry || typeof entry !== "object") return [];
          const paymentId = (entry as { id?: unknown }).id;
          return typeof paymentId === "string" && paymentId ? [paymentId] : [];
        })
      : [];

    const totalAmount = Number(payload.total_amount);
    const totalPaidAmount = Number(payload.total_paid_amount ?? 0);
    const status = typeof payload.status === "string" ? payload.status : "";
    if (typeof payload.id !== "string" || payload.id !== id || !Number.isFinite(totalAmount) || !Number.isFinite(totalPaidAmount) || !status) {
      throw new MercadoPagoApiError("Resposta de Order do Mercado Pago incompleta.", 502);
    }

    return {
      id,
      externalReference: typeof payload.external_reference === "string" ? payload.external_reference : null,
      totalAmount,
      totalPaidAmount,
      currency: typeof payload.currency === "string" ? payload.currency : null,
      status,
      statusDetail: typeof payload.status_detail === "string" ? payload.status_detail : null,
      paymentIds,
    };
  } catch (error) {
    if (error instanceof MercadoPagoApiError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new MercadoPagoApiError("Timeout consultando a Order no Mercado Pago.", 504);
    }
    throw new MercadoPagoApiError(error instanceof Error ? error.message : "Falha consultando a Order do Mercado Pago.", 502);
  } finally {
    clearTimeout(timeout);
  }
}
