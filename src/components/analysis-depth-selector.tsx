import Link from "next/link";
import {
  ANALYSIS_DEPTHS,
  PREDEFINED_ANALYSIS_DEPTHS,
  type AnalysisDepth,
} from "@/domain/analysis-depths";
import styles from "./analysis-depth-selector.module.css";

function RequirementSection({
  title,
  items,
  tone,
}: {
  title: string;
  items: readonly string[];
  tone: "required" | "helpful" | "output";
}) {
  const dotClass =
    tone === "required"
      ? styles.dotRequired
      : tone === "helpful"
        ? styles.dotHelpful
        : styles.dotOutput;

  return (
    <div className={styles.section}>
      <div className={styles.sectionTitle}>
        <span className={dotClass} aria-hidden="true" />
        {title}
      </div>
      <ul className={styles.list}>
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

function DepthCard({ depth }: { depth: AnalysisDepth }) {
  return (
    <Link className={styles.card} href={`/analises/nova?nivel=${depth.id}`}>
      <div className={styles.cardHeader}>
        <span className={styles.number}>{depth.order}</span>
        <div className={styles.cardTitle}>
          <strong>{depth.title}</strong>
          <span>{depth.intent}</span>
        </div>
      </div>
      <p className={styles.description}>{depth.description}</p>
      <RequirementSection title="Você precisa ter" items={depth.minimumInputs} tone="required" />
      <RequirementSection title="Ajuda a melhorar" items={depth.helpfulInputs} tone="helpful" />
      <RequirementSection title="Você recebe" items={depth.outputs} tone="output" />
      <span className={styles.cta}>Começar análise →</span>
    </Link>
  );
}

export function AnalysisDepthSelector() {
  const personalized = ANALYSIS_DEPTHS.find((depth) => depth.id === "personalizada");

  return (
    <div className={styles.shell}>
      <div className={styles.intro}>
        <span className="eyebrow">PROFUNDIDADE DO DIAGNÓSTICO</span>
        <h2>O que você quer descobrir hoje?</h2>
        <p>
          Escolha o nível de profundidade antes de começar. A RAIZ mostra os dados mínimos, o que pode enriquecer a análise e o que será entregue. Você não precisa começar pelo nível 1 para usar os níveis seguintes.
        </p>
      </div>

      <div className={styles.grid}>
        {PREDEFINED_ANALYSIS_DEPTHS.map((depth) => (
          <DepthCard key={depth.id} depth={depth} />
        ))}
      </div>

      {personalized && (
        <Link className={styles.personalized} href={`/analises/nova?nivel=${personalized.id}`}>
          <div>
            <strong>Personalizar análise</strong>
            <span>
              Não sabe qual nível escolher ou quer combinar dados específicos? Informe seu objetivo e o que já possui; a RAIZ determina a profundidade possível e aponta apenas o que realmente falta.
            </span>
          </div>
          <span className={styles.cta}>Personalizar →</span>
        </Link>
      )}
    </div>
  );
}

export function AnalysisDepthSummary({ depth }: { depth: AnalysisDepth }) {
  return (
    <section className={styles.summary} aria-label={`Escopo selecionado: ${depth.title}`}>
      <div className={styles.summaryHeader}>
        <div>
          <span className="eyebrow">ESCOPO SELECIONADO</span>
          <h2>{depth.title}</h2>
          <p>{depth.description}</p>
        </div>
        <Link className={styles.changeLink} href="/analises/nova">
          Trocar profundidade
        </Link>
      </div>

      <div className={styles.summaryGrid}>
        <div className={styles.summaryBox}>
          <RequirementSection title="Você precisa ter" items={depth.minimumInputs} tone="required" />
        </div>
        <div className={styles.summaryBox}>
          <RequirementSection title="Ajuda a melhorar" items={depth.helpfulInputs} tone="helpful" />
        </div>
        <div className={styles.summaryBox}>
          <RequirementSection title="Você recebe" items={depth.outputs} tone="output" />
        </div>
      </div>

      <div className={styles.note}>
        <strong>Como a RAIZ trata dados faltantes:</strong> o sistema aproveita o que estiver validado e informa exatamente o que falta para concluir este nível. Cálculos que dependam de contexto obrigatório continuam bloqueados até que esse contexto exista; nenhum valor é inventado para “completar” a análise.
      </div>

      {depth.note && <div className={styles.note}>{depth.note}</div>}
    </section>
  );
}
