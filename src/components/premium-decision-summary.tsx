import { Icon } from "@/components/icon";
import styles from "./premium-decision-summary.module.css";

type InterpretationRow = {
  sampleCode: string;
  parameterCode: string;
  interpretable: boolean;
  classification?: string;
  reason?: string;
};

type Props = {
  rows: InterpretationRow[];
  sampleCount: number;
  interpretationStatus: string | null;
  prescriptionStatus: string | null;
  reportPublished: boolean;
  viewingPublished: boolean;
  confidence?: { score: number; level: string } | null;
  narrativeSummary?: string | null;
  prescriptionSummary?: string | null;
  managementPractices?: string[];
  missingInformation?: string[];
};

const MOTOR_READY = new Set(["IN_REVIEW", "APPROVED", "PUBLISHED"]);

function decisionState(props: Pick<Props, "interpretationStatus" | "prescriptionStatus" | "reportPublished" | "viewingPublished">) {
  if (props.viewingPublished && props.reportPublished) return { label: "DECISÃO PUBLICADA", headline: "Documento oficial e rastreável", detail: "Esta visualização representa a versão congelada no momento da publicação." };
  if (props.reportPublished) return { label: "ENTREGA PUBLICADA", headline: "Existe uma decisão oficial entregue", detail: "A versão publicada permanece preservada mesmo quando entram dados mais novos." };
  if (props.prescriptionStatus === "APPROVED") return { label: "DECISÃO VALIDADA", headline: "Recomendação pronta para entrega", detail: "O profissional aprovou o pacote completo. Falta publicar o relatório oficial." };
  if (props.prescriptionStatus === "PENDING_REVIEW") return { label: "PRONTA PARA VALIDAR", headline: "A RAIZ terminou o trabalho técnico", detail: "Interpretação, cálculos, recomendação e fontes estão reunidos para a decisão do responsável técnico." };
  if (props.interpretationStatus && MOTOR_READY.has(props.interpretationStatus)) return { label: "MOTOR RAIZ CONCLUÍDO", headline: "Leitura técnica pronta para montar a recomendação", detail: "O sistema já processou a evidência corrente. A validação humana acontecerá depois da recomendação completa." };
  return { label: "EM PREPARAÇÃO", headline: "A RAIZ ainda está montando a decisão", detail: "O que não tem base técnica suficiente continua explícito e não vira número inventado." };
}

export function PremiumDecisionSummary(props: Props) {
  const state = decisionState(props);
  const classifiedCodes = new Set(props.rows.filter((row) => row.interpretable && row.classification).map((row) => row.parameterCode));
  const pendingReasons = Array.from(new Set(props.rows.filter((row) => !row.interpretable && row.reason).map((row) => row.reason as string)));
  const classifications = new Map<string, number>();
  for (const row of props.rows) {
    if (!row.interpretable || !row.classification) continue;
    classifications.set(row.classification, (classifications.get(row.classification) ?? 0) + 1);
  }
  const distribution = Array.from(classifications.entries()).sort((a, b) => b[1] - a[1]);
  const executiveText = props.prescriptionSummary ?? props.narrativeSummary ?? state.detail;
  const management = (props.managementPractices ?? []).slice(0, 4);
  const missing = (props.missingInformation ?? []).slice(0, 4);
  const motorReady = Boolean(props.interpretationStatus && MOTOR_READY.has(props.interpretationStatus));
  const validationReady = props.prescriptionStatus === "PENDING_REVIEW" || props.prescriptionStatus === "APPROVED";

  return (
    <section className={styles.shell} aria-label="Resumo executivo da decisão agronômica">
      <div className={styles.hero}>
        <div><span className={styles.eyebrow}>{state.label}</span><h2>{state.headline}</h2><p>{executiveText}</p></div>
        <div className={styles.trustMark}><Icon name="shield" size={17}/><div><strong>RAIZ</strong><span>motor técnico + validação profissional</span></div></div>
      </div>
      <div className={styles.metrics}>
        <div><span>Parâmetros classificados</span><strong>{classifiedCodes.size}</strong><small>com regra técnica aplicável</small></div>
        <div><span>Pontos avaliados</span><strong>{props.sampleCount}</strong><small>vinculados à análise</small></div>
        <div><span>Pontos de atenção</span><strong>{pendingReasons.length}</strong><small>lacunas mantidas explícitas</small></div>
        <div><span>Confiabilidade</span><strong>{props.confidence ? `${Math.round(props.confidence.score)}/100` : "—"}</strong><small>{props.confidence?.level ?? "sem escore disponível"}</small></div>
      </div>
      <div className={styles.bodyGrid}>
        <div className={styles.block}><span className={styles.blockLabel}>LEITURA CONSOLIDADA</span>{distribution.length > 0 ? <div className={styles.distribution}>{distribution.slice(0, 6).map(([label, count]) => <div key={label}><strong>{count}</strong><span>{label}</span><small>leituras</small></div>)}</div> : <p className={styles.muted}>Ainda não há classificação homologada suficiente para consolidar.</p>}</div>
        <div className={styles.block}><span className={styles.blockLabel}>ETAPAS DA DECISÃO</span><ul className={styles.gates}>
          <li className={motorReady ? styles.ok : ""}><Icon name={motorReady ? "check" : "clock"} size={12}/><span>Motor RAIZ</span><strong>{motorReady ? "Concluído" : "Pendente"}</strong></li>
          <li className={props.prescriptionStatus ? styles.ok : ""}><Icon name={props.prescriptionStatus ? "check" : "clock"} size={12}/><span>Recomendação</span><strong>{props.prescriptionStatus ? "Gerada" : "Pendente"}</strong></li>
          <li className={props.prescriptionStatus === "APPROVED" ? styles.ok : ""}><Icon name={props.prescriptionStatus === "APPROVED" ? "check" : "clock"} size={12}/><span>Validação profissional</span><strong>{props.prescriptionStatus === "APPROVED" ? "Aprovada" : validationReady ? "Aguardando" : "Pendente"}</strong></li>
          <li className={props.reportPublished ? styles.ok : ""}><Icon name={props.reportPublished ? "check" : "clock"} size={12}/><span>Relatório</span><strong>{props.reportPublished ? "Publicado" : "Pendente"}</strong></li>
        </ul></div>
      </div>
      {(management.length > 0 || missing.length > 0) && !props.viewingPublished && <div className={styles.actionsGrid}>{management.length > 0 && <div className={styles.actionBlock}><span>PRÁTICAS PRIORIZADAS</span><ul>{management.map((item, index) => <li key={index}>{item}</li>)}</ul></div>}{missing.length > 0 && <div className={`${styles.actionBlock} ${styles.attention}`}><span>O QUE AINDA FALTA</span><ul>{missing.map((item, index) => <li key={index}>{item}</li>)}</ul></div>}</div>}
      {props.viewingPublished && <div className={styles.snapshotNote}><Icon name="history" size={12}/>Resumo calculado somente a partir dos dados congelados no relatório publicado.</div>}
    </section>
  );
}
