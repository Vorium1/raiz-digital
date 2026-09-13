import { buildRaizInvoiceExternalReference, MercadoPagoApiError } from "@/lib/mercado-pago";

const MERCADO_PAGO_API = "https://api.mercadopago.com";

export type MercadoPagoCheckoutOrder = {
  id: string;
  checkoutUrl: string;
  externalReference: string;
  status: string;
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

    const checkout = new URL(checkoutUrl);
    if (checkout.protocol !== "https:" || !checkout.hostname.endsWith("mercadopago.com.br")) {
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
