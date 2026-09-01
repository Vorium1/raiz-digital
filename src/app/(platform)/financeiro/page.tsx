import { Topbar } from "@/components/topbar";
import { Icon } from "@/components/icon";
import { PageIntro, StatusBadge } from "@/components/ui";
import { isDatabaseMode } from "@/lib/data-mode";

export const metadata = { title: "Financeiro" };

export default function FinancialPage() {
  if (isDatabaseMode()) return <><Topbar eyebrow="Administração" title="Financeiro"/><div className="content-wrap"><PageIntro title="Assinatura e acesso" description="O modelo de subscriptions, invoices, carência e eventos de pagamento existe no PostgreSQL. Cobrança comercial permanece desativada até homologação do Mercado Pago."/><div className="data-card"><div className="empty-state"><Icon name="wallet"/><strong>Cobrança ainda não ativada</strong><small>Nenhum valor ou vencimento fictício é exibido no modo real. O webhook atual é apenas um esqueleto e não altera acesso até a validação criptográfica e reconciliação oficial estarem concluídas.</small></div></div></div></>;
  return <><Topbar eyebrow="Administração · demonstração" title="Financeiro"/><div className="content-wrap"><div className="demo-banner"><Icon name="warning" size={14}/><span>Plano, valores e cobranças abaixo são exemplos de interface.</span></div><PageIntro title="Assinatura e acesso" description="Exemplo de experiência para cobrança e carência."/><section className="summary-strip"><div className="summary-item"><span>Plano atual</span><strong>Profissional</strong></div><div className="summary-item"><span>Mensalidade</span><strong>R$ 2.750</strong></div><div className="summary-item"><span>Próximo vencimento</span><strong>10 set.</strong></div><div className="summary-item"><span>Situação</span><strong className="success-text">Ativa</strong></div></section><div className="data-card"><table className="data-table"><thead><tr><th>Competência</th><th>Vencimento</th><th>Valor</th><th>Status</th></tr></thead><tbody><tr><td>Agosto 2026</td><td>10/08/2026</td><td>R$ 2.750,00</td><td><StatusBadge tone="success">Pago</StatusBadge></td></tr></tbody></table></div></div></>;
}
