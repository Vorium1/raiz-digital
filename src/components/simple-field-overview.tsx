"use client";

import Link from "next/link";
import { Icon } from "@/components/icon";
import { RealFieldMap } from "@/components/real-field-map";
import { FieldOverviewTabs } from "@/components/field-overview-tabs";
import type { FieldOverview } from "@/lib/repositories/field-overview";
import type { OperationalAlert } from "@/lib/repositories/alerts";

const HIDDEN_TECHNICAL_ALERTS = new Set([
  "Parâmetro sem regra homologada",
  "Aviso climático da safra",
]);

function humanAttention(alert: OperationalAlert) {
  switch (alert.category) {
    case "Coleta atrasada": return { title: "Uma coleta precisa ser concluída", detail: alert.context };
    case "Pontos não coletados": return { title: "Ainda faltam pontos de coleta", detail: alert.context };
    case "Laudo aguardando importação": return { title: "Falta enviar o resultado do laboratório", detail: alert.context };
    case "Dados inválidos": return { title: "Precisamos conferir um dado recebido", detail: alert.context };
    case "Interpretação aguardando revisão": return { title: "Esta área está pronta para sua revisão", detail: alert.context };
    case "Talhão sem cultura definida": return { title: "Informe a cultura desta safra", detail: alert.context };
    case "Talhão sem safra definida": return { title: "Informe a safra desta área", detail: alert.context };
    case "Análise incompleta": return { title: "Há uma análise que precisa continuar", detail: alert.context };
    case "Reanálise de solo vencida": return { title: "Está na hora de atualizar a análise de solo", detail: alert.context };
    case "Desvio de aplicação de insumo": return { title: "Confira uma aplicação registrada", detail: alert.context };
    default: return { title: "Há uma informação para conferir", detail: alert.context };
  }
}

export function SimpleFieldOverview({ overview, alerts }: { overview: FieldOverview; alerts: OperationalAlert[] }) {
  const { field, seasons, analyses, reports } = overview;
  const season = seasons[0] ?? null;
  const seasonAnalyses = analyses.filter((analysis) => !season || analysis.cropSeasonId === season.id);
  const latest = seasonAnalyses[0] ?? null;
  const latestReport = latest ? reports.find((report) => report.analysisId === latest.id) ?? null : reports[0] ?? null;
  const actionableAlerts = alerts.filter((alert) => !HIDDEN_TECHNICAL_ALERTS.has(alert.category)).slice(0, 3);

  let stateTitle = "Ainda não analisado";
  let stateText = "Envie os dados desta área e a RAIZ organiza o restante.";
  let stateIcon: "upload" | "clock" | "shield" | "check" = "upload";
  let actionHref = "/analises/nova?etapa=laudo&nivel=interpretacao-rapida";
  let actionLabel = "Enviar dados";

  if (latestReport) {
    stateTitle = "Resultado pronto";
    stateText = "O resultado desta área já está disponível.";
    stateIcon = "check";
    actionHref = `/relatorios/talhao/${latestReport.analysisId}`;
    actionLabel = "Ver resultado";
  } else if (latest?.latestInterpretationStatus === "APPROVED") {
    stateTitle = "Revisão concluída";
    stateText = "A decisão técnica foi aprovada. Falta somente concluir a entrega.";
    stateIcon = "check";
    actionHref = `/analises/${latest.id}`;
    actionLabel = "Concluir entrega";
  } else if (latest?.latestInterpretationStatus === "IN_REVIEW" || latest?.status === "AWAITING_REVIEW") {
    stateTitle = "Pronto para revisar";
    stateText = "A RAIZ já preparou a análise. Agora é só conferir e decidir.";
    stateIcon = "shield";
    actionHref = `/analises/${latest.id}`;
    actionLabel = "Revisar agora";
  } else if (latest) {
    stateTitle = "Em análise";
    stateText = latest.notInterpretableReason
      ? "Falta uma informação para a RAIZ concluir esta análise."
      : "Os dados desta área estão sendo organizados e analisados.";
    stateIcon = "clock";
    actionHref = `/analises/${latest.id}`;
    actionLabel = latest.notInterpretableReason ? "Ver o que falta" : "Acompanhar";
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
        <RealFieldMap boundary={field.boundary as any} points={[]} height={390} hint="Clique e arraste para explorar a área" />
      </section>

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
            {actionableAlerts.map((alert) => {
              const copy = humanAttention(alert);
              return <Link key={alert.id} href={alert.href}><span><Icon name="warning" size={17}/></span><div><strong>{copy.title}</strong><small>{copy.detail}</small></div><b>Resolver</b><Icon name="chevron" size={15}/></Link>;
            })}
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
