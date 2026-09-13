import { redirect } from "next/navigation";
import { Topbar } from "@/components/topbar";
import { Icon } from "@/components/icon";
import { InvoiceCheckoutButton } from "@/components/invoice-checkout-button";
import { PageIntro, StatusBadge } from "@/components/ui";
import { isDatabaseMode } from "@/lib/data-mode";
import { requirePlatformSession } from "@/lib/auth/session";
import { getTenantBillingSnapshot } from "@/lib/repositories/billing-read";

export const metadata = { title: "Financeiro" };

const FINANCIAL_ROLES = new Set(["SUPER_ADMIN", "TENANT_ADMIN", "COMMERCIAL"]);

const invoiceStatus: Record<string, { label: string; tone: string }> = {
  PENDING: { label: "Pendente", tone: "waiting" },
  PAID: { label: "Pago", tone: "success" },
  FAILED: { label: "Falhou", tone: "danger" },
  REFUNDED: { label: "Reembolsado", tone: "review" },
  CANCELED: { label: "Cancelado", tone: "waiting" },
};

const subscriptionStatus: Record<string, string> = {
  ACTIVE: "Ativa",
  DUE_SOON: "Próxima do vencimento",
  OVERDUE_GRACE: "Em carência",
  BLOCKED: "Bloqueada",
  CANCELED: "Cancelada",
};

function formatMoney(cents: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(cents) / 100);
}

function formatDate(date: string) {
  const parsed = new Date(`${date.slice(0, 10)}T12:00:00-03:00`);
  return Number.isNaN(parsed.getTime()) ? date : parsed.toLocaleDateString("pt-BR");
}

export default async function FinancialPage() {
  if (!isDatabaseMode()) return <DemoFinancial/>;

  const session = await requirePlatformSession();
  if (!FINANCIAL_ROLES.has(session.role)) redirect("/dashboard");

  const billing = await getTenantBillingSnapshot(session.tenantId, session.userId);
  const integrationConfigured = Boolean(
    process.env.MERCADO_PAGO_ACCESS_TOKEN?.trim() && process.env.MERCADO_PAGO_WEBHOOK_SECRET?.trim(),
  );

  return <>
    <Topbar eyebrow="Administração" title="Financeiro"/>
    <div className="content-wrap">
      <PageIntro
        title="Assinatura e faturamento"
        description="Ledger financeiro real da empresa ativa. Faturas pendentes podem abrir o Checkout Pro do Mercado Pago; o pagamento só é reconhecido depois da reconciliação oficial pelo webhook."
      />

      <div className={`import-message ${integrationConfigured ? "success" : ""}`} style={{ marginBottom: 18 }}>
        <Icon name={integrationConfigured ? "shield" : "warning"}/>
        <div>
          <strong>{integrationConfigured ? "Integração preparada para homologação" : "Mercado Pago ainda sem credenciais neste ambiente"}</strong>
          <small>
            {integrationConfigured
              ? "Checkout manual por fatura e webhook protegido estão disponíveis. Recorrência automática e bloqueio por inadimplência continuam desligados até o teste comercial final."
              : "Configure Access Token e segredo do webhook somente no ambiente seguro. Até lá, nenhuma cobrança é criada e nenhum acesso é alterado."}
          </small>
        </div>
      </div>

      {billing.subscription ? (
        <section className="summary-strip" style={{ marginBottom: 18 }}>
          <div className="summary-item"><span>Situação da assinatura</span><strong>{subscriptionStatus[billing.subscription.status] ?? billing.subscription.status}</strong></div>
          <div className="summary-item"><span>Mensalidade cadastrada</span><strong>{formatMoney(billing.subscription.monthlyAmountCents)}</strong></div>
          <div className="summary-item"><span>Dia de vencimento</span><strong>Dia {billing.subscription.dueDay}</strong></div>
          <div className="summary-item"><span>Histórico exibido</span><strong>{billing.invoices.length} fatura(s)</strong></div>
        </section>
      ) : (
        <div className="data-card" style={{ marginBottom: 18 }}>
          <div className="empty-state"><Icon name="wallet"/><strong>Nenhuma assinatura cadastrada</strong><small>Não há valor, vencimento ou plano fictício no modo real.</small></div>
        </div>
      )}

      <section className="data-card">
        <div className="card-header"><div><span className="eyebrow">LEDGER REAL</span><h2>Faturas</h2></div><span className="field-ops-count">{billing.invoices.length}</span></div>
        {billing.invoices.length ? (
          <div className="report-table-wrap">
            <table className="data-table">
              <thead><tr><th>Vencimento</th><th>Valor</th><th>Status</th><th>Conciliação</th><th>Pagamento</th></tr></thead>
              <tbody>{billing.invoices.map((invoice) => {
                const status = invoiceStatus[invoice.status] ?? { label: invoice.status, tone: "waiting" };
                const canCheckout = invoice.provider === "MERCADO_PAGO" && invoice.status === "PENDING";
                return <tr key={invoice.id}>
                  <td><strong>{formatDate(invoice.dueAt)}</strong><small>Carência até {formatDate(invoice.graceDeadline)}</small></td>
                  <td><strong>{formatMoney(invoice.amountCents)}</strong><small>{invoice.provider === "MERCADO_PAGO" ? "Mercado Pago" : invoice.provider}</small></td>
                  <td><StatusBadge tone={status.tone}>{status.label}</StatusBadge></td>
                  <td>
                    {invoice.providerChargeId
                      ? <><span className="success-text">Pagamento identificado</span><small>payment_id conciliado</small></>
                      : invoice.providerOrderId
                        ? <><span>Checkout criado</span><small>aguardando pagamento</small></>
                        : <><span>Não iniciado</span><small>sem order/payment</small></>}
                  </td>
                  <td>
                    {canCheckout
                      ? <InvoiceCheckoutButton invoiceId={invoice.id} enabled={integrationConfigured}/>
                      : <small>{invoice.status === "PAID" ? "Quitada" : "Sem ação disponível"}</small>}
                  </td>
                </tr>;
              })}</tbody>
            </table>
          </div>
        ) : (
          <div className="empty-state"><Icon name="wallet"/><strong>Nenhuma fatura emitida</strong><small>O financeiro fica vazio até existir uma fatura real vinculada a esta empresa.</small></div>
        )}
      </section>

      <p className="report-empty-note" style={{ marginTop: 14 }}>
        Segurança comercial: abrir o Checkout Pro não marca uma fatura como paga. A RAIZ só muda o ledger após validar a assinatura do webhook e consultar novamente o recurso no Mercado Pago. Recorrência e bloqueio por inadimplência permanecem fora desta etapa.
      </p>
    </div>
  </>;
}

function DemoFinancial() {
  return <><Topbar eyebrow="Administração · demonstração" title="Financeiro"/><div className="content-wrap"><div className="demo-banner"><Icon name="warning" size={14}/><span>Plano, valores e cobranças abaixo são exemplos de interface.</span></div><PageIntro title="Assinatura e acesso" description="Exemplo de experiência para cobrança e carência."/><section className="summary-strip"><div className="summary-item"><span>Plano atual</span><strong>Profissional</strong></div><div className="summary-item"><span>Mensalidade</span><strong>R$ 2.750</strong></div><div className="summary-item"><span>Próximo vencimento</span><strong>10 set.</strong></div><div className="summary-item"><span>Situação</span><strong className="success-text">Ativa</strong></div></section><div className="data-card"><table className="data-table"><thead><tr><th>Competência</th><th>Vencimento</th><th>Valor</th><th>Status</th></tr></thead><tbody><tr><td>Agosto 2026</td><td>10/08/2026</td><td>R$ 2.750,00</td><td><StatusBadge tone="success">Pago</StatusBadge></td></tr></tbody></table></div></div></>;
}
