import { withTenant } from "@/lib/db";

export class InvoiceCheckoutError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "InvoiceCheckoutError";
    this.status = status;
  }
}

export type CheckoutableInvoice = {
  id: string;
  amountCents: number;
  status: string;
  provider: string;
  providerOrderId: string | null;
  checkoutUrl: string | null;
};

export async function getCheckoutableInvoice(input: { tenantId: string; userId: string; invoiceId: string }) {
  return withTenant({ tenantId: input.tenantId, userId: input.userId }, async (client) => {
    const result = await client.query<CheckoutableInvoice>(
      `SELECT id::text,
              amount_cents AS "amountCents",
              status::text,
              provider,
              provider_order_id AS "providerOrderId",
              checkout_url AS "checkoutUrl"
       FROM invoices
       WHERE tenant_id = $1::uuid AND id = $2::uuid
       LIMIT 1`,
      [input.tenantId, input.invoiceId],
    );
    const invoice = result.rows[0];
    if (!invoice) throw new InvoiceCheckoutError("Fatura não encontrada nesta empresa.", 404);
    if (invoice.provider !== "MERCADO_PAGO") throw new InvoiceCheckoutError("Esta fatura não usa Mercado Pago.", 409);
    if (invoice.status === "PAID") throw new InvoiceCheckoutError("Esta fatura já está paga.", 409);
    if (invoice.status === "REFUNDED" || invoice.status === "CANCELED") {
      throw new InvoiceCheckoutError("Esta fatura não aceita novo checkout no estado atual.", 409);
    }
    if (!Number.isInteger(Number(invoice.amountCents)) || Number(invoice.amountCents) <= 0) {
      throw new InvoiceCheckoutError("Fatura sem valor válido para cobrança.", 422);
    }
    return { ...invoice, amountCents: Number(invoice.amountCents) };
  });
}

export async function saveInvoiceCheckout(input: {
  tenantId: string;
  userId: string;
  invoiceId: string;
  providerOrderId: string;
  checkoutUrl: string;
}) {
  return withTenant({ tenantId: input.tenantId, userId: input.userId }, async (client) => {
    const updated = await client.query<{ providerOrderId: string; checkoutUrl: string }>(
      `UPDATE invoices
       SET provider_order_id = $3,
           checkout_url = $4,
           checkout_created_at = COALESCE(checkout_created_at, now())
       WHERE tenant_id = $1::uuid
         AND id = $2::uuid
         AND provider = 'MERCADO_PAGO'
         AND status NOT IN ('PAID','REFUNDED','CANCELED')
         AND (provider_order_id IS NULL OR provider_order_id = $3)
       RETURNING provider_order_id AS "providerOrderId", checkout_url AS "checkoutUrl"`,
      [input.tenantId, input.invoiceId, input.providerOrderId, input.checkoutUrl],
    );
    const row = updated.rows[0];
    if (!row) throw new InvoiceCheckoutError("A fatura mudou enquanto o checkout era criado. Atualize a página antes de tentar novamente.", 409);

    await client.query(
      `INSERT INTO audit_events
       (tenant_id, actor_user_id, actor_type, action, entity_type, entity_id, after_data, metadata)
       VALUES ($1::uuid, $2::uuid, 'USER', 'INVOICE_CHECKOUT_CREATED', 'invoice', $3::uuid,
               jsonb_build_object('providerOrderId', $4::text),
               jsonb_build_object('provider', 'MERCADO_PAGO'))`,
      [input.tenantId, input.userId, input.invoiceId, input.providerOrderId],
    );

    return row;
  });
}
