import {
  buildLabImportConfidenceExplanation,
  type LabConfidenceInput,
  type LabConfidenceIssueInput,
} from "@/domain/lab-import-confidence-explanation";
import styles from "./lab-import-confidence-explainer.module.css";

export function LabImportConfidenceExplainer({
  confidence,
  issues,
  reconstructionMatchesStoredScore,
  fileName,
}: {
  confidence: LabConfidenceInput;
  issues: LabConfidenceIssueInput[];
  reconstructionMatchesStoredScore: boolean;
  fileName?: string | null;
}) {
  const explanation = buildLabImportConfidenceExplanation(confidence, issues);

  return (
    <section className={styles.card} data-testid="lab-import-confidence" aria-label="Explicação da confiabilidade do laudo">
      <div className={styles.header}>
        <div>
          <span className={styles.eyebrow}>CONFIABILIDADE DO LAUDO / IMPORTAÇÃO</span>
          <h3>Por que o arquivo recebeu {Math.round(explanation.score)}/100?</h3>
          <p>{explanation.levelMeaning}</p>
          {fileName && <small className={styles.file}>Fonte importada: {fileName}</small>}
        </div>
        <div className={styles.score}>
          <strong>{Math.round(explanation.score)}</strong><span>/100</span>
          <small>{explanation.levelLabel}</small>
        </div>
      </div>

      {reconstructionMatchesStoredScore ? (
        <div className={styles.dimensions}>
          {explanation.dimensions.map((dimension) => (
            <article key={dimension.key} className={styles.dimension} data-status={dimension.status}>
              <div><strong>{dimension.label}</strong><b>{dimension.score}/100</b></div>
              <div className={styles.meter} aria-hidden="true"><span style={{ width: `${dimension.score}%` }} /></div>
              <p>{dimension.explanation}</p>
              <small>Peso {dimension.weightPct}% · contribuição {dimension.contribution.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} pontos</small>
            </article>
          ))}
        </div>
      ) : (
        <div className={styles.historical}>
          <strong>Score histórico preservado.</strong>
          <p>A regra atual não reproduziu exatamente a nota gravada nesta importação. A RAIZ mantém o valor original e não fabrica uma decomposição retroativa.</p>
        </div>
      )}

      <div className={styles.summary}>
        <div><span>Bloqueios</span><strong>{explanation.blockers}</strong></div>
        <div><span>Localizados</span><strong>{explanation.localizedBlockers}</strong></div>
        <div><span>Estruturais</span><strong>{explanation.structuralBlockers}</strong></div>
        <div><span>Alertas</span><strong>{explanation.warnings}</strong></div>
      </div>

      {explanation.issueGroups.length > 0 ? (
        <div className={styles.issues}>
          <strong>O que precisa de conferência</strong>
          {explanation.issueGroups.map((issue) => (
            <article key={`${issue.severity}::${issue.code}::${issue.scope}`}>
              <div className={styles.issueTop}>
                <code>{issue.code}</code>
                <b>{issue.severity === "BLOCKER" ? "Bloqueio" : issue.severity === "WARNING" ? "Alerta" : "Informação"}</b>
                <span>{issue.scope === "STRUCTURAL" ? "arquivo inteiro" : "evidência localizada"}{issue.count > 1 ? ` · ${issue.count} ocorrências` : ""}</span>
              </div>
              <p>{issue.message}</p>
              {issue.affected.length > 0 && <small>Afetado: {issue.affected.slice(0, 6).join(", ")}{issue.affected.length > 6 ? "…" : ""}</small>}
              <small><strong>Próxima evidência:</strong> {issue.requiredAction}</small>
            </article>
          ))}
        </div>
      ) : (
        <div className={styles.ok}>Nenhum bloqueio ou alerta foi registrado na última importação.</div>
      )}

      <p className={styles.caveat}>{explanation.caveat}</p>
    </section>
  );
}
