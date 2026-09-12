import Link from "next/link";
import { Topbar } from "@/components/topbar";
import { Icon } from "@/components/icon";
import { EmptyState, PageIntro, StatusBadge } from "@/components/ui";
import { IntelligenceQueueFilters } from "@/components/intelligence-queue-filters";
import { AssistantEntryButton } from "@/components/assistant-entry-button";
import { isDatabaseMode } from "@/lib/data-mode";
import { requirePlatformSession } from "@/lib/auth/session";
import { getIntelligenceQueue, getIntelligenceFilterOptions } from "@/lib/repositories/interpretations";
import { getDecisionDeliveryStatuses, type DecisionDeliveryStatus } from "@/lib/repositories/decision-delivery-status";
import { getExecutiveDecisionMetrics } from "@/lib/repositories/executive-decision-metrics";
import { demoInterpretationsLog } from "@/lib/demo-data";
import { interpretationStatusMeta, interpretationQueueBucket, QUEUE_BUCKET_META, type QueueBucket } from "@/domain/interpretation-status";
import { formatRelativeOrDate } from "@/domain/analysis-ui";

export const metadata = { title: "Inteligência Agronômica" };

const STATUS_META = interpretationStatusMeta;

function nextActionFor(bucket: QueueBucket, analysisId: string, delivery?: DecisionDeliveryStatus): { label: string; href: string } {
  if (bucket === "BLOQUEADA") return { label: "Resolver bloqueio", href: `/analises/${analysisId}` };
  if (bucket === "REVISAO_EM_ANDAMENTO") return { label: "Concluir revisão técnica", href: `/analises/${analysisId}` };
  if (bucket === "AGUARDANDO_REVISAO") return { label: "Validar interpretação", href: `/analises/${analysisId}` };
  if (!delivery?.prescriptionStatus) return { label: "Gerar recomendação", href: `/analises/${analysisId}` };
  if (delivery.prescriptionStatus === "PENDING_REVIEW") return { label: "Revisar recomendação", href: `/analises/${analysisId}` };
  if (delivery.prescriptionStatus === "CHANGES_REQUESTED") return { label: "Gerar nova recomendação", href: `/analises/${analysisId}` };
  if (delivery.prescriptionStatus === "REJECTED") return { label: "Reavaliar recomendação", href: `/analises/${analysisId}` };
  if (delivery.reportCount === 0) return { label: "Publicar entrega", href: `/analises/${analysisId}` };
  return { label: "Abrir decisão entregue", href: `/analises/${analysisId}` };
}

function coverageText(item: any) {
  const classified = Number(item.classifiedCount ?? 0);
  const pending = Number(item.pendingTargetCount ?? 0);
  const auxiliary = Number(item.auxiliaryCount ?? 0);
  const targetTotal = classified + pending;

  if (item.bucket === "BLOQUEADA") {
    const reason = item.notInterpretableReason ? ` · ${item.notInterpretableReason}` : "";
    return `Sem cobertura técnica utilizável${targetTotal ? ` · 0/${targetTotal} resultados-alvo` : ""}${reason}`;
  }

  const coverage = targetTotal > 0 ? `${classified}/${targetTotal} resultados-alvo classificados` : "sem parâmetro-alvo";
  const pendingText = pending > 0 ? ` · ${pending} com pendência técnica` : " · cobertura técnica completa";
  const auxiliaryText = auxiliary > 0 ? ` · ${auxiliary} auxiliares` : "";
  return `Cobertura técnica: ${coverage}${pendingText}${auxiliaryText}`;
}

function deliveryText(bucket: QueueBucket, delivery?: DecisionDeliveryStatus) {
  if (bucket !== "APROVADA") return null;
  if (!delivery?.prescriptionStatus) return "Próxima etapa: recomendação assistida";
  if (delivery.prescriptionStatus === "PENDING_REVIEW") return "Recomendação gerada · aguardando revisão profissional";
  if (delivery.prescriptionStatus === "CHANGES_REQUESTED") return "Recomendação devolvida · nova versão necessária";
  if (delivery.prescriptionStatus === "REJECTED") return "Recomendação rejeitada · decisão precisa ser reavaliada";
  if (delivery.reportCount === 0) return "Recomendação aprovada · relatório ainda não publicado";
  return `Entrega concluída · ${delivery.reportCount} relatório${delivery.reportCount === 1 ? "" : "s"} publicado${delivery.reportCount === 1 ? "" : "s"}`;
}

export default async function AgronomicIntelligenceHubPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  if (!isDatabaseMode()) {
    return <><Topbar eyebrow="Inteligência · demonstração" title="Inteligência Agronômica"/><div className="content-wrap"><div className="demo-banner"><Icon name="warning" size={14}/><span>Modo demonstração ativo — exemplos ilustrativos.</span></div><PageIntro title="Fila de decisões técnicas" description="O que precisa de validação, correção ou aprovação — uma linha por análise, sempre com a revisão mais recente."/>
      <section className="card"><div className="report-table-wrap"><table className="report-table">
        <thead><tr><th>Análise</th><th>Cliente / talhão</th><th>Safra / cultura</th><th>Base técnica</th><th>Confiabilidade</th><th>Status</th><th>Calculado em</th></tr></thead>
        <tbody>{demoInterpretationsLog.map((item) => {
          const meta = STATUS_META(item.status);
          return (
            <tr key={`${item.code}-${item.revision}`}>
              <td><Link href={`/analises/${item.code}`}>{item.code}</Link> · rev {item.revision}</td>
              <td>{item.client} · {item.field}</td>
              <td>{item.season} · {item.crop}</td>
              <td>{item.cropProfile}</td>
              <td>{item.confidence}</td>
              <td><StatusBadge tone={meta.tone}>{meta.label}</StatusBadge></td>
              <td>{new Date(item.createdAt).toLocaleString("pt-BR")}</td>
            </tr>
          );
        })}</tbody>
      </table></div></section>
    </div></>;
  }

  const params = await searchParams;
  const session = await requirePlatformSession();
  const [rows, filterOptions, decisionMetrics] = await Promise.all([
    getIntelligenceQueue(session.tenantId, {
      clientId: params.clientId, propertyId: params.propertyId, fieldId: params.fieldId, seasonId: params.seasonId,
    }, session.userId),
    getIntelligenceFilterOptions(session.tenantId, session.userId),
    getExecutiveDecisionMetrics(session.tenantId, {
      clientId: params.clientId, propertyId: params.propertyId, fieldId: params.fieldId, seasonId: params.seasonId,
    }, session.userId),
  ]);
  const deliveryRows = await getDecisionDeliveryStatuses(session.tenantId, rows.map((row: any) => row.analysisId), session.userId);
  const deliveryByAnalysis = new Map(deliveryRows.map((row) => [row.analysisId, row]));

  const withBucket = rows.map((row: any) => ({ ...row, bucket: interpretationQueueBucket(row) as QueueBucket }));
  const filtered = withBucket.filter((row) => {
    if (params.interpretationState === "BLOQUEADA" && row.bucket !== "BLOQUEADA") return false;
    if (params.interpretationState === "INTERPRETAVEL" && row.bucket === "BLOQUEADA") return false;
    if (params.reviewState && row.bucket !== params.reviewState) return false;
    return true;
  });

  const counts: Record<QueueBucket, number> = { BLOQUEADA: 0, AGUARDANDO_REVISAO: 0, REVISAO_EM_ANDAMENTO: 0, APROVADA: 0 };
  for (const row of withBucket) counts[row.bucket as QueueBucket]++;

  const portfolio = withBucket.reduce((acc, item: any) => {
    acc.classified += Number(item.classifiedCount ?? 0);
    acc.pending += Number(item.pendingTargetCount ?? 0);
    acc.auxiliary += Number(item.auxiliaryCount ?? 0);
    return acc;
  }, { classified: 0, pending: 0, auxiliary: 0 });
  const portfolioTargetTotal = portfolio.classified + portfolio.pending;
  const portfolioCoverage = portfolioTargetTotal > 0 ? Math.round((portfolio.classified / portfolioTargetTotal) * 100) : 0;
  const deliveredCount = deliveryRows.filter((row) => row.reportCount > 0).length;
  const prescriptionReviewCount = deliveryRows.filter((row) => row.prescriptionStatus === "PENDING_REVIEW").length;
  const deliveryRate = decisionMetrics.totalAnalyses > 0 ? Math.round((decisionMetrics.deliveredAnalyses / decisionMetrics.totalAnalyses) * 100) : 0;

  const executiveMetrics = [
    { label: "Interpretações aprovadas", value: decisionMetrics.approvedInterpretations, detail: "base técnica validada", icon: "shield" },
    { label: "Recomendações em revisão", value: decisionMetrics.recommendationsInReview, detail: "aguardando responsável técnico", icon: "clock" },
    { label: "Prontas para publicação", value: decisionMetrics.readyForPublication, detail: "recomendação aprovada", icon: "upload" },
    { label: "Decisões entregues", value: decisionMetrics.deliveredAnalyses, detail: `${deliveryRate}% das análises no filtro`, icon: "check" },
    { label: "Tempo médio até entrega", value: decisionMetrics.avgDaysToDelivery == null ? "—" : `${Number(decisionMetrics.avgDaysToDelivery).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} dias`, detail: "da criação à publicação", icon: "calendar" },
  ] as const;

  return (
    <>
      <Topbar eyebrow="Inteligência" title="Inteligência Agronômica"><AssistantEntryButton label="Pergunte sobre a fila"/></Topbar>
      <div className="content-wrap">
        <PageIntro title="Central de decisões técnicas" description="Priorize o que bloqueia uma decisão, valide interpretações e avance até recomendação e entrega. A RAIZ mostra a jornada completa — não apenas o laudo."/>

        <div className="intelligence-bucket-summary">
          {(Object.keys(QUEUE_BUCKET_META) as QueueBucket[]).map((bucket) => (
            <div key={bucket} className={`intelligence-bucket-chip tone-${QUEUE_BUCKET_META[bucket].tone}`}>
              <strong>{counts[bucket]}</strong><span>{QUEUE_BUCKET_META[bucket].label}</span>
            </div>
          ))}
        </div>

        {withBucket.length > 0 && (
          <div className="demo-banner" style={{ marginTop: 12 }}>
            <Icon name="sparkles" size={14}/>
            <span><strong>Cobertura técnica da fila: {portfolioCoverage}%</strong> · {portfolio.classified}/{portfolioTargetTotal} resultados-alvo classificados{portfolio.pending > 0 ? ` · ${portfolio.pending} pendentes de cobertura técnica` : " · sem pendências de cobertura"}{portfolio.auxiliary > 0 ? ` · ${portfolio.auxiliary} dados auxiliares preservados como contexto` : ""} · {prescriptionReviewCount} recomendação(ões) em revisão · {deliveredCount} entrega(s) publicada(s).</span>
          </div>
        )}

        <section className="card" style={{ marginTop: 16, marginBottom: 18 }}>
          <div className="field-ops-section-head compact">
            <div><span className="eyebrow">VALOR ENTREGUE · CICLO DA DECISÃO</span><h2>Do laudo à decisão publicada</h2></div>
            <Link href="/relatorios">Abrir entregas <Icon name="arrow" size={15}/></Link>
          </div>
          <div className="executive-metric-grid">
            {executiveMetrics.map((metric) => (
              <div className="executive-metric" key={metric.label}>
                <Icon name={metric.icon} size={17}/>
                <div><strong>{metric.value}</strong><span>{metric.label}</span><small>{metric.detail}</small></div>
              </div>
            ))}
          </div>
          <div className="dashboard-teasers" style={{ marginTop: 14 }}>
            <Link href="/inteligencia" className="dashboard-teaser">
              <Icon name="sparkles" size={20}/>
              <div><strong>{decisionMetrics.readyForRecommendation} pronta(s) para recomendação</strong><small>interpretação já aprovada, ainda sem recomendação assistida</small></div>
              <Icon name="arrow" size={16}/>
            </Link>
            <Link href="/relatorios" className="dashboard-teaser">
              <Icon name="check" size={20}/>
              <div><strong>{decisionMetrics.deliveredAnalyses} decisão(ões) já entregue(s)</strong><small>{decisionMetrics.readyForPublication} aguardando apenas publicação da entrega</small></div>
              <Icon name="arrow" size={16}/>
            </Link>
          </div>
        </section>

        <IntelligenceQueueFilters options={filterOptions}/>

        <section className="card">
          {filtered.length ? (
            <div className="intelligence-queue-list">
              {filtered.map((item) => {
                const bucketMeta = QUEUE_BUCKET_META[item.bucket as QueueBucket];
                const delivery = deliveryByAnalysis.get(item.analysisId);
                const action = nextActionFor(item.bucket as QueueBucket, item.analysisId, delivery);
                const responsible = item.bucket === "APROVADA" ? item.approvedByName : item.reviewedByName;
                const deliveryState = deliveryText(item.bucket as QueueBucket, delivery);
                return (
                  <Link key={item.id} href={`/analises/${item.analysisId}`} className="intelligence-queue-row">
                    <div className="intelligence-queue-context">
                      <strong>{item.clientName} · {item.fieldName}</strong>
                      <small>{item.propertyName} · Safra {item.seasonLabel}{item.currentCrop ? ` · ${item.currentCrop}` : ""} · Análise {item.analysisCode}</small>
                    </div>
                    <div className="intelligence-queue-status">
                      <StatusBadge tone={bucketMeta.tone}>{bucketMeta.label}</StatusBadge>
                      {item.revisionCount > 1 && <small className="intelligence-queue-revcount"><Icon name="history" size={11}/>{item.revisionCount} versões</small>}
                    </div>
                    <div className="intelligence-queue-conclusion">
                      <span>{coverageText(item)}</span>
                      {deliveryState && <small style={{ display: "block", marginTop: 3 }}>{deliveryState}</small>}
                    </div>
                    <div className="intelligence-queue-meta">
                      <span>{formatRelativeOrDate(item.createdAt)}</span>
                      {responsible && <span className="intelligence-queue-responsible"><Icon name="users" size={11}/>{responsible}</span>}
                    </div>
                    <div className="intelligence-queue-action">{action.label}<Icon name="chevron" size={14}/></div>
                  </Link>
                );
              })}
            </div>
          ) : <EmptyState icon="leaf" title={withBucket.length ? "Nenhum item corresponde aos filtros" : "Nenhuma interpretação calculada ainda"} description={withBucket.length ? "Ajuste ou limpe os filtros acima." : "Rode o motor determinístico numa análise para começar o registro."} action={{ href: "/analises", label: "Ver análises" }}/>} 
        </section>
      </div>
    </>
  );
}
