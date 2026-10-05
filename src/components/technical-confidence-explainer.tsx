import { buildTechnicalConfidenceExplanation, type ConfidenceInput, type ConfidenceInterpretationInput } from "@/domain/technical-confidence-explanation";
import styles from "./technical-confidence-explainer.module.css";

export function TechnicalConfidenceExplainer({
  confidence,
  interpretation,
}: {
  confidence: ConfidenceInput;
  interpretation: ConfidenceInterpretationInput[];
}) {
  const explanation = buildTechnicalConfidenceExplanation(confidence, interpretation);

  return (
    <section className={styles.card} aria-label="Explicação da confiabilidade técnica">
      <div className={styles.header}>
        <div>
          <span className={styles.eyebrow}>CONFIABILIDADE EXPLICÁVEL</span>
          <h3>Por que esta revisão recebeu {explanation.score}/100?</h3>
          <p>{explanation.levelMeaning}</p>
        </div>
        <div className={styles.score}>
          <strong>{explanation.score}</strong>
          <span>/100</span>
          <small>{explanation.levelLabel}</small>
        </div>
      </div>

      <div className={styles.dimensions}>
        {explanation.dimensions.map((dimension) => (
          <article key={dimension.key} className={styles.dimension} data-status={dimension.status}>
            <div className={styles.dimensionTop}>
              <strong>{dimension.label}</strong>
              <b>{dimension.score}/100</b>
            </div>
            <div className={styles.meter} aria-hidden="true"><span style={{ width: `${dimension.score}%` }} /></div>
            <p>{dimension.explanation}</p>
            <small>Peso {dimension.weightPct}% · contribuição {dimension.contribution.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} pontos</small>
          </article>
        ))}
      </div>

      <div className={styles.coverage}>
        <div><span>Alvos classificados</span><strong>{explanation.coverage.classifiedTargets}/{explanation.coverage.totalTargets}</strong></div>
        <div><span>Alvos pendentes</span><strong>{explanation.coverage.pendingTargets}</strong></div>
        <div><span>Dados auxiliares</span><strong>{explanation.coverage.auxiliaryResults}</strong></div>
      </div>

      {explanation.strengths.length > 0 && (
        <div className={styles.block}>
          <strong>O que sustenta a confiança</strong>
          <ul>{explanation.strengths.map((item) => <li key={item}>{item}</li>)}</ul>
        </div>
      )}

      {explanation.limitations.length > 0 ? (
        <div className={styles.block}>
          <strong>O que reduz a confiança e como resolver</strong>
          <div className={styles.limitations}>
            {explanation.limitations.map((item) => (
              <article key={`${item.code}::${item.parameterCode}`}>
                <div><code>{item.code}</code><b>{item.parameterCode}{item.count > 1 ? ` · ${item.count} ocorrências` : ""}</b></div>
                <p>{item.reason}</p>
                <small><strong>Próxima evidência:</strong> {item.requiredAction}</small>
              </article>
            ))}
          </div>
          <p className={styles.locality}>Pendências são localizadas: um parâmetro sem evidência suficiente não invalida automaticamente os demais parâmetros que já têm suporte técnico.</p>
        </div>
      ) : (
        <div className={styles.ok}>Nenhuma limitação de classificação foi encontrada entre os parâmetros-alvo desta revisão.</div>
      )}

      <p className={styles.caveat}>{explanation.caveat}</p>
    </section>
  );
}
