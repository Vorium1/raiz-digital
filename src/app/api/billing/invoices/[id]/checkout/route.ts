import { getPlatformSession } from "@/lib/auth/session";
import { createMercadoPagoInvoiceCheckout } from "@/lib/mercado-pago-orders";
import { MercadoPagoApiError } from "@/lib/mercado-pago";
import {
  getCheckoutableInvoice,
  InvoiceCheckoutError,
  saveInvoiceCheckout,
} from "@/lib/repositories/billing-checkout";

const BILLING_ROLES = new Set(["SUPER_ADMIN", "TENANT_ADMIN", "COMMERCIAL"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getPlatformSession();
  if (!session) return Response.json({ error: "Sessão necessária." }, { status: 401 });
  if (!BILLING_ROLES.has(session.role)) {
    return Response.json({ error: "Seu perfil não pode iniciar pagamentos da empresa." }, { status: 403 });
  }

  const { id } = await context.params;
  if (!UUID.test(id)) return Response.json({ error: "Identificador de fatura inválido." }, { status: 400 });

  try {
    const invoice = await getCheckoutableInvoice({ tenantId: session.tenantId, userId: session.userId, invoiceId: id });

    // Depois da primeira criação, sempre reutiliza a Order persistida. Isso torna cliques repetidos
    // inofensivos e evita gerar cobranças paralelas para a mesma fatura.
    if (invoice.providerOrderId && invoice.checkoutUrl) {
      return Response.json({ checkoutUrl: invoice.checkoutUrl, orderId: invoice.providerOrderId, reused: true });
    }

    const order = await createMercadoPagoInvoiceCheckout({
      tenantId: session.tenantId,
      invoiceId: invoice.id,
      amountCents: invoice.amountCents,
    });

    await saveInvoiceCheckout({
      tenantId: session.tenantId,
      userId: session.userId,
      invoiceId: invoice.id,
      providerOrderId: order.id,
      checkoutUrl: order.checkoutUrl,
    });

    return Response.json({ checkoutUrl: order.checkoutUrl, orderId: order.id, reused: false }, { status: 201 });
  } catch (error) {
    if (error instanceof InvoiceCheckoutError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof MercadoPagoApiError) {
      const status = error.status && error.status >= 400 && error.status < 500 ? 422 : 503;
      console.error("mercado_pago_checkout_failed", { providerStatus: error.status });
      return Response.json({ error: "Não foi possível abrir o checkout do Mercado Pago. Tente novamente em instantes." }, { status });
    }
    console.error("invoice_checkout_failed", error);
    return Response.json({ error: "Não foi possível iniciar o pagamento." }, { status: 500 });
  }
}
