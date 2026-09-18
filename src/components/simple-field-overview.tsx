"use client";

import Link from "next/link";
import { Icon } from "@/components/icon";
import { RealFieldMap } from "@/components/real-field-map";
import { FieldOverviewTabs } from "@/components/field-overview-tabs";
import { SimpleFieldVigor } from "@/components/simple-field-vigor";
import type { FieldOverview } from "@/lib/repositories/field-overview";
import type { AnalysisEvidenceFreshness } from "@/domain/analysis-evidence-freshness";
import type { OperationalAlert } from "@/lib/repositories/alerts";
import { userActionAlerts, userAttentionHref, userAttentionTitle } from "@/domain/user-attention";

export function SimpleFieldOverview({
  overview,
  alerts,
  analysisFreshness,
}: {
  overview: FieldOverview;
  alerts: OperationalAlert[];
  analysisFreshness: AnalysisEvidenceFreshness | null;
}) {
  const { field, seasons, analyses, reports, collectionPoints } = overview;
  const season = seasons[0] ?? null;
  const seasonAnalyses = analyses.filter((analysis) => !season || analysis.cropSeasonId === season.id);
  const latest = seasonAnalyses[0] ?? null;
  const latestReport = latest ? reports.find((report) => report.analysisId === latest.id) ?? null : reports[0] ?? null;
  const actionableAlerts = userActionAlerts(alerts).slice(0, 3);
  const collectedPoints = collectionPoints.filter((point: any) => Boolean(point.collectedAt));
  const estimatedPointCount = collectionPoints.filter((point: any) => String(point.gpsSource ?? "").toUpperCase().startsWith("ESTIMADO_")).length;

  let stateTitle = "Ainda não analisado";
  let stateText = "Envie os dados desta área e a RAIZ organiza o restante.";
  let stateIcon: "upload" | "clock" | "shield" | "check" = "upload";
  let actionHref = "/enviar";
  let actionLabel = "Enviar dados";

  if (latestReport) {
    stateTitle = "Resultado pronto";
    stateText = "O resultado desta área já está disponível.";
    stateIcon = "check";
    actionHref = `/resultado/${latestReport.analysisId}`;
    actionLabel = "Ver resultado";
  } else if (latest && analysisFreshness?.current === false) {
    stateTitle = analysisFreshness.code === "AGRONOMIC_RULES_CHANGED" ? "Atualização disponível" : "Análise precisa ser atualizada";
    stateText = analysisFreshness.code === "AGRONOMIC_RULES_CHANGED"
      ? "A RAIZ encontrou regras mais atuais e pode atualizar esta análise."
      : "Há dados mais atuais do que esta análise.";
    stateIcon = "clock";
    actionHref = `/analise/${latest.id}`;
    actionLabel = "Continuar análise";
  } else if (latest?.latestInterpretationStatus === "APPROVED") {
    stateTitle = "Revisão concluída";
    stateText = "A decisão técnica foi aprovada. Falta somente concluir a entrega.";
    stateIcon = "check";
    actionHref = `/analise/${latest.id}`;
    actionLabel = "Concluir entrega";
  } else if (latest?.latestInterpretationStatus === "IN_REVIEW" || latest?.status === "AWAITING_REVIEW") {
    stateTitle = "Pronto para revisar";
    stateText = "A RAIZ já preparou a análise. Agora é só conferir e decidir.";
    stateIcon = "shield";
    actionHref = `/analise/${latest.id}`;
    actionLabel = "Revisar agora";
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

      <section className="simple-field-map-card">
        <div className="simple-field-map-head">
          <div><span>ÁREA E COLETA</span><strong>{collectionPoints.length ? `${collectedPoints.length || collectionPoints.length} ponto(s) de coleta` : "Limite do talhão"}</strong></div>
        </div>
        <RealFieldMap
          boundary={field.boundary as any}
          points={collectionPoints as any}
          height={390}
          hint={collectionPoints.length ? "Área e pontos desta coleta" : "Clique e arraste para explorar a área"}
        />
        {estimatedPointCount > 0 && (
          <div className="simple-field-map-note">
            <Icon name="location" size={14}/>
            <span>{estimatedPointCount === collectionPoints.length ? "As posições dos pontos são aproximadas conforme a referência disponível." : "Alguns pontos usam posição aproximada conforme a referência disponível."}</span>
          </div>
        )}
      </section>

      <SimpleFieldVigor fieldId={field.id}/>

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
