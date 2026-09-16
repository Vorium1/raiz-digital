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

const REVIEWABLE = new Set(["IN_REVIEW", "APPROVED", "PUBLISHED"]);

function formatPublishedAt(value: string | null) {
  if (!value) return null;
  return new Date(value).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

export function DecisionReadinessCard({ analysisId, analysisStatus, imported, interpretationStatus, delivery }: Props) {
  const validationBlocked = analysisStatus === "INCONSISTENT";
  const hasInterpretation = Boolean(interpretationStatus);
  const interpretationCurrent = hasInterpretation && (delivery?.interpretationCurrent ?? false);
  const staleInterpretation = hasInterpretation && !interpretationCurrent;
  const engineReady = interpretationCurrent && Boolean(interpretationStatus && REVIEWABLE.has(interpretationStatus));
  const engineWithoutCoverage = interpretationCurrent && interpretationStatus === "CALCULATED";
  const persistedPrescriptionStatus = delivery?.prescriptionStatus ?? null;
  const stalePrescription = Boolean(persistedPrescriptionStatus && !delivery?.prescriptionCurrent);
  const prescriptionStatus = delivery?.prescriptionCurrent ? persistedPrescriptionStatus : null;
  const hasCurrentPrescription = Boolean(prescriptionStatus);
  const decisionApproved = prescriptionStatus === "APPROVED";
  const reportPublished = (delivery?.currentReportCount ?? 0) > 0;
  const historicalReportExists = (delivery?.reportCount ?? 0) > 0 && !reportPublished;

  let progress = 8;
  let tone: "success" | "review" | "waiting" | "danger" = "waiting";
  let headline = "Envie o laudo para começar";
  let description = "A RAIZ cuida da leitura, dos cálculos e da recomendação. Você entra no final para validar a decisão.";
  let actionLabel = "Importar laudo";
  let actionHref = `/analises/${analysisId}/importar`;

  if (imported) {
    progress = 22;
    headline = validationBlocked ? "O laudo precisa de uma correção" : "Laudo recebido";
    description = validationBlocked
      ? "A RAIZ encontrou uma inconsistência objetiva no arquivo. Corrija esse ponto antes de continuar."
      : "Os dados estão dentro da RAIZ. O próximo passo é o motor fazer a leitura técnica.";
    actionLabel = validationBlocked ? "Ver o que corrigir" : "Analisar agora";
    actionHref = "#nucleo-tecnico";
    tone = validationBlocked ? "danger" : "waiting";
  }
  if (staleInterpretation) {
    progress = 26;
    headline = "Os dados mudaram — vamos recalcular";
    description = delivery?.interpretationStaleReason ?? "Entrou evidência nova. A decisão anterior ficou preservada no histórico, mas não vale para o laudo atual.";
    actionLabel = "Recalcular decisão";
    actionHref = "#nucleo-tecnico";
    tone = "danger";
  } else if (engineWithoutCoverage) {
    progress = 38;
    headline = "A RAIZ processou o laudo, mas ainda não pode recomendar";
    description = "Falta uma regra homologada ou um dado necessário. A plataforma mostra exatamente o que falta sem inventar dose ou classificação.";
    actionLabel = "Ver o que falta";
    actionHref = "#nucleo-tecnico";
    tone = "review";
  } else if (engineReady && !hasCurrentPrescription) {
    progress = 58;
    headline = "Leitura técnica pronta";
    description = "A RAIZ já interpretou o laudo. Agora ela pode montar a recomendação completa para você julgar de uma vez.";
    actionLabel = "Montar recomendação";
    actionHref = "#decisao-raiz";
    tone = "success";
  }
  if (stalePrescription) {
    progress = 56;
    headline = "A recomendação ficou desatualizada";
    description = "O contexto ou a evidência mudou. Gere uma nova versão antes da validação profissional.";
    actionLabel = "Atualizar recomendação";
    actionHref = "#decisao-raiz";
    tone = "danger";
  }
  if (prescriptionStatus === "PENDING_REVIEW") {
    progress = 78;
    headline = "Recomendação pronta para sua validação";
    description = "Interpretação, cálculos, recomendação, fontes e limitações já estão montados. Revise o pacote e decida: aprovar, pedir ajuste ou rejeitar.";
    actionLabel = "Validar decisão";
    actionHref = "#decisao-raiz";
    tone = "review";
  }
  if (prescriptionStatus === "CHANGES_REQUESTED") {
    progress = 68;
    headline = "Ajuste solicitado";
    description = "A decisão voltou para a RAIZ. Gere a nova versão com a observação técnica registrada.";
    actionLabel = "Gerar nova versão";
    actionHref = "#decisao-raiz";
    tone = "review";
  }
  if (prescriptionStatus === "REJECTED") {
    progress = 64;
    headline = "Decisão rejeitada";
    description = "A versão permanece auditável, mas não será tratada como recomendação oficial.";
    actionLabel = "Rever decisão";
    actionHref = "#decisao-raiz";
    tone = "danger";
  }
  if (decisionApproved) {
    progress = 90;
    headline = "Decisão validada — pronta para relatório";
    description = "O responsável técnico assinou a recomendação completa. Falta apenas publicar o documento oficial.";
    actionLabel = "Preparar relatório";
    actionHref = `/relatorios/talhao/${analysisId}`;
    tone = "success";
  }
  if (historicalReportExists && !reportPublished && decisionApproved) {
    progress = 90;
    headline = "A decisão atual ainda precisa de um novo relatório";
    description = "A versão antiga continua guardada para auditoria. Publique um documento correspondente à decisão corrente.";
    actionLabel = "Preparar relatório atual";
    actionHref = `/relatorios/talhao/${analysisId}`;
    tone = "review";
  }
  if (reportPublished) {
    progress = 100;
    headline = "Relatório entregue";
    const publishedAt = formatPublishedAt(delivery?.latestCurrentReportAt ?? null);
    description = `A decisão atual foi publicada${publishedAt ? ` em ${publishedAt}` : ""} e sua versão ficou congelada para rastreabilidade.`;
    actionLabel = "Abrir relatório";
    actionHref = `/relatorios/talhao/${analysisId}?versao=publicada`;
    tone = "success";
  }

  const stages: Stage[] = [
    { label: "Laudo", detail: imported ? "Recebido" : "Pendente", state: imported ? "done" : "active" },
    { label: "Motor RAIZ", detail: staleInterpretation ? "Recalcular" : engineReady ? "Concluído" : engineWithoutCoverage ? "Falta cobertura" : "Pendente", state: engineReady ? "done" : imported ? "active" : "pending" },
    { label: "Recomendação", detail: stalePrescription ? "Atualizar" : hasCurrentPrescription ? "Gerada" : "Pendente", state: hasCurrentPrescription && !stalePrescription ? "done" : engineReady ? "active" : "pending" },
    { label: "Validação", detail: decisionApproved ? "Aprovada" : prescriptionStatus === "PENDING_REVIEW" ? "Sua decisão" : prescriptionStatus === "CHANGES_REQUESTED" ? "Ajuste pedido" : prescriptionStatus === "REJECTED" ? "Rejeitada" : "Pendente", state: decisionApproved ? "done" : prescriptionStatus === "PENDING_REVIEW" ? "active" : "pending" },
    { label: "Relatório", detail: reportPublished ? "Publicado" : historicalReportExists ? "Nova versão pendente" : "Pendente", state: reportPublished ? "done" : decisionApproved ? "active" : "pending" },
  ];

  return (
    <section className={styles.card} aria-label="Andamento da decisão agronômica">
      <div className={styles.head}>
        <div><span className={styles.eyebrow}>ANDAMENTO</span><h2 className={styles.title}>Do laudo à decisão, sem burocracia</h2><p className={styles.description}>A RAIZ faz o processamento pesado por trás. Na tela, você vê somente o próximo passo e a decisão que precisa tomar.</p></div>
        <div className={styles.score}><strong>{progress}%</strong><small>concluído</small><StatusBadge tone={tone}>{reportPublished ? "Entregue" : decisionApproved ? "Validada" : "Em andamento"}</StatusBadge></div>
      </div>
      <div className={styles.progressTrack} aria-hidden="true"><div className={styles.progressFill} style={{ width: `${progress}%` }}/></div>
      <div className={styles.summary}><div className={styles.summaryText}><strong>{headline}</strong><span>{description}</span></div><Link className={styles.action} href={actionHref}>{actionLabel}<Icon name="chevron" size={12}/></Link></div>
      <ol className={styles.stages}>{stages.map((stage, index) => <li key={stage.label} className={`${styles.stage} ${stage.state === "done" ? styles.stageDone : stage.state === "active" ? styles.stageActive : ""}`}><div className={styles.stageTop}><span className={styles.dot}>{stage.state === "done" ? <Icon name="check" size={11}/> : index + 1}</span><strong>{stage.label}</strong></div><small>{stage.detail}</small></li>)}</ol>
      <div className={styles.proof}><Icon name="shield" size={12}/>Cálculos, versões, fontes e auditoria continuam protegidos por trás da interface. A assinatura profissional acontece sobre a decisão completa.</div>
    </section>
  );
}
