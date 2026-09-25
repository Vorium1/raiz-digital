"use client";

import Link from "next/link";
import { Icon } from "@/components/icon";
import { FieldOverviewTabs } from "@/components/field-overview-tabs";
import { SimpleFieldVigor } from "@/components/simple-field-vigor";
import { SimpleFieldYieldOutlook } from "@/components/simple-field-yield-outlook";
import { SimpleFieldMapLayers } from "@/components/simple-field-map-layers";
import type { FieldOverview } from "@/lib/repositories/field-overview";
import type { DecisionDeliveryStatus } from "@/lib/repositories/decision-delivery-status";
import type { AnalysisEvidenceFreshness } from "@/domain/analysis-evidence-freshness";
import type { OperationalAlert } from "@/lib/repositories/alerts";
import { userActionAlerts, userAttentionHref, userAttentionTitle } from "@/domain/user-attention";

export function SimpleFieldOverview({
  overview,
  alerts,
  analysisFreshness,
  deliveryStatus,
  canRefreshAnalysis,
}: {
  overview: FieldOverview;
  alerts: OperationalAlert[];
  analysisFreshness: AnalysisEvidenceFreshness | null;
  deliveryStatus: DecisionDeliveryStatus | null;
  canRefreshAnalysis: boolean;
}) {
  const { field, seasons, analyses, reports, collectionPoints } = overview;
  const season = seasons[0] ?? null;
  const seasonAnalyses = analyses.filter((analysis) => !season || analysis.cropSeasonId === season.id);
  const latest = seasonAnalyses[0] ?? null;
  const latestReport = latest ? reports.find((report) => report.analysisId === latest.id) ?? null : null;
  const currentReport = latestReport && (deliveryStatus?.currentReportCount ?? 0) > 0 ? latestReport : null;
  const allActionableAlerts = userActionAlerts(alerts);
  const actionableAlerts = allActionableAlerts.slice(0, 3);

  let stateTitle = "Ainda não analisado";
  let stateText = "Envie os dados desta área e a RAIZ organiza o restante.";
  let stateIcon: "upload" | "clock" | "shield" | "check" = "upload";
  let actionHref = "/enviar";
  let actionLabel = "Enviar dados";

  if (latest && analysisFreshness?.current === false) {
    stateTitle = analysisFreshness.code === "AGRONOMIC_RULES_CHANGED" ? "Atualização disponível" : "Análise precisa ser atualizada";
    stateText = analysisFreshness.code === "AGRONOMIC_RULES_CHANGED"
      ? "A RAIZ encontrou regras mais atuais e pode atualizar esta análise."
      : "Há dados mais atuais do que esta análise.";
    stateIcon = "clock";
    actionHref = `/analise/${latest.id}`;
    actionLabel = "Continuar análise";
  } else if (currentReport) {
    stateTitle = "Resultado pronto";
    stateText = "A versão oficial corrente desta área já está disponível.";
    stateIcon = "check";
    actionHref = `/resultado/${currentReport.analysisId}`;
    actionLabel = "Ver resultado";
  } else if (
    latest?.latestInterpretationStatus === "APPROVED"
    && deliveryStatus?.prescriptionCurrent === true
    && deliveryStatus.prescriptionStatus === "APPROVED"
  ) {
    stateTitle = "Validado pelo motor RAIZ";
    stateText = "A decisão determinística corrente está pronta. Falta somente concluir a entrega.";
    stateIcon = "check";
    actionHref = `/analise/${latest.id}`;
    actionLabel = "Concluir entrega";
  } else if (latest?.latestInterpretationStatus === "IN_REVIEW" || latest?.status === "AWAITING_REVIEW") {
    stateTitle = "Resultado técnico preparado";
    stateText = "A RAIZ já calculou a análise. Abra para ver os dados, limites e próximos passos.";
    stateIcon = "shield";
    actionHref = `/analise/${latest.id}`;
    actionLabel = "Ver análise";
  } else if (latest) {
    stateTitle = latest.notInterpretableReason ? "Análise precisa continuar" : "Em análise";
    stateText = latest.notInterpretableReason
      ? "Os dados já estão registrados. Abra para atualizar a análise ou ver a limitação técnica."
      : "Os dados desta área estão sendo organizados e analisados.";
    stateIcon = "clock";
    actionHref = `/analise/${latest.id}`;
    actionLabel = latest.notInterpretableReason ? "Continuar análise" : "Acompanhar";
  }

  const crop = season?.nextCrop || season?.currentCrop || null;

  return (
    <div className="simple-field-page">
      <div className="simple-field-back"><Link href="/talhoes"><Icon name="arrow" size={15}/> Meus talhões</Link></div>

      <header className="simple-field-head">
        <div>
          <span>{field.clientName} · {field.propertyName}</span>
          <h1>{field.name}</h1>
          <p>{field.areaHa.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} ha{crop ? ` · ${crop}` : ""}{season ? ` · Safra ${season.seasonLabel}` : ""}</p>
        </div>
        <Link href={actionHref} className="simple-field-primary-action"><Icon name={stateIcon} size={19}/><span><strong>{stateTitle}</strong><small>{actionLabel}</small></span><Icon name="chevron" size={16}/></Link>
      </header>

      <SimpleFieldVigor fieldId={field.id} areaHa={field.areaHa}/>

      <SimpleFieldMapLayers
        fieldId={field.id}
        boundary={field.boundary as any}
        collectionPoints={collectionPoints as any}
        analysisId={latest?.id ?? null}
        freshnessCode={analysisFreshness?.code ?? null}
        canRefresh={canRefreshAnalysis}
      />

      <SimpleFieldYieldOutlook fieldId={field.id} fieldName={field.name} areaHa={field.areaHa} canManage={canRefreshAnalysis}/>

      <section className="simple-field-status">
        <div className={`simple-field-state ${stateIcon === "check" ? "ready" : stateIcon === "shield" ? "review" : ""}`}>
          <span><Icon name={stateIcon} size={22}/></span>
          <div><strong>{stateTitle}</strong><p>{stateText}</p></div>
          <Link href={actionHref}>{actionLabel} <Icon name="arrow" size={14}/></Link>
        </div>
      </section>

      {actionableAlerts.length > 0 && (
        <section className="simple-field-attention">
          <div className="simple-field-section-title"><span>PRECISA DE VOCÊ</span><h2>O que falta resolver</h2></div>
          <div className="simple-field-attention-list">
            {actionableAlerts.map((alert) => (
              <Link key={alert.id} href={userAttentionHref(alert)}><span><Icon name="warning" size={17}/></span><div><strong>{userAttentionTitle(alert.category)}</strong><small>{alert.context}</small></div><b>Resolver</b><Icon name="chevron" size={15}/></Link>
            ))}
          </div>
          {allActionableAlerts.length > actionableAlerts.length && (
            <Link href="/atencao" className="simple-field-attention-more">Ver todas as {allActionableAlerts.length} ações pendentes <Icon name="arrow" size={13}/></Link>
          )}
        </section>
      )}

      <details className="simple-technical-details">
        <summary><span><Icon name="settings" size={17}/> Detalhes técnicos</span><Icon name="chevron" size={16}/></summary>
        <div className="simple-technical-explainer">Dados de coleta, fertilidade, satélite, histórico, GPS, parâmetros e rastreabilidade ficam aqui para consulta técnica.</div>
        <FieldOverviewTabs overview={overview} alerts={alerts}/>
      </details>
    </div>
  );
}
