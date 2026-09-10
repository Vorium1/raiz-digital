import Link from "next/link";
import { Topbar } from "@/components/topbar";
import { Icon } from "@/components/icon";
import { PageIntro, StatusBadge } from "@/components/ui";
import { analyses as demoAnalyses } from "@/lib/demo-data";
import { isDatabaseMode } from "@/lib/data-mode";
import { requirePlatformSession } from "@/lib/auth/session";
import { listAnalyses } from "@/lib/repositories/analyses";
import { AnalysesTable } from "@/components/analyses-table";
import { getAnalyticsStats, getAnalysisStatusDistribution, getFieldConfidenceRanking, getParameterAveragesForSeason, getParameterHistoryForField, getDefaultSeasonContext } from "@/lib/repositories/analytics-dashboard";
import { ParameterRangeBar, StatusDonut, ParameterTrendLine, ConfidenceRankingList, EmptyChartState } from "@/components/analytics-charts";

export const metadata = { title: "Análises" };

export default async function AnalysesPage({ searchParams }: { searchParams: Promise<{ talhao?: string }> }) {
  const { talhao } = await searchParams;
  const database = isDatabaseMode();
  const session = database ? await requirePlatformSession() : null;
  const realAnalyses = session ? await listAnalyses(session.tenantId, session.userId) : [];

  const panel = session ? await (async () => {
    const defaultSeason = await getDefaultSeasonContext(session.tenantId, session.userId);
    const [stats, statusDistribution, ranking, parameterAverages, phHistory] = await Promise.all([
      getAnalyticsStats(session.tenantId, {}, session.userId),
      getAnalysisStatusDistribution(session.tenantId, {}, session.userId),
      getFieldConfidenceRanking(session.tenantId, {}, session.userId),
      defaultSeason ? getParameterAveragesForSeason(session.tenantId, defaultSeason.cropSeasonId, session.userId) : Promise.resolve([]),
      defaultSeason ? getParameterHistoryForField(session.tenantId, defaultSeason.fieldId, "PH", 6, session.userId) : Promise.resolve([]),
    ]);
    return { stats, statusDistribution, ranking, parameterAverages, phHistory, defaultSeason };
  })() : null;

  const summary = database ? {
    active: realAnalyses.filter((item: any) => !["REPORT_SENT","ARCHIVED"].includes(item.status)).length,
    review: realAnalyses.filter((item: any) => item.status === "AWAITING_REVIEW").length,
    inconsistent: realAnalyses.filter((item: any) => item.status === "INCONSISTENT").length,
    published: realAnalyses.filter((item: any) => item.status === "REPORT_SENT").length,
  } : { active: 28, review: 7, inconsistent: 3, published: 19 };

  return <>
    <Topbar eyebrow="Operação" title="Análises" />
    <div className="content-wrap">
      <PageIntro title="Fluxo técnico completo" description="Acompanhe cada análise da coleta à publicação, com validação, rastreabilidade das regras e aprovação do responsável agronômico."/>
      {!database && <div className="demo-banner"><Icon name="warning" size={14}/><span>Modo demonstração ativo. Os dados abaixo são exemplos.</span></div>}

      {panel && (
        <section className="analytics-panel">
          <div className="analytics-stat-grid">
            <div className="analytics-stat"><span>Laudos no período</span><strong>{panel.stats.reportsInPeriod}</strong></div>
            <div className="analytics-stat"><span>Confiabilidade média</span><strong>{panel.stats.avgConfidence != null ? `${Math.round(panel.stats.avgConfidence)}/100` : "—"}</strong></div>
            <div className="analytics-stat"><span>Pontos com dado completo</span><strong>{panel.stats.pointsTotal > 0 ? `${Math.round((panel.stats.pointsWithCompleteData / panel.stats.pointsTotal) * 100)}%` : "—"}</strong><small>{panel.stats.pointsWithCompleteData} de {panel.stats.pointsTotal}</small></div>
            <div className="analytics-stat"><span>Parâmetros fora de faixa</span><strong className={panel.stats.parametersOutOfRange > 0 ? "danger-text" : ""}>{panel.stats.parametersOutOfRange}</strong></div>
            <div className="analytics-stat"><span>Aguardando revisão</span><strong className={panel.stats.awaitingReview > 0 ? "review-text" : ""}>{panel.stats.awaitingReview}</strong></div>
          </div>

          <div className="analytics-chart-grid">
            <div className="card analytics-chart-card">
              <div className="card-header"><div><span className="eyebrow">PARÂMETROS LABORATORIAIS</span><h2>Médias vs. faixa de referência</h2></div></div>
              <div className="analytics-chart-body">
                {panel.defaultSeason ? (
                  <>
                    <p className="analytics-scope-note">Talhão {panel.defaultSeason.fieldName} · Safra {panel.defaultSeason.seasonLabel} (análise mais recente com laudo)</p>
                    {panel.parameterAverages.length > 0 ? panel.parameterAverages.map((p) => <ParameterRangeBar key={p.parameterCode} parameter={p}/>) : <EmptyChartState message="Sem resultados de laboratório nesta safra ainda."/>}
                  </>
                ) : <EmptyChartState message="Nenhum laudo importado ainda -- assim que o primeiro for processado, as médias aparecem aqui."/>}
              </div>
            </div>
            <div className="card analytics-chart-card">
              <div className="card-header"><div><span className="eyebrow">STATUS DE COLETA</span><h2>Distribuição por análise</h2></div></div>
              <div className="analytics-chart-body"><StatusDonut buckets={panel.statusDistribution}/></div>
            </div>
          </div>

          <div className="analytics-chart-grid">
            <div className="card analytics-chart-card">
              <div className="card-header"><div><span className="eyebrow">HISTÓRICO</span><h2>Evolução do pH{panel.defaultSeason ? ` — ${panel.defaultSeason.fieldName}` : ""}</h2></div></div>
              <div className="analytics-chart-body"><ParameterTrendLine points={panel.phHistory} parameterLabel="pH"/></div>
            </div>
            <div className="card analytics-chart-card">
              <div className="card-header"><div><span className="eyebrow">RANKING</span><h2>Talhões por confiabilidade</h2></div></div>
              <div className="analytics-chart-body"><ConfidenceRankingList items={panel.ranking}/></div>
            </div>
          </div>
        </section>
      )}

      <section className="summary-strip">
        <div className="summary-item"><span>Em andamento</span><strong>{summary.active}</strong></div>
        <div className="summary-item"><span>Aguardando revisão</span><strong>{summary.review}</strong></div>
        <div className="summary-item"><span>Com inconsistências</span><strong>{summary.inconsistent}</strong></div>
        <div className="summary-item"><span>Relatórios enviados</span><strong>{summary.published}</strong></div>
      </section>
      {database ? <AnalysesTable analyses={realAnalyses} initialQuery={talhao ?? ""} /> : <>
        <div className="toolbar">
          <div className="toolbar-left"><label className="search-box"><Icon name="search" size={17}/><input aria-label="Buscar por cliente, área ou código" placeholder="Buscar por cliente, área ou código"/></label><select className="select" aria-label="Filtrar status"><option>Todos os status</option><option>Aguardando revisão</option><option>Com inconsistências</option><option>Aprovada</option></select></div>
          <div className="toolbar-right"><Link href="/analises/nova?etapa=laudo" className="button secondary"><Icon name="upload" size={16}/>Importar laudo</Link></div>
        </div>
        <div className="data-card">
          <table className="data-table"><thead><tr><th>Análise</th><th>Área</th><th>Progresso</th><th>Status</th><th>Atualização</th><th></th></tr></thead><tbody>
            {demoAnalyses.map((analysis) => <tr key={analysis.id}><td><Link href={`/analises/${analysis.id}`} className="table-link">{analysis.id}</Link><strong>{analysis.client}</strong></td><td>{analysis.area}</td><td className="progress-cell"><div><i style={{width:`${analysis.progress}%`}}/></div><small>{analysis.progress}% concluída</small></td><td><StatusBadge tone={analysis.statusTone}>{analysis.status}</StatusBadge></td><td>{analysis.updated}</td><td><Link href={`/analises/${analysis.id}`} aria-label={`Abrir ${analysis.id}`}><Icon name="chevron" size={17}/></Link></td></tr>)}
          </tbody></table>
        </div>
      </>}
    </div>
  </>;
}
