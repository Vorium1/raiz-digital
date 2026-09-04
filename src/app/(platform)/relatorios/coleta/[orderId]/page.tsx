import Link from "next/link";
import { notFound } from "next/navigation";
import { Topbar } from "@/components/topbar";
import { PrintButton } from "@/components/print-button";
import { RealFieldMap } from "@/components/real-field-map";
import { ReportBrand, ReportSignature } from "@/components/report-brand";
import { requirePlatformSession } from "@/lib/auth/session";
import { getCollectionReportData } from "@/lib/repositories/reports";
import { getTenantBranding } from "@/lib/repositories/tenant-branding";

export const metadata = { title: "Relatório de coleta" };

export default async function CollectionReportPage({ params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
  const session = await requirePlatformSession();
  const [data, branding] = await Promise.all([
    getCollectionReportData(session.tenantId, orderId, session.userId),
    getTenantBranding(session.tenantId),
  ]);
  if (!data) notFound();
  const { order, points } = data;
  const collected = points.filter((point: any) => point.collectedAt);

  return (
    <>
      <Topbar eyebrow="Relatórios" title="Relatório de coleta">
        <Link href="/relatorios" className="button ghost no-print">Voltar</Link>
      </Topbar>
      <div className="content-wrap">
        <div className="report-toolbar no-print"><span className="report-empty-note">Dados reais do PostGIS — nenhum ponto ou coordenada inventada.</span><PrintButton/></div>
        <article className="report-doc">
          <header className="report-header">
            <ReportBrand branding={branding} />
            <div className="report-header-meta"><span>Gerado em</span><strong>{new Date().toLocaleString("pt-BR")}</strong><span style={{ marginTop: 6 }}>Ordem</span><strong>{order.code}</strong></div>
          </header>
          <h1 className="report-title">Relatório de coleta</h1>
          <p className="report-subtitle">{order.clientName} · {order.propertyName} · {order.fieldName}</p>

          <div className="report-meta-grid">
            <div><span>Talhão</span><strong>{order.fieldName} · {Number(order.areaHa).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} ha</strong></div>
            <div><span>Safra / cultura</span><strong>{order.seasonLabel} · {order.currentCrop || "não informada"}</strong></div>
            <div><span>Profundidade</span><strong>{order.depthFromCm}–{order.depthToCm} cm</strong></div>
            <div><span>Estratégia</span><strong>{order.gridAreaHa ? `Grid ${order.gridAreaHa} ha/ponto` : "GPS"}</strong></div>
            <div><span>Responsável</span><strong>{order.assignedToName || "Não atribuído"}</strong></div>
            <div><span>Planejada para</span><strong>{order.plannedAt ? new Date(order.plannedAt).toLocaleDateString("pt-BR") : "—"}</strong></div>
            <div><span>Status</span><strong>{order.status}</strong></div>
            <div><span>Cobertura</span><strong>{points.length ? `${collected.length}/${points.length} (${Math.round((collected.length / points.length) * 100)}%)` : "—"}</strong></div>
          </div>

          {points.length > 0 && <section className="report-section no-print"><h2>Mapa real</h2><RealFieldMap boundary={order.fieldBoundary} points={points.map((point: any) => ({ ...point, sequence: null, observedLatitude: null, observedLongitude: null, subsampleCount: null, accuracyM: null, labResultCount: 0 }))} height={340}/></section>}

          <section className="report-section">
            <h2>Pontos ({points.length})</h2>
            {points.length ? (
              <div className="report-table-wrap"><table className="report-table">
                <thead><tr><th>Código</th><th>Coordenadas</th><th>Status</th><th>Coletado em</th><th>Coletor</th><th>Origem GPS</th></tr></thead>
                <tbody>{points.map((point: any) => (
                  <tr key={point.id}><td>{point.code}</td><td>{point.latitude.toFixed(6)}, {point.longitude.toFixed(6)}</td><td>{point.collectedAt ? "Coletado" : "Pendente"}</td><td>{point.collectedAt ? new Date(point.collectedAt).toLocaleString("pt-BR") : "—"}</td><td>{point.collectedByName || "—"}</td><td>{point.gpsSource || "—"}</td></tr>
                ))}</tbody>
              </table></div>
            ) : <p className="report-empty-note">Nenhum ponto gerado ainda para esta ordem.</p>}
          </section>
          <ReportSignature branding={branding} />
        </article>
      </div>
    </>
  );
}
