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
  // Nenhum ponto é inventado (posição sempre vem de uma geometria real do PostGIS), mas nem todo ponto tem
  // GPS confirmado em campo -- só os que passaram por "Confirmar aqui" no celular carregam 'BROWSER_GPS'
  // no gps_source; os demais são a posição planejada do grid ou uma estimativa. Antes o banner afirmava
  // "dados reais... nenhuma coordenada inventada" sem checar isso (bug real confirmado na auditoria, item H).
  const gpsConfirmedCount = points.filter((point: any) => String(point.gpsSource || "").includes("BROWSER_GPS")).length;

  return (
    <>
      <Topbar eyebrow="Relatórios" title="Relatório de coleta">
        <Link href="/relatorios" className="button ghost no-print">Voltar</Link>
      </Topbar>
      <div className="content-wrap">
        <div className="report-toolbar no-print"><span className="report-empty-note">Nenhuma coordenada é inventada — {gpsConfirmedCount} de {points.length} ponto(s) com GPS confirmado em campo; os demais mostram a posição planejada do grid (coluna "Origem GPS" abaixo identifica cada um).</span><PrintButton/></div>
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

          {/* Fase 3, Bloco E (operacional: "ordem e objetivo" / "instruções registradas"). Não há campo de
              texto livre de instrução/objetivo persistido em collection_orders hoje -- o objetivo real da
              ordem é composto do que JÁ é estruturado (safra/cultura, profundidade, estratégia de grid),
              mostrado acima. Registrado aqui como limitação concreta em vez de inventar um texto. */}
          <section className="report-section">
            <h2>Objetivo e instruções</h2>
            <p style={{ fontSize: 11, lineHeight: 1.7 }}>Coleta de solo na profundidade {order.depthFromCm}–{order.depthToCm} cm, safra {order.seasonLabel}{order.currentCrop ? ` (${order.currentCrop})` : ""}, {order.gridAreaHa ? `grid de ${order.gridAreaHa} ha por ponto` : "por GPS"}.</p>
            <p className="report-empty-note">Não existe hoje um campo de instrução textual livre persistido na ordem de coleta — as instruções estruturadas disponíveis são exatamente as mostradas acima (profundidade, estratégia, responsável, planejamento).</p>
          </section>

          {/* Fase 3, Bloco F: o mapa interativo (Leaflet) não é capturado pela impressão do navegador --
              por isso fica marcado "no-print" e some do PDF/impresso de propósito, em vez de aparecer
              quebrado. A origem geográfica de cada ponto (coordenadas reais + Origem GPS) continua
              presente no PDF pela tabela "Pontos" abaixo, que é a evidência espacial que SOBREVIVE à
              exportação. */}
          {points.length > 0 && <section className="report-section no-print"><h2>Mapa do talhão <span className="report-empty-note">(só na tela — no PDF, ver coordenadas na tabela de pontos abaixo)</span></h2><RealFieldMap boundary={order.fieldBoundary} points={points.map((point: any) => ({ ...point, sequence: null, observedLatitude: null, observedLongitude: null, subsampleCount: null, accuracyM: null, labResultCount: 0 }))} height={340}/></section>}

          <section className="report-section">
            <h2>Pontos ({points.length})</h2>
            {points.length ? (
              <div className="report-table-wrap"><table className="report-table">
                <thead><tr><th>Código</th><th>Coordenadas</th><th>Status</th><th>Coletado em</th><th>Coletor</th><th>Origem GPS</th></tr></thead>
                <tbody>{points.map((point: any) => (
                  <tr key={point.id}><td>{point.code}</td><td>{point.latitude.toFixed(6)}, {point.longitude.toFixed(6)}</td><td>{point.collectedAt ? "Coletado" : "Pendente"}</td><td>{point.collectedAt ? new Date(point.collectedAt).toLocaleString("pt-BR") : "—"}</td><td>{point.collectedByName || "—"}</td><td>{String(point.gpsSource || "").includes("BROWSER_GPS") ? "Confirmado em campo" : point.gpsSource ? "Estimado / planejado" : "—"}</td></tr>
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
