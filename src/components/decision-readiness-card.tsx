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
  const interpreted = Boolean(interpretationStatus);
  const interpretationApproved = interpretationStatus === "APPROVED" || interpretationStatus === "PUBLISHED";
  const prescriptionStatus = delivery?.prescriptionStatus ?? null;
  const recommendationApproved = prescriptionStatus === "APPROVED";
  const reportPublished = (delivery?.reportCount ?? 0) > 0;

  let progress = 8;
  let tone: "success" | "review" | "waiting" | "danger" = "waiting";
  let headline = "Aguardando entrada laboratorial";
  let description = "A decisão técnica começa quando o laudo real estiver vinculado e validado.";
  let actionLabel = "Importar laudo";
  let actionHref = "/analises/nova?etapa=laudo";

  if (imported) {
    progress = 22;
    headline = validationBlocked ? "Entrada recebida com bloqueio técnico" : "Entrada laboratorial pronta";
    description = validationBlocked ? "Existe uma inconsistência que precisa ser resolvida antes da interpretação." : "O laudo está disponível para o motor agronômico.";
    actionLabel = validationBlocked ? "Resolver bloqueio" : "Executar interpretação";
    actionHref = "#nucleo-tecnico";
    tone = validationBlocked ? "danger" : "waiting";
  }
  if (interpreted) {
    progress = 43;
    headline = "Interpretação calculada";
    description = "O motor determinístico registrou a leitura técnica. Falta validação profissional antes de recomendar manejo.";
    actionLabel = "Validar interpretação";
    actionHref = "#nucleo-tecnico";
    tone = "review";
  }
  if (interpretationApproved) {
    progress = 62;
    headline = "Interpretação tecnicamente aprovada";
    description = "A base técnica está validada. A RAIZ pode avançar para a recomendação assistida sem pular a governança agronômica.";
    actionLabel = "Gerar recomendação RAIZ";
    actionHref = "#nucleo-tecnico";
    tone = "success";
  }
  if (prescriptionStatus === "PENDING_REVIEW") {
    progress = 76;
    headline = "Recomendação pronta para revisão";
    description = "A RAIZ gerou uma proposta de manejo baseada nas evidências disponíveis. Um profissional precisa revisar antes da entrega.";
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
    description = "A decisão técnica está assinada. Falta apenas publicar o documento oficial e congelar sua versão auditável.";
    actionLabel = "Preparar relatório oficial";
    actionHref = `/relatorios/talhao/${analysisId}`;
    tone = "success";
  }
  if (reportPublished) {
    progress = 100;
    headline = "Entrega técnica concluída";
    const publishedAt = formatPublishedAt(delivery?.latestReportAt ?? null);
    description = `Relatório oficial publicado${publishedAt ? ` em ${publishedAt}` : ""}, com versão persistida e rastreável.`;
    actionLabel = "Abrir versão publicada";
    actionHref = `/relatorios/talhao/${analysisId}?versao=publicada`;
    tone = "success";
  }

  const stages: Stage[] = [
    { label: "Laudo", detail: imported ? "Dados recebidos" : "Aguardando entrada", state: imported ? "done" : "active" },
    { label: "Validação", detail: validationBlocked ? "Bloqueio encontrado" : imported ? "Sem bloqueio" : "Pendente", state: validationBlocked ? "active" : imported ? "done" : "pending" },
    { label: "Interpretação", detail: interpreted ? "Motor executado" : "Ainda não calculada", state: interpreted ? "done" : imported && !validationBlocked ? "active" : "pending" },
    { label: "Aprovação técnica", detail: interpretationApproved ? "Validada" : interpretationStatus === "IN_REVIEW" ? "Em revisão" : "Pendente", state: interpretationApproved ? "done" : interpreted ? "active" : "pending" },
    { label: "Recomendação", detail: recommendationApproved ? "Aprovada" : prescriptionStatus === "PENDING_REVIEW" ? "Em revisão" : prescriptionStatus === "CHANGES_REQUESTED" ? "Ajuste solicitado" : prescriptionStatus === "REJECTED" ? "Rejeitada" : "Pendente", state: recommendationApproved ? "done" : prescriptionStatus ? "active" : interpretationApproved ? "active" : "pending" },
    { label: "Entrega", detail: reportPublished ? "Relatório publicado" : "Documento pendente", state: reportPublished ? "done" : recommendationApproved ? "active" : "pending" },
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
      <div className={styles.proof}><Icon name="shield" size={12}/>A RAIZ não promove interpretação, recomendação ou relatório sem os gates técnicos correspondentes. O progresso acima é derivado do estado real persistido, não de uma etapa visual inventada.</div>
    </section>
  );
}
