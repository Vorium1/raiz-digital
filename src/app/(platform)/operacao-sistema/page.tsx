import { redirect } from "next/navigation";
import { Topbar } from "@/components/topbar";
import { Icon } from "@/components/icon";
import { PageIntro, StatusBadge } from "@/components/ui";
import { requirePlatformSession } from "@/lib/auth/session";
import { isDatabaseMode } from "@/lib/data-mode";
import { getOperationalIntegrationReadiness, operationalIntegrationScore } from "@/domain/operational-readiness";
import { getOperationalStatusSnapshot } from "@/lib/repositories/operational-status";

export const metadata = { title: "Saúde do sistema" };
export const dynamic = "force-dynamic";

function countLabel(value: number | null) {
  return value === null ? "Indisponível" : String(value);
}

export default async function SystemOperationPage() {
  if (!isDatabaseMode()) {
    return <>
      <Topbar eyebrow="Administração" title="Saúde do sistema"/>
      <div className="content-wrap">
        <PageIntro title="Observabilidade operacional" description="Este painel só usa sinais reais do ambiente conectado. Em modo demonstração nenhum indicador operacional é simulado."/>
        <div className="data-card"><div className="empty-state"><Icon name="warning"/><strong>Modo demonstração</strong><small>Conecte o ambiente a DATA_MODE=database para visualizar saúde, segurança e integrações reais.</small></div></div>
      </div>
    </>;
  }

  const session = await requirePlatformSession();
  if (session.role !== "SUPER_ADMIN") redirect("/dashboard");

  const [snapshot, readiness] = await Promise.all([
    getOperationalStatusSnapshot({ tenantId: session.tenantId, userId: session.userId }),
    Promise.resolve(getOperationalIntegrationReadiness(process.env)),
  ]);
  const integrationScore = operationalIntegrationScore(readiness);
  const paymentHealthy = snapshot.payments.errors24h === 0 && snapshot.payments.stuckEvents === 0;

  const integrations = [
    ["E-mail transacional", readiness.email, "Resend + remetente configurado"],
    ["Storage bruto", readiness.rawStorage, "S3 compatível para arquivos originais"],
    ["Mercado Pago", readiness.mercadoPago, "Access Token + segredo do webhook"],
    ["Copernicus", readiness.copernicus, "OAuth client para Sentinel-2"],
    ["Snapshot de relatório", readiness.reportStorage, "REPORT_STORAGE_PROVIDER=inline"],
  ] as const;

  return <>
    <Topbar eyebrow="Administração · operação" title="Saúde do sistema"/>
    <div className="content-wrap">
      <PageIntro
        title="Observabilidade operacional"
        description="Sinais mínimos para operar a RAIZ com segurança, sem exibir segredos, payloads de laudo ou conteúdo de clientes. Este painel não substitui monitoramento externo nem o preflight de produção."
      />

      <section className="summary-strip" style={{ marginBottom: 18 }}>
        <div className="summary-item"><span>Banco de runtime</span><strong>{snapshot.database.ok ? "Saudável" : "Indisponível"}</strong><small>{snapshot.database.latencyMs === null ? "sem medição" : `${snapshot.database.latencyMs} ms`}</small></div>
        <div className="summary-item"><span>Integrações prontas</span><strong>{integrationScore.ready}/{integrationScore.total}</strong><small>somente presença/configuração</small></div>
        <div className="summary-item"><span>Falhas de login · 15 min</span><strong>{countLabel(snapshot.security.failedLogins15m)}</strong><small>sem e-mail/IP exposto</small></div>
        <div className="summary-item"><span>Pagamentos · 24 h</span><strong>{countLabel(snapshot.payments.events24h)}</strong><small>eventos recebidos</small></div>
      </section>

      <section className="data-card" style={{ marginBottom: 18 }}>
        <div className="card-header"><div><span className="eyebrow">INTEGRAÇÕES</span><h2>Prontidão do ambiente</h2></div><StatusBadge tone={integrationScore.ready === integrationScore.total ? "success" : "waiting"}>{integrationScore.ready === integrationScore.total ? "Completa" : "Pendente"}</StatusBadge></div>
        <div className="report-table-wrap">
          <table className="data-table">
            <thead><tr><th>Componente</th><th>Status</th><th>Critério</th></tr></thead>
            <tbody>{integrations.map(([label, ready, detail]) => <tr key={label}>
              <td><strong>{label}</strong></td>
              <td><StatusBadge tone={ready ? "success" : "waiting"}>{ready ? "Configurado" : "Pendente"}</StatusBadge></td>
              <td><small>{detail}</small></td>
            </tr>)}</tbody>
          </table>
        </div>
      </section>

      <section className="data-card" style={{ marginBottom: 18 }}>
        <div className="card-header"><div><span className="eyebrow">SEGURANÇA & FINANCEIRO</span><h2>Sinais das últimas 24 horas</h2></div><StatusBadge tone={paymentHealthy ? "success" : "danger"}>{paymentHealthy ? "Sem alerta financeiro" : "Requer revisão"}</StatusBadge></div>
        <div className="report-table-wrap">
          <table className="data-table">
            <thead><tr><th>Sinal</th><th>Quantidade</th><th>Leitura operacional</th></tr></thead>
            <tbody>
              <tr><td>Falhas de login nos últimos 15 min</td><td><strong>{countLabel(snapshot.security.failedLogins15m)}</strong></td><td><small>O rate limit continua sendo aplicado pelo backend; este painel mostra apenas a contagem agregada.</small></td></tr>
              <tr><td>Eventos do Mercado Pago nas últimas 24 h</td><td><strong>{countLabel(snapshot.payments.events24h)}</strong></td><td><small>Contagem de notificações recebidas, sem payload ou referência do cliente.</small></td></tr>
              <tr><td>Eventos financeiros com erro nas últimas 24 h</td><td><strong>{countLabel(snapshot.payments.errors24h)}</strong></td><td><small>Qualquer valor acima de zero deve ser revisado antes de promoção.</small></td></tr>
              <tr><td>Eventos não processados há mais de 5 min</td><td><strong>{countLabel(snapshot.payments.stuckEvents)}</strong></td><td><small>Pode indicar falha externa/reconciliação pendente; nunca é corrigido silenciosamente.</small></td></tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="data-card">
        <div className="card-header"><div><span className="eyebrow">EMPRESA ATUAL</span><h2>Atividade e cobrança</h2></div></div>
        <div className="report-table-wrap">
          <table className="data-table">
            <thead><tr><th>Sinal</th><th>Quantidade</th><th>Escopo</th></tr></thead>
            <tbody>
              <tr><td>Eventos de auditoria nas últimas 24 h</td><td><strong>{countLabel(snapshot.tenant.auditEvents24h)}</strong></td><td><small>Somente o tenant da sessão, respeitando RLS.</small></td></tr>
              <tr><td>Faturas pendentes</td><td><strong>{countLabel(snapshot.tenant.pendingInvoices)}</strong></td><td><small>Ledger real da empresa atual.</small></td></tr>
              <tr><td>Faturas pendentes vencidas</td><td><strong>{countLabel(snapshot.tenant.overdueInvoices)}</strong></td><td><small>Não bloqueia acesso automaticamente nesta fase.</small></td></tr>
            </tbody>
          </table>
        </div>
      </section>

      <p className="report-empty-note" style={{ marginTop: 14 }}>
        Este painel deliberadamente não exibe tokens, e-mails de tentativa, IPs, payloads de webhook, strings de conexão ou conteúdo agronômico. O gate final continua sendo <code>npm run check:production-readiness</code> + smoke tests reais dos provedores.
      </p>
    </div>
  </>;
}
