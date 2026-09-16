import { withTenant } from "@/lib/db";
import { amountInCents, normalizeMercadoPagoPaymentIds, parseRaizInvoiceExternalReference } from "@/lib/mercado-pago";
import type { MercadoPagoOrder } from "@/lib/mercado-pago-orders";
import { BillingReconciliationError } from "@/lib/repositories/billing";

function mapOrderStatus(order: MercadoPagoOrder) {
  switch (order.status) {
    case "processed":
      if (order.statusDetail === "partially_refunded") {
        throw new BillingReconciliationError("Order parcialmente reembolsada exige revisão manual.", "PARTIAL_REFUND_UNSUPPORTED");
      }
      return "PAID" as const;
    case "failed":
      return "FAILED" as const;
    case "canceled":
    case "expired":
      return "CANCELED" as const;
    case "refunded":
      return "REFUNDED" as const;
    case "charged_back":
      throw new BillingReconciliationError("Chargeback de Order exige revisão manual.", "CHARGEBACK_REVIEW_REQUIRED");
    case "created":
    case "processing":
    case "action_required":
    default:
      return "PENDING" as const;
  }
}

/**
 * Reconcilia o fluxo moderno da Orders API. O webhook apenas indica o `order_id`;
 * os campos abaixo já vieram de GET /v1/orders/{id} feito no backend da RAIZ.
 */
export async function reconcileOfficialMercadoPagoOrder(order: MercadoPagoOrder) {
  const reference = parseRaizInvoiceExternalReference(order.externalReference);
  if (!reference) return { kind: "ignored" as const, reason: "FOREIGN_REFERENCE" as const };

  const totalCents = amountInCents(order.totalAmount);
  const paidCents = amountInCents(order.totalPaidAmount);
  if (totalCents == null || paidCents == null) {
    throw new BillingReconciliationError("Order retornou valores financeiros inválidos.", "INVALID_ORDER_AMOUNT");
  }
  if (order.currency && order.currency !== "BRL") {
    throw new BillingReconciliationError(`Moeda inesperada na Order: ${order.currency}.`, "CURRENCY_MISMATCH");
  }

  const status = mapOrderStatus(order);
  if (status === "PAID" && paidCents !== totalCents) {
    throw new BillingReconciliationError(
      `Order processada com total pago divergente: esperado=${totalCents}, pago=${paidCents}.`,
      "PAID_AMOUNT_MISMATCH",
    );
  }

  // Orders modela transactions.payments como uma coleção. Para a mensalidade RAIZ, a conciliação atual
  // é deliberadamente 1 fatura -> 1 payment_id. Se o provedor devolver dois pagamentos distintos, escolher
  // silenciosamente o primeiro perderia rastreabilidade financeira; o caso fica bloqueado para revisão.
  const paymentIds = normalizeMercadoPagoPaymentIds(order.paymentIds);
  if (paymentIds.length > 1) {
    throw new BillingReconciliationError(
      "Order retornou múltiplos payment_id distintos. A conciliação automática foi bloqueada para revisão manual.",
      "MULTIPLE_PAYMENTS_REVIEW_REQUIRED",
    );
  }
  const paymentId = paymentIds[0] ?? null;

  return withTenant({ tenantId: reference.tenantId }, async (client) => {
    const result = await client.query<{
      id: string;
      status: string;
      amount_cents: number;
      provider: string;
      provider_order_id: string | null;
      provider_charge_id: string | null;
    }>(
      `SELECT id::text, status::text, amount_cents, provider, provider_order_id, provider_charge_id
       FROM invoices
       WHERE tenant_id = $1::uuid AND id = $2::uuid
       FOR UPDATE`,
      [reference.tenantId, reference.invoiceId],
    );
    const invoice = result.rows[0];
    if (!invoice) throw new BillingReconciliationError("Order aponta para fatura inexistente neste tenant.", "INVOICE_NOT_FOUND");
    if (invoice.provider !== "MERCADO_PAGO") throw new BillingReconciliationError("Fatura pertence a outro provedor.", "PROVIDER_MISMATCH");
    if (Number(invoice.amount_cents) !== totalCents) {
      throw new BillingReconciliationError(
        `Divergência de valor da Order: fatura=${invoice.amount_cents}, Order=${totalCents}.`,
        "AMOUNT_MISMATCH",
      );
    }
    if (invoice.provider_order_id && invoice.provider_order_id !== order.id) {
      throw new BillingReconciliationError("Fatura recebeu uma Order diferente da que foi persistida.", "ORDER_ID_MISMATCH");
    }

    if (status === "PAID" && !paymentId) {
      throw new BillingReconciliationError("Order processada sem payment_id disponível para conciliação.", "PAYMENT_ID_MISSING");
    }
    if (invoice.status === "PAID" && paymentId && invoice.provider_charge_id && invoice.provider_charge_id !== paymentId) {
      throw new BillingReconciliationError("Fatura já paga recebeu outro payment_id pela Order.", "DUPLICATE_PAYMENT");
    }

    // O FOR UPDATE serializa duas notificações concorrentes da mesma fatura. Depois que a primeira
    // transação aplica exatamente esta Order/estado/payment, a segunda vira no-op e não gera outra
    // auditoria. Se o estado oficial evoluiu (ex.: processing -> processed), a mudança continua aplicada.
    if (
      invoice.provider_order_id === order.id &&
      invoice.status === status &&
      (paymentId == null || invoice.provider_charge_id === paymentId)
    ) {
      return { kind: "ignored" as const, reason: "ALREADY_RECONCILED" as const };
    }

    await client.query(
      `UPDATE invoices
       SET provider_order_id = COALESCE(provider_order_id, $3),
           provider_charge_id = COALESCE($4, provider_charge_id),
           status = $5::payment_status,
           paid_at = CASE WHEN $5::payment_status = 'PAID' THEN COALESCE(paid_at, now()) ELSE paid_at END
       WHERE tenant_id = $1::uuid AND id = $2::uuid`,
      [reference.tenantId, reference.invoiceId, order.id, paymentId, status],
    );

    await client.query(
      `INSERT INTO audit_events
       (tenant_id, actor_user_id, actor_type, action, entity_type, entity_id, before_data, after_data, metadata)
       VALUES ($1::uuid, NULL, 'INTEGRATION', 'ORDER_RECONCILED', 'invoice', $2::uuid,
               jsonb_build_object('status', $3::text, 'providerOrderId', $4::text, 'providerChargeId', $5::text),
               jsonb_build_object('status', $6::text, 'providerOrderId', $7::text, 'providerChargeId', $8::text),
               jsonb_build_object('provider', 'MERCADO_PAGO', 'orderStatus', $9::text, 'orderStatusDetail', $10::text))`,
      [
        reference.tenantId,
        reference.invoiceId,
        invoice.status,
        invoice.provider_order_id,
        invoice.provider_charge_id,
        status,
        order.id,
        paymentId ?? invoice.provider_charge_id,
        order.status,
        order.statusDetail,
      ],
    );

    return { kind: "updated" as const, tenantId: reference.tenantId, invoiceId: reference.invoiceId, status };
  });
}
