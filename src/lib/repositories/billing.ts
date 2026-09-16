import { query, withTenant } from "@/lib/db";
import {
  amountInCents,
  isAutomaticPaymentStatusTransitionAllowed,
  mapMercadoPagoPaymentStatus,
  parseRaizInvoiceExternalReference,
  type MercadoPagoPayment,
} from "@/lib/mercado-pago";

const PROVIDER = "MERCADO_PAGO";
const MAX_PROCESSING_ERROR_CHARS = 1500;

export class BillingReconciliationError extends Error {
  code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = "BillingReconciliationError";
    this.code = code;
  }
}

export async function recordMercadoPagoEvent(input: {
  providerEventId: string;
  requestId: string;
  payload: unknown;
}) {
  const inserted = await query<{ id: string; processed_at: string | null; processing_error: string | null }>(
    `INSERT INTO payment_events (provider, provider_event_id, request_id, signature_valid, payload)
     VALUES ($1, $2, $3, true, $4::jsonb)
     ON CONFLICT (provider, provider_event_id) DO NOTHING
     RETURNING id::text, processed_at::text, processing_error`,
    [PROVIDER, input.providerEventId, input.requestId, JSON.stringify(input.payload)],
  );
  if (inserted.rows[0]) return { ...inserted.rows[0], duplicate: false };

  const existing = await query<{ id: string; processed_at: string | null; processing_error: string | null }>(
    `SELECT id::text, processed_at::text, processing_error
     FROM payment_events WHERE provider = $1 AND provider_event_id = $2 LIMIT 1`,
    [PROVIDER, input.providerEventId],
  );
  const row = existing.rows[0];
  if (!row) throw new Error("Evento financeiro não pôde ser persistido nem localizado.");
  return { ...row, duplicate: true };
}

export async function markPaymentEventProcessed(eventRowId: string, processingError: string | null = null) {
  await query(
    `UPDATE payment_events
     SET processed_at = now(), processing_error = $2
     WHERE id = $1::uuid`,
    [eventRowId, processingError?.slice(0, MAX_PROCESSING_ERROR_CHARS) ?? null],
  );
}

export async function markPaymentEventRetryableError(eventRowId: string, processingError: string) {
  await query(
    `UPDATE payment_events
     SET processing_error = $2
     WHERE id = $1::uuid`,
    [eventRowId, processingError.slice(0, MAX_PROCESSING_ERROR_CHARS)],
  );
}

export type PaymentReconciliationResult =
  | { kind: "ignored"; reason: "FOREIGN_REFERENCE" | "ALREADY_RECONCILED" }
  | { kind: "updated"; tenantId: string; invoiceId: string; previousStatus: string; status: string };

export async function reconcileOfficialMercadoPagoPayment(payment: MercadoPagoPayment): Promise<PaymentReconciliationResult> {
  const reference = parseRaizInvoiceExternalReference(payment.external_reference);
  if (!reference) return { kind: "ignored", reason: "FOREIGN_REFERENCE" };

  const officialAmountCents = amountInCents(payment.transaction_amount);
  if (officialAmountCents == null) {
    throw new BillingReconciliationError("Valor oficial inválido no recurso do Mercado Pago.", "INVALID_AMOUNT");
  }
  if (payment.currency_id !== "BRL") {
    throw new BillingReconciliationError(`Moeda inesperada: ${payment.currency_id}.`, "CURRENCY_MISMATCH");
  }

  return withTenant({ tenantId: reference.tenantId }, async (client) => {
    const currentResult = await client.query<{
      id: string;
      status: string;
      amount_cents: number;
      provider: string;
      provider_charge_id: string | null;
    }>(
      `SELECT id::text, status::text, amount_cents, provider, provider_charge_id
       FROM invoices
       WHERE tenant_id = $1::uuid AND id = $2::uuid
       FOR UPDATE`,
      [reference.tenantId, reference.invoiceId],
    );
    const current = currentResult.rows[0];
    if (!current) {
      throw new BillingReconciliationError("A referência oficial aponta para uma fatura inexistente neste tenant.", "INVOICE_NOT_FOUND");
    }
    if (current.provider !== PROVIDER) {
      throw new BillingReconciliationError(`A fatura pertence ao provedor ${current.provider}, não ao Mercado Pago.`, "PROVIDER_MISMATCH");
    }
    if (Number(current.amount_cents) !== officialAmountCents) {
      throw new BillingReconciliationError(
        `Divergência de valor: fatura=${current.amount_cents} centavos, Mercado Pago=${officialAmountCents} centavos.`,
        "AMOUNT_MISMATCH",
      );
    }

    const status = mapMercadoPagoPaymentStatus(payment.status);

    if (current.provider_charge_id === payment.id && current.status === status) {
      return { kind: "ignored" as const, reason: "ALREADY_RECONCILED" as const };
    }

    if (!isAutomaticPaymentStatusTransitionAllowed(current.status, status)) {
      throw new BillingReconciliationError(
        `Transição financeira terminal bloqueada: ${current.status} -> ${status}. Revisão manual obrigatória.`,
        "TERMINAL_STATUS_REGRESSION",
      );
    }

    // Uma nova tentativa pode substituir uma tentativa pendente/rejeitada/cancelada. Depois de PAID ou
    // REFUNDED, porém, um payment_id diferente é sempre uma divergência financeira que exige revisão.
    if (
      current.provider_charge_id &&
      current.provider_charge_id !== payment.id &&
      (current.status === "PAID" || current.status === "REFUNDED")
    ) {
      throw new BillingReconciliationError(
        "Fatura em estado terminal recebeu outro payment_id. Revisão manual obrigatória.",
        "DUPLICATE_PAYMENT",
      );
    }

    const paidAt = status === "PAID" ? (payment.date_approved ?? new Date().toISOString()) : null;

    await client.query(
      `UPDATE invoices
       SET provider_charge_id = $3,
           status = $4::payment_status,
           paid_at = CASE
             WHEN $4::payment_status = 'PAID' THEN COALESCE(paid_at, $5::timestamptz)
             ELSE paid_at
           END
       WHERE tenant_id = $1::uuid AND id = $2::uuid`,
      [reference.tenantId, reference.invoiceId, payment.id, status, paidAt],
    );

    await client.query(
      `INSERT INTO audit_events
       (tenant_id, actor_user_id, actor_type, action, entity_type, entity_id, before_data, after_data, metadata)
       VALUES ($1::uuid, NULL, 'INTEGRATION', 'PAYMENT_RECONCILED', 'invoice', $2::uuid,
               jsonb_build_object('status', $3::text, 'providerChargeId', $4::text),
               jsonb_build_object('status', $5::text, 'providerChargeId', $6::text),
               jsonb_build_object('provider', $7::text, 'providerStatus', $8::text, 'providerStatusDetail', $9::text))`,
      [
        reference.tenantId,
        reference.invoiceId,
        current.status,
        current.provider_charge_id,
        status,
        payment.id,
        PROVIDER,
        payment.status,
        payment.status_detail ?? null,
      ],
    );

    return {
      kind: "updated" as const,
      tenantId: reference.tenantId,
      invoiceId: reference.invoiceId,
      previousStatus: current.status,
      status,
    };
  });
}
