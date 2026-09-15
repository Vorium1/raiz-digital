import Link from "next/link";
import { notFound } from "next/navigation";
import { Topbar } from "@/components/topbar";
import { Icon } from "@/components/icon";
import { PrintButton } from "@/components/print-button";
import { ReportBrand, ReportSignature } from "@/components/report-brand";
import { requirePlatformSession } from "@/lib/auth/session";
import { getPropertyExecutiveReportData } from "@/lib/repositories/reports";
import { getTenantBranding } from "@/lib/repositories/tenant-branding";

export const metadata = { title: "Relatório executivo da propriedade" };

const EVALUATION_LABEL: Record<string, string> = {
  SEM_ANALISE: "Sem análise ainda",
  NAO_INTERPRETAVEL: "Dado impede interpretação",
  EM_ANDAMENTO: "Avaliação em andamento",
  APROVADO: "Avaliado e aprovado",
};

/**
 * Relatório EXECUTIVO (Fase 3, Bloco E) — para dono, diretor e gerente: situação da propriedade, áreas
 * que exigem atenção, cobertura da avaliação, decisões e impedimentos, próximos passos. Nenhum número
 * novo: mesma fonte já auditada da Central de Decisão (Fase 1), reapresentada pra este destinatário.
 */
export default async function PropertyExecutiveReportPage({ params }: { params: Promise<{ propertyId: string }> }) {
  const { propertyId } = await params;
  const session = await requirePlatformSession();
  const [data, branding] = await Promise.all([
    getPropertyExecutiveReportData(session.tenantId, propertyId, session.userId),
    getTenantBranding(session.tenantId),
  ]);
  if (!data) notFound();
  const { property, summary, fields, attentionFields } = data;

  return (
    <>
      <Topbar eyebrow="Relatórios" title="Relatório executivo">
        <Link href="/relatorios" className="button ghost no-print">Voltar</Link>
      </Topbar>
      <div className="content-wrap">
        <div className="report-toolbar no-print"><span className="report-empty-note">Rascunho — gerado sob demanda a partir do estado atual; não é um documento versionado/publicado.</span><PrintButton/></div>
        <article className="report-doc">
          <header className="report-header">
            <ReportBrand branding={branding} />
            <div className="report-header-meta"><span>Gerado em</span><strong>{new Date().toLocaleString("pt-BR")}</strong></div>
          </header>
          <h1 className="report-title">Relatório executivo da propriedade</h1>
          <p className="report-subtitle">{property.clientName} · {property.name} · {property.municipality}/{property.state}</p>

          <section className="report-section">
            <h2>Situação da propriedade</h2>
            <div className="report-meta-grid">
              <div><span>Talhões</span><strong>{summary.fields}</strong></div>
              <div><span>Área total</span><strong>{summary.totalAreaHa.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} ha</strong></div>
              <div><span>Cobertura da avaliação</span><strong>{summary.coveragePct}%</strong></div>
              <div><span>Confiabilidade média</span><strong>{summary.avgConfidence != null ? `${Math.round(summary.avgConfidence)}/100` : "—"}</strong></div>
              <div><span>Talhões críticos</span><strong>{summary.criticalFields}</strong></div>
              <div><span>Interpretações aguardando revisão</span><strong>{summary.interpretationsPending}</strong></div>
              <div><span>Ordens abertas</span><strong>{summary.openOrders}</strong></div>
              <div><span>Safras em andamento</span><strong>{summary.seasonsInProgress}</strong></div>
            </div>
          </section>

          <section className="report-section">
            <h2>Áreas que exigem atenção ({attentionFields.length})</h2>
            {attentionFields.length ? (
              <div className="report-table-wrap"><table className="report-table">
                <thead><tr><th>Talhão</th><th>Situação</th><th>Impedimento / motivo</th><th>Cobertura de coleta</th></tr></thead>
                <tbody>{attentionFields.map((field: any) => (
                  <tr key={field.id}>
                    <td>{field.name}</td>
                    <td>{EVALUATION_LABEL[field.evaluationStatus] ?? field.evaluationStatus}</td>
                    <td style={{ fontSize: 10 }}>{field.notInterpretableReason ?? "—"}</td>
                    <td>{field.plannedPoints ? `${field.collectedPoints}/${field.plannedPoints}` : "sem ordem de coleta"}</td>
                  </tr>
                ))}</tbody>
              </table></div>
            ) : <p className="report-empty-note">Nenhuma área exigindo atenção nos dados atuais — todos os talhões com análise estão avaliados e aprovados, ou ainda não têm nenhuma pendência registrada.</p>}
          </section>

          <section className="report-section">
            <h2>Todos os talhões ({fields.length})</h2>
            {fields.length ? (
              <div className="report-table-wrap"><table className="report-table">
                <thead><tr><th>Talhão</th><th>Situação</th><th>Cobertura de coleta</th></tr></thead>
                <tbody>{fields.map((field: any) => (
                  <tr key={field.id}><td>{field.name}</td><td>{EVALUATION_LABEL[field.evaluationStatus] ?? field.evaluationStatus}</td><td>{field.plannedPoints ? `${field.collectedPoints}/${field.plannedPoints} (${Math.round((field.collectedPoints / field.plannedPoints) * 100)}%)` : "sem ordem de coleta"}</td></tr>
                ))}</tbody>
              </table></div>
            ) : <p className="report-empty-note">Nenhum talhão cadastrado nesta propriedade.</p>}
          </section>

          <section className="report-section">
            <h2>Próximos passos registrados</h2>
            {attentionFields.length ? (
              <ul className="report-pendencies">
                {attentionFields.map((field: any) => (
                  <li key={field.id}><Icon name="warning" size={12}/> {field.name}: {field.evaluationStatus === "SEM_ANALISE" ? "iniciar coleta/análise." : "resolver o impedimento técnico registrado e recalcular a interpretação."}</li>
                ))}
              </ul>
            ) : <p className="report-empty-note">Nenhuma ação pendente identificada nos dados atuais.</p>}
          </section>

          <ReportSignature branding={branding} />
        </article>
      </div>
    </>
  );
}
