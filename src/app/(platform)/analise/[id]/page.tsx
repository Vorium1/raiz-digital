import Link from "next/link";
import { notFound } from "next/navigation";
import { Icon } from "@/components/icon";
import { SimpleFinalReview } from "@/components/simple-final-review";
import { requirePlatformSession } from "@/lib/auth/session";
import { getAnalysisById } from "@/lib/repositories/analyses";
import { getLatestInterpretation } from "@/lib/repositories/interpretations";
import { getDecisionDeliveryStatuses } from "@/lib/repositories/decision-delivery-status";

const REVIEW_ROLES = new Set(["SUPER_ADMIN", "TENANT_ADMIN", "AGRONOMIST"]);

const PARAMETER_LABEL: Record<string, string> = {
  PH: "pH",
  P: "Fósforo",
  K: "Potássio",
  CA: "Cálcio",
  MG: "Magnésio",
  AL: "Alumínio",
  H_AL: "Acidez potencial",
  V: "Saturação por bases",
  MO: "Matéria orgânica",
  S: "Enxofre",
  B: "Boro",
  ZN: "Zinco",
  CU: "Cobre",
  MN: "Manganês",
  FE: "Ferro",
};

export const metadata = { title: "Análise" };

function parameterLabel(code: string) {
  return PARAMETER_LABEL[code.toUpperCase()] ?? code;
}

export default async function SimpleAnalysisPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requirePlatformSession();
  const [analysis, interpretation, deliveryRows] = await Promise.all([
    getAnalysisById(session.tenantId, id, session.userId),
    getLatestInterpretation(session.tenantId, id, session.userId),
    getDecisionDeliveryStatuses(session.tenantId, [id], session.userId),
  ]);
  if (!analysis) notFound();

  const delivery = deliveryRows[0] ?? null;
  const imported = Number((analysis as any).importCount) > 0 || Number((analysis as any).labSampleCount) > 0;
  const output = (interpretation as any)?.structuredOutput ?? null;
  const findings = Array.isArray(output?.interpretation)
    ? output.interpretation.filter((item: any) => item?.classificationRole !== "AUXILIARY" && item?.interpretable && item?.classification).slice(0, 8)
    : [];
  const blockedCount = Array.isArray(output?.interpretation)
    ? output.interpretation.filter((item: any) => item?.classificationRole !== "AUXILIARY" && !item?.interpretable).length
    : 0;

  let stateTitle = "Aguardando dados";
  let stateText = "Envie o resultado do laboratório para a RAIZ começar.";
  let stateIcon: "upload" | "clock" | "shield" | "check" = "upload";

  if (delivery?.currentReportCount) {
    stateTitle = "Resultado pronto";
    stateText = "Esta análise já foi revisada e publicada.";
    stateIcon = "check";
  } else if ((interpretation as any)?.status === "APPROVED" && delivery?.prescriptionStatus === "APPROVED") {
    stateTitle = "Revisão concluída";
    stateText = "A decisão técnica foi aprovada. Falta somente concluir a entrega.";
    stateIcon = "check";
  } else if ((interpretation as any)?.status === "IN_REVIEW" || delivery?.prescriptionStatus === "PENDING_REVIEW") {
    stateTitle = "Pronto para revisar";
    stateText = "A RAIZ já organizou a análise e preparou a etapa de decisão.";
    stateIcon = "shield";
  } else if (imported) {
    stateTitle = "Em análise";
    stateText = blockedCount > 0 ? "A RAIZ encontrou dados que ainda precisam de contexto para concluir." : "Os dados foram recebidos e estão sendo organizados.";
    stateIcon = "clock";
  }

  return (
    <div className="simple-analysis-page">
      <div className="simple-analysis-back"><Link href={`/talhoes/${(analysis as any).fieldId}`}><Icon name="arrow" size={15}/> {(analysis as any).fieldName}</Link></div>

      <header className="simple-analysis-head">
        <div>
          <span>{(analysis as any).clientName} · {(analysis as any).propertyName}</span>
          <h1>{(analysis as any).fieldName}</h1>
          <p>Safra {(analysis as any).seasonLabel}{(analysis as any).currentCrop ? ` · ${(analysis as any).currentCrop}` : ""}</p>
        </div>
        <div className={`simple-analysis-state ${stateIcon === "check" ? "ready" : stateIcon === "shield" ? "review" : ""}`}><span><Icon name={stateIcon} size={21}/></span><div><strong>{stateTitle}</strong><small>{stateText}</small></div></div>
      </header>

      <section className="simple-analysis-progress" aria-label="Andamento">
        <div className={imported ? "done" : "current"}><span><Icon name={imported ? "check" : "upload"} size={15}/></span><b>Dados</b><small>{imported ? "Recebidos" : "Aguardando"}</small></div>
        <i/>
        <div className={interpretation ? "done" : imported ? "current" : "pending"}><span><Icon name={interpretation ? "check" : "clock"} size={15}/></span><b>Análise</b><small>{interpretation ? "Pronta" : "Em andamento"}</small></div>
        <i/>
        <div className={(interpretation as any)?.status === "APPROVED" ? "done" : (interpretation as any)?.status === "IN_REVIEW" ? "current" : "pending"}><span><Icon name={(interpretation as any)?.status === "APPROVED" ? "check" : "shield"} size={15}/></span><b>Revisão</b><small>{(interpretation as any)?.status === "APPROVED" ? "Concluída" : "Quando estiver pronta"}</small></div>
        <i/>
        <div className={delivery?.currentReportCount ? "done" : "pending"}><span><Icon name={delivery?.currentReportCount ? "check" : "file"} size={15}/></span><b>Resultado</b><small>{delivery?.currentReportCount ? "Disponível" : "Depois da revisão"}</small></div>
      </section>

      {findings.length > 0 && (
        <section className="simple-analysis-findings">
          <div className="simple-analysis-section-title"><span>O QUE ENCONTRAMOS</span><h2>Principais resultados</h2><p>Resumo dos dados que o motor conseguiu interpretar com segurança.</p></div>
          <div className="simple-analysis-finding-grid">
            {findings.map((item: any, index: number) => <article key={`${item.sampleCode ?? "amostra"}-${item.parameterCode}-${index}`}><span>{parameterLabel(String(item.parameterCode ?? ""))}</span><strong>{item.classification}</strong><small>{item.sampleCode ? `Amostra ${item.sampleCode}` : "Dado interpretado"}</small></article>)}
          </div>
          {blockedCount > 0 && <div className="simple-analysis-note"><Icon name="warning" size={16}/><span>Alguns dados ainda precisam de contexto antes de virar recomendação. A RAIZ não completa essas informações por conta própria.</span></div>}
        </section>
      )}

      {!imported && (
        <section className="simple-analysis-empty"><span><Icon name="upload" size={27}/></span><div><strong>Comece enviando o laudo</strong><p>A RAIZ organiza e analisa o restante.</p></div><Link href={`/analises/${id}/importar`}>Enviar dados <Icon name="arrow" size={14}/></Link></section>
      )}

      {imported && <SimpleFinalReview analysisId={id} canReview={REVIEW_ROLES.has(session.role)}/>}

      <details className="simple-analysis-technical">
        <summary><span><Icon name="settings" size={17}/> Detalhes técnicos</span><Icon name="chevron" size={15}/></summary>
        <div><p>Mapas de pontos, rastreabilidade, fórmulas, métodos, simulações, histórico e ferramentas avançadas ficam no modo técnico.</p><Link href={`/analises/${id}`}>Abrir modo técnico completo <Icon name="arrow" size={13}/></Link></div>
      </details>
    </div>
  );
}
