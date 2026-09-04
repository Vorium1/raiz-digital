import Link from "next/link";
import { notFound } from "next/navigation";
import { Topbar } from "@/components/topbar";
import { PrintButton } from "@/components/print-button";
import { ReportBrand, ReportSignature } from "@/components/report-brand";
import { requirePlatformSession } from "@/lib/auth/session";
import { getPropertyExecutiveReportData } from "@/lib/repositories/reports";
import { getTenantBranding } from "@/lib/repositories/tenant-branding";

export const metadata = { title: "Relatório executivo da propriedade" };

export default async function PropertyExecutiveReportPage({ params }: { params: Promise<{ propertyId: string }> }) {
  const { propertyId } = await params;
  const session = await requirePlatformSession();
  const [data, branding] = await Promise.all([
    getPropertyExecutiveReportData(session.tenantId, propertyId, session.userId),
    getTenantBranding(session.tenantId),
  ]);
  if (!data) notFound();
  const { property, fields, analysesSummary } = data;
  const totalArea = fields.reduce((sum: number, field: any) => sum + Number(field.areaHa), 0);
  const totalPoints = fields.reduce((sum: number, field: any) => sum + field.totalPoints, 0);
  const collectedPoints = fields.reduce((sum: number, field: any) => sum + field.collectedPoints, 0);

  return (
    <>
      <Topbar eyebrow="Relatórios" title="Relatório executivo">
        <Link href="/relatorios" className="button ghost no-print">Voltar</Link>
      </Topbar>
      <div className="content-wrap">
        <div className="report-toolbar no-print"><span className="report-empty-note">Visão consolidada real da carteira desta propriedade.</span><PrintButton/></div>
        <article className="report-doc">
          <header className="report-header">
            <ReportBrand branding={branding} />
            <div className="report-header-meta"><span>Gerado em</span><strong>{new Date().toLocaleString("pt-BR")}</strong></div>
          </header>
          <h1 className="report-title">Relatório executivo da propriedade</h1>
          <p className="report-subtitle">{property.clientName} · {property.name} · {property.municipality}/{property.state}</p>

          <div className="report-meta-grid">
            <div><span>Talhões</span><strong>{fields.length}</strong></div>
            <div><span>Área total</span><strong>{totalArea.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} ha</strong></div>
            <div><span>Cobertura de coleta</span><strong>{totalPoints ? `${Math.round((collectedPoints / totalPoints) * 100)}%` : "—"}</strong></div>
            <div><span>Confiabilidade média</span><strong>{analysesSummary.avgConfidence != null ? `${Math.round(Number(analysesSummary.avgConfidence))}/100` : "—"}</strong></div>
            <div><span>Análises totais</span><strong>{analysesSummary.total}</strong></div>
            <div><span>Aguardando revisão</span><strong>{analysesSummary.awaitingReview}</strong></div>
            <div><span>Aprovadas</span><strong>{analysesSummary.approved}</strong></div>
            <div><span>Inconsistentes</span><strong>{analysesSummary.inconsistent}</strong></div>
          </div>

          <section className="report-section">
            <h2>Talhões</h2>
            {fields.length ? (
              <div className="report-table-wrap"><table className="report-table">
                <thead><tr><th>Talhão</th><th>Área</th><th>Safras</th><th>Cobertura de coleta</th></tr></thead>
                <tbody>{fields.map((field: any) => (
                  <tr key={field.id}><td>{field.name}</td><td>{Number(field.areaHa).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} ha</td><td>{field.seasonCount}</td><td>{field.totalPoints ? `${field.collectedPoints}/${field.totalPoints} (${Math.round((field.collectedPoints / field.totalPoints) * 100)}%)` : "sem ordem de coleta"}</td></tr>
                ))}</tbody>
              </table></div>
            ) : <p className="report-empty-note">Nenhum talhão cadastrado nesta propriedade.</p>}
          </section>
          <ReportSignature branding={branding} />
        </article>
      </div>
    </>
  );
}
