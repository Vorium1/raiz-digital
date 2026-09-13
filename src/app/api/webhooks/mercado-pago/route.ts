import {
  getMercadoPagoPayment,
  MercadoPagoApiError,
  verifyMercadoPagoWebhookSignature,
} from "@/lib/mercado-pago";
import {
  BillingReconciliationError,
  markPaymentEventProcessed,
  markPaymentEventRetryableError,
  reconcileOfficialMercadoPagoPayment,
  recordMercadoPagoEvent,
} from "@/lib/repositories/billing";

const MAX_WEBHOOK_BYTES = 128 * 1024;

type MercadoPagoNotification = {
  id?: string | number;
  type?: string;
  action?: string;
  data?: { id?: string | number };
  [key: string]: unknown;
};

function safeErrorMessage(error: unknown) {
  return error instanceof Error ? `${error.name}: ${error.message}` : "Erro desconhecido";
}

export async function POST(request: Request) {
  const signature = request.headers.get("x-signature")?.trim() ?? "";
  const requestId = request.headers.get("x-request-id")?.trim() ?? "";
  const secret = process.env.MERCADO_PAGO_WEBHOOK_SECRET?.trim() ?? "";
  const url = new URL(request.url);
  const signedDataId = url.searchParams.get("data.id")?.trim() ?? "";

  if (!secret) {
    console.error("mercado_pago_webhook_secret_missing");
    return Response.json({ error: "Integração financeira não configurada." }, { status: 503 });
  }
  if (!signature || !requestId || !signedDataId) {
    return Response.json({ error: "Webhook sem assinatura, request-id ou data.id obrigatórios." }, { status: 401 });
  }

  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > MAX_WEBHOOK_BYTES) {
    return Response.json({ error: "Webhook acima do limite aceito." }, { status: 413 });
  }

  const rawBody = await request.text();
  if (Buffer.byteLength(rawBody, "utf8") > MAX_WEBHOOK_BYTES) {
    return Response.json({ error: "Webhook acima do limite aceito." }, { status: 413 });
  }

  if (!verifyMercadoPagoWebhookSignature({ signature, requestId, dataId: signedDataId, secret })) {
    return Response.json({ error: "Assinatura do webhook inválida." }, { status: 401 });
  }

  let payload: MercadoPagoNotification;
  try {
    payload = JSON.parse(rawBody) as MercadoPagoNotification;
  } catch {
    return Response.json({ error: "Corpo JSON inválido." }, { status: 400 });
  }

  const eventId = payload.id == null ? "" : String(payload.id);
  const type = typeof payload.type === "string" ? payload.type.trim() : "";
  const bodyDataId = payload.data?.id == null ? "" : String(payload.data.id);
  if (!eventId || !type || !bodyDataId) {
    return Response.json({ error: "Evento sem id, type ou data.id." }, { status: 400 });
  }
  if (bodyDataId !== signedDataId) {
    return Response.json({ error: "data.id do corpo não corresponde ao recurso assinado." }, { status: 401 });
  }

  const providerEventId = `${type}:${eventId}`;
  const event = await recordMercadoPagoEvent({ providerEventId, requestId, payload });

  // Reentregas do mesmo evento são normais. Se ele já foi concluído, apenas confirma o recebimento.
  if (event.duplicate && event.processed_at) {
    return Response.json({ received: true, duplicate: true });
  }

  // Neste estágio comercial, só pagamentos alteram o ledger interno. Tópicos de assinatura podem chegar
  // pela mesma aplicação, mas ficam deliberadamente sem efeito até a RAIZ ativar cobrança recorrente.
  if (type !== "payment") {
    await markPaymentEventProcessed(event.id);
    return Response.json({ received: true, ignored: true, type });
  }

  try {
    // A notificação só aponta qual recurso mudou. O estado financeiro vem de uma nova consulta autenticada
    // à API oficial; nunca confiamos em status/valor presentes no POST recebido.
    const officialPayment = await getMercadoPagoPayment(signedDataId);
    if (officialPayment.id !== signedDataId) {
      throw new BillingReconciliationError("ID retornado pelo Mercado Pago diverge do recurso assinado.", "RESOURCE_ID_MISMATCH");
    }

    const result = await reconcileOfficialMercadoPagoPayment(officialPayment);
    await markPaymentEventProcessed(event.id);
    return Response.json({
      received: true,
      reconciled: result.kind === "updated",
      ignored: result.kind === "ignored",
    });
  } catch (error) {
    const message = safeErrorMessage(error);

    if (error instanceof BillingReconciliationError) {
      // Divergência de valor, moeda, referência ou pagamento duplicado não melhora com retry automático.
      // Registra para revisão humana, confirma o webhook e mantém a fatura/acesso sem alteração indevida.
      await markPaymentEventProcessed(event.id, `${error.code}: ${message}`);
      console.warn("mercado_pago_reconciliation_review_required", { providerEventId, code: error.code });
      return Response.json({ received: true, reviewRequired: true });
    }

    // Falha de rede/API ou banco pode ser transitória. Não marca processed_at e responde 503 para que o
    // Mercado Pago faça nova tentativa de entrega conforme o mecanismo oficial de retries.
    await markPaymentEventRetryableError(event.id, message).catch(() => undefined);
    console.error("mercado_pago_webhook_retryable_failure", {
      providerEventId,
      providerStatus: error instanceof MercadoPagoApiError ? error.status : null,
    });
    return Response.json({ error: "Falha temporária ao reconciliar o pagamento." }, { status: 503 });
  }
}
