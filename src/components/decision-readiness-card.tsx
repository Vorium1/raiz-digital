import Link from "next/link";
import { Icon } from "@/components/icon";
import { StatusBadge } from "@/components/ui";
import type { DecisionDeliveryStatus } from "@/lib/repositories/decision-delivery-status";
import styles from "./decision-readiness-card.module.css";

type Props = {
  analysisId: string;
  analysisStatus: string;
  imported: boolean;
  interpretationStatus: string | null;
  delivery: DecisionDeliveryStatus | null;
};

type StageState = "done" | "active" | "pending";
type Stage = { label: string; detail: string; state: StageState };

function formatPublishedAt(value: string | null) {
  if (!value) return null;
  return new Date(value).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

export function DecisionReadinessCard({ analysisId, analysisStatus, imported, interpretationStatus, delivery }: Props) {
  const validationBlocked = analysisStatus === "INCONSISTENT";
  const hasInterpretation = Boolean(interpretationStatus);
  const interpretationCurrent = hasInterpretation && (delivery?.interpretationCurrent ?? false);
  const staleInterpretation = hasInterpretation && !interpretationCurrent;
  const interpreted = interpretationCurrent;
  const interpretationApproved = interpretationCurrent && (interpretationStatus === "APPROVED" || interpretationStatus === "PUBLISHED");
  const persistedPrescriptionStatus = delivery?.prescriptionStatus ?? null;
  const stalePrescription = Boolean(persistedPrescriptionStatus && !delivery?.prescriptionCurrent);
  const prescriptionStatus = delivery?.prescriptionCurrent ? persistedPrescriptionStatus : null;
  const recommendationApproved = prescriptionStatus === "APPROVED";
  const reportPublished = (delivery?.currentReportCount ?? 0) > 0;
  const historicalReportExists = (delivery?.reportCount ?? 0) > 0 && !reportPublished;

  let progress = 8;
  let tone: "success" | "review" | "waiting" | "danger" = "waiting";
  let headline = "Aguardando entrada laboratorial";
  let description = "A decisão técnica começa quando o laudo real estiver vinculado e validado.";
  let actionLabel = "Importar laudo";
  let actionHref = `/analises/${analysisId}/importar`;

  if (imported) {
    progress = 22;
    headline = validationBlocked ? "Entrada recebida com bloqueio técnico" : "Entrada laboratorial pronta";
    description = validationBlocked ? "Existe uma inconsistência que precisa ser resolvida antes da interpretação." : "O laudo está disponível para o motor agronômico.";
    actionLabel = validationBlocked ? "Resolver bloqueio" : "Executar interpretação";
    actionHref = "#nucleo-tecnico";
    tone = validationBlocked ? "danger" : "waiting";
  }
  if (staleInterpretation) {
    progress = 24;
    headline = "Novo laudo recebido — interpretação anterior virou histórico";
    description = delivery?.interpretationStaleReason ?? "A evidência laboratorial mudou. A decisão anterior permanece rastreável, mas não pode sustentar recomendação ou entrega atual.";
    actionLabel = "Recalcular interpretação";
    actionHref = "#nucleo-tecnico";
    tone = "danger";
  }
  if (interpreted) {
    progress = 43;
    headline = "Interpretação calculada";
    description = "O motor determinístico registrou a leitura técnica do laudo corrente. Falta validação profissional antes de recomendar manejo.";
    actionLabel = "Validar interpretação";
    actionHref = "#nucleo-tecnico";
    tone = "review";
  }
  if (interpretationApproved) {
    progress = 62;
    headline = "Interpretação tecnicamente aprovada";
    description = "A base técnica corrente está validada. A RAIZ pode avançar para a recomendação assistida sem pular a governança agronômica.";
    actionLabel = "Gerar recomendação RAIZ";
    actionHref = "#nucleo-tecnico";
    tone = "success";
  }
  if (stalePrescription && interpretationApproved) {
    progress = 62;
    headline = "Recomendação anterior virou histórico";
    description = "A interpretação ou o contexto corrente já não é o mesmo que sustentou a recomendação anterior. Gere uma nova versão antes da entrega.";
    actionLabel = "Gerar recomendação atual";
    actionHref = "#nucleo-tecnico";
    tone = "danger";
  }
  if (prescriptionStatus === "PENDING_REVIEW") {
    progress = 76;
    headline = "Recomendação pronta para revisão";
    description = "A RAIZ gerou uma proposta de manejo baseada nas evidências correntes. Um profissional precisa revisar antes da entrega.";
    actionLabel = "Revisar recomendação";
    actionHref = "#nucleo-tecnico";
    tone = "review";
  }
  if (prescriptionStatus === "CHANGES_REQUESTED") {
    progress = 72;
    headline = "Recomendação precisa de ajuste";
    description = "O revisor devolveu a proposta. A entrega continua bloqueada até uma nova versão ser validada.";
    actionLabel = "Gerar nova versão";
    actionHref = "#nucleo-tecnico";
    tone = "danger";
  }
  if (prescriptionStatus === "REJECTED") {
    progress = 68;
    headline = "Recomendação rejeitada";
    description = "A proposta não foi aceita tecnicamente. Nenhuma recomendação rejeitada é tratada como decisão oficial.";
    actionLabel = "Revisar núcleo técnico";
    actionHref = "#nucleo-tecnico";
    tone = "danger";
  }
  if (recommendationApproved) {
    progress = 88;
    headline = "Recomendação aprovada — pronta para entrega";
    description = "A decisão técnica corrente está assinada. Falta apenas publicar o documento oficial e congelar sua versão auditável.";
    actionLabel = "Preparar relatório oficial";
    actionHref = `/relatorios/talhao/${analysisId}`;
    tone = "success";
  }
  if (historicalReportExists && !reportPublished && !staleInterpretation && !stalePrescription && interpretationApproved) {
    progress = 88;
    headline = "Existe relatório histórico, mas não para a decisão corrente";
    description = "A versão publicada anteriormente permanece preservada para auditoria. A decisão atual precisa de uma nova publicação.";
    actionLabel = "Preparar relatório atual";
    actionHref = `/relatorios/talhao/${analysisId}`;
    tone = "review";
  }
  if (reportPublished) {
    progress = 100;
    headline = "Entrega técnica concluída";
    const publishedAt = formatPublishedAt(delivery?.latestCurrentReportAt ?? null);
    description = `Relatório oficial da evidência corrente publicado${publishedAt ? ` em ${publishedAt}` : ""}, com versão persistida e rastreável.`;
    actionLabel = "Abrir versão publicada";
    actionHref = `/relatorios/talhao/${analysisId}?versao=publicada`;
    tone = "success";
  }

  const stages: Stage[] = [
    { label: "Laudo", detail: imported ? "Dados recebidos" : "Aguardando entrada", state: imported ? "done" : "active" },
    { label: "Validação", detail: validationBlocked ? "Bloqueio encontrado" : imported ? "Sem bloqueio" : "Pendente", state: validationBlocked ? "active" : imported ? "done" : "pending" },
    { label: "Interpretação", detail: staleInterpretation ? "Recalcular com novo laudo" : interpreted ? "Motor executado" : "Ainda não calculada", state: staleInterpretation ? "active" : interpreted ? "done" : imported && !validationBlocked ? "active" : "pending" },
    { label: "Aprovação técnica", detail: interpretationApproved ? "Validada" : staleInterpretation ? "Aprovação anterior expirada" : interpretationStatus === "IN_REVIEW" ? "Em revisão" : "Pendente", state: interpretationApproved ? "done" : interpreted || staleInterpretation ? "active" : "pending" },
    { label: "Recomendação", detail: stalePrescription ? "Versão anterior histórica" : recommendationApproved ? "Aprovada" : prescriptionStatus === "PENDING_REVIEW" ? "Em revisão" : prescriptionStatus === "CHANGES_REQUESTED" ? "Ajuste solicitado" : prescriptionStatus === "REJECTED" ? "Rejeitada" : "Pendente", state: recommendationApproved ? "done" : stalePrescription || prescriptionStatus ? "active" : interpretationApproved ? "active" : "pending" },
    { label: "Entrega", detail: reportPublished ? "Relatório corrente publicado" : historicalReportExists ? "Só há versão histórica" : "Documento pendente", state: reportPublished ? "done" : recommendationApproved ? "active" : "pending" },
  ];

  return (
    <section className={styles.card} aria-label="Prontidão da decisão técnica">
      <div className={styles.head}>
        <div><span className={styles.eyebrow}>PRONTIDÃO DA DECISÃO</span><h2 className={styles.title}>Do laudo à entrega técnica</h2><p className={styles.description}>Uma trilha única mostra o que já está sustentado por evidência, o que depende de validação profissional e o que falta para entregar uma decisão oficial ao cliente.</p></div>
        <div className={styles.score}><strong>{progress}%</strong><small>prontidão operacional</small><StatusBadge tone={tone}>{reportPublished ? "Entrega concluída" : "Em preparação"}</StatusBadge></div>
      </div>
      <div className={styles.progressTrack} aria-hidden="true"><div className={styles.progressFill} style={{ width: `${progress}%` }}/></div>
      <div className={styles.summary}><div className={styles.summaryText}><strong>{headline}</strong><span>{description}</span></div><Link className={styles.action} href={actionHref}>{actionLabel}<Icon name="chevron" size={12}/></Link></div>
      <ol className={styles.stages}>{stages.map((stage, index) => <li key={stage.label} className={`${styles.stage} ${stage.state === "done" ? styles.stageDone : stage.state === "active" ? styles.stageActive : ""}`}><div className={styles.stageTop}><span className={styles.dot}>{stage.state === "done" ? <Icon name="check" size={11}/> : index + 1}</span><strong>{stage.label}</strong></div><small>{stage.detail}</small></li>)}</ol>
      <div className={styles.proof}><Icon name="shield" size={12}/>A RAIZ não promove interpretação, recomendação ou relatório sem os gates técnicos correspondentes. Versões anteriores continuam auditáveis, mas não contam como prontidão depois que a evidência muda.</div>
    </section>
  );
}
