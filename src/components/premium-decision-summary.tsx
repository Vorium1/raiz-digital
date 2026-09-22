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

function decisionState(props: Pick<Props, "interpretationStatus" | "prescriptionStatus" | "reportPublished" | "viewingPublished">) {
  if (props.viewingPublished && props.reportPublished) return { label: "DECISÃO PUBLICADA", headline: "Documento oficial, íntegro e rastreável", detail: "Esta visualização representa a versão congelada no momento da publicação." };
  if (props.reportPublished) return { label: "ENTREGA JÁ PUBLICADA", headline: "Existe uma decisão oficial entregue", detail: "A tela atual pode conter dados mais novos. A versão publicada permanece preservada separadamente." };
  if (props.prescriptionStatus === "APPROVED") return { label: "PRONTA PARA ENTREGA", headline: "Recomendação técnica aprovada", detail: "A base agronômica e o plano de manejo passaram pelos gates técnicos. Falta publicar o documento oficial." };
  if (props.prescriptionStatus === "PENDING_REVIEW") return { label: "EM REVISÃO", headline: "Recomendação pronta para validação profissional", detail: "A proposta existe, mas ainda não é uma recomendação oficial até a aprovação do responsável técnico." };
  if (props.interpretationStatus === "APPROVED") return { label: "BASE TÉCNICA APROVADA", headline: "Interpretação validada; recomendação é o próximo passo", detail: "A leitura determinística foi aprovada e já pode sustentar a etapa de recomendação assistida." };
  if (props.interpretationStatus === "IN_REVIEW") return { label: "VALIDAÇÃO TÉCNICA", headline: "Interpretação aguardando revisão profissional", detail: "Nenhuma recomendação oficial é liberada antes da validação da interpretação." };
  return { label: "EM PREPARAÇÃO", headline: "Decisão técnica ainda em construção", detail: "O relatório mantém explícito o que está validado, o que está pendente e o que ainda não pode ser concluído." };
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
  const executiveText = props.prescriptionStatus === "APPROVED" && props.prescriptionSummary
    ? props.prescriptionSummary
    : props.narrativeSummary ?? state.detail;
  const management = (props.managementPractices ?? []).slice(0, 4);
  const missing = (props.missingInformation ?? []).slice(0, 4);

  return (
    <section className={styles.shell} aria-label="Resumo executivo da decisão agronômica">
      <div className={styles.hero}>
        <div>
          <span className={styles.eyebrow}>{state.label}</span>
          <h2>{state.headline}</h2>
          <p>{executiveText}</p>
        </div>
        <div className={styles.trustMark}>
          <Icon name="shield" size={17}/>
          <div><strong>RAIZ</strong><span>evidência + revisão + rastreabilidade</span></div>
        </div>
      </div>

      <div className={styles.metrics}>
        <div><span>Parâmetros classificados</span><strong>{classifiedCodes.size}</strong><small>códigos com classificação homologada</small></div>
        <div><span>Pontos no documento</span><strong>{props.sampleCount}</strong><small>amostras/pontos vinculados à análise</small></div>
        <div><span>Pendências técnicas</span><strong>{pendingReasons.length}</strong><small>motivos distintos ainda explícitos</small></div>
        <div><span>Confiabilidade técnica</span><strong>{props.confidence ? `${Math.round(props.confidence.score)}/100` : "—"}</strong><small>{props.confidence?.level ?? "sem escore disponível"}</small></div>
      </div>

      <div className={styles.bodyGrid}>
        <div className={styles.block}>
          <span className={styles.blockLabel}>LEITURA CONSOLIDADA</span>
          {distribution.length > 0 ? (
            <div className={styles.distribution}>
              {distribution.slice(0, 6).map(([label, count]) => <div key={label}><strong>{count}</strong><span>{label}</span><small>leituras classificadas</small></div>)}
            </div>
          ) : <p className={styles.muted}>Ainda não há classificação homologada disponível para consolidar.</p>}
        </div>

        <div className={styles.block}>
          <span className={styles.blockLabel}>GOVERNANÇA DA DECISÃO</span>
          <ul className={styles.gates}>
            <li className={props.interpretationStatus === "APPROVED" ? styles.ok : ""}><Icon name={props.interpretationStatus === "APPROVED" ? "check" : "clock"} size={12}/><span>Interpretação determinística</span><strong>{props.interpretationStatus === "APPROVED" ? "Aprovada" : "Pendente"}</strong></li>
            <li className={props.prescriptionStatus === "APPROVED" ? styles.ok : ""}><Icon name={props.prescriptionStatus === "APPROVED" ? "check" : "clock"} size={12}/><span>Recomendação profissional</span><strong>{props.prescriptionStatus === "APPROVED" ? "Aprovada" : props.prescriptionStatus === "PENDING_REVIEW" ? "Em revisão" : "Pendente"}</strong></li>
            <li className={props.reportPublished ? styles.ok : ""}><Icon name={props.reportPublished ? "check" : "clock"} size={12}/><span>Entrega oficial</span><strong>{props.reportPublished ? "Publicada" : "Pendente"}</strong></li>
          </ul>
        </div>
      </div>

      {(management.length > 0 || missing.length > 0) && !props.viewingPublished && (
        <div className={styles.actionsGrid}>
          {management.length > 0 && <div className={styles.actionBlock}><span>PRÁTICAS PRIORIZADAS</span><ul>{management.map((item, index) => <li key={index}>{item}</li>)}</ul></div>}
          {missing.length > 0 && <div className={`${styles.actionBlock} ${styles.attention}`}><span>INFORMAÇÃO QUE AINDA FALTA</span><ul>{missing.map((item, index) => <li key={index}>{item}</li>)}</ul></div>}
        </div>
      )}

      {props.viewingPublished && <div className={styles.snapshotNote}><Icon name="history" size={12}/>Resumo calculado somente a partir dos dados congelados no snapshot publicado. Conteúdo não versionado não é preenchido com dado atual.</div>}
    </section>
  );
}
