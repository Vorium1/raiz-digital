import Link from "next/link";
import { Icon } from "@/components/icon";
import styles from "./dashboard-activation.module.css";

type ActivationJourneyProps = {
  clients: number;
  properties: number;
  fields: number;
  seasons: number;
  totalPoints: number;
  labsProcessed: number;
  approvedFields: number;
};

type ActivationStep = {
  key: string;
  label: string;
  detail: string;
  done: boolean;
  href: string;
  action: string;
};

/**
 * Jornada de ativação comercial da operação. Não grava estado paralelo: cada etapa deriva exclusivamente
 * de fatos já existentes no tenant. Quando toda a jornada está concluída o bloco desaparece, evitando
 * transformar o dashboard maduro em checklist permanente.
 */
export function DashboardActivationJourney({
  clients,
  properties,
  fields,
  seasons,
  totalPoints,
  labsProcessed,
  approvedFields,
}: ActivationJourneyProps) {
  const steps: ActivationStep[] = [
    {
      key: "client",
      label: "Cliente cadastrado",
      detail: "Base comercial da carteira",
      done: clients > 0,
      href: "/clientes",
      action: "Cadastrar cliente",
    },
    {
      key: "field",
      label: "Propriedade e talhão",
      detail: "Geografia real da operação",
      done: properties > 0 && fields > 0,
      href: "/clientes",
      action: "Estruturar área",
    },
    {
      key: "season",
      label: "Safra e cultura",
      detail: "Contexto para o motor agronômico",
      done: seasons > 0,
      href: "/coletas#safras",
      action: "Definir safra",
    },
    {
      key: "collection",
      label: "Coleta estruturada",
      detail: "Pontos e rastreabilidade de campo",
      done: totalPoints > 0,
      href: "/coletas",
      action: "Planejar coleta",
    },
    {
      key: "lab",
      label: "Laudo processado",
      detail: "Evidência laboratorial validada",
      done: labsProcessed > 0,
      href: "/analises/nova?etapa=laudo",
      action: "Importar laudo",
    },
    {
      key: "decision",
      label: "Decisão aprovada",
      detail: "Interpretação revisada por profissional",
      done: approvedFields > 0,
      href: "/inteligencia",
      action: "Revisar decisão",
    },
  ];

  const completed = steps.filter((step) => step.done).length;
  if (completed === steps.length) return null;

  const nextIndex = steps.findIndex((step) => !step.done);
  const next = steps[nextIndex];
  const progress = Math.round((completed / steps.length) * 100);

  return (
    <section className={`${styles.shell} card`} aria-labelledby="activation-title">
      <div className={styles.summary}>
        <span className="eyebrow">ATIVAÇÃO DA OPERAÇÃO</span>
        <h2 id="activation-title">Da configuração à primeira decisão técnica</h2>
        <p>
          A RAIZ já encontrou <strong>{completed} de {steps.length}</strong> marcos reais concluídos nesta empresa.
          A próxima ação abaixo é calculada a partir do que já existe no banco — não é um checklist manual.
        </p>
        <div className={styles.progressRow}>
          <div className={styles.progressTrack} aria-label={`${progress}% da ativação concluída`}>
            <i style={{ width: `${progress}%` }} />
          </div>
          <strong>{progress}%</strong>
        </div>
        <div className={styles.nextAction}>
          <span>PRÓXIMA MELHOR AÇÃO</span>
          <strong>{next.label}</strong>
          <small>{next.detail}</small>
          <Link className="button primary" href={next.href}>{next.action} <Icon name="arrow" size={15}/></Link>
        </div>
      </div>

      <ol className={styles.steps}>
        {steps.map((step, index) => {
          const state = step.done ? "done" : index === nextIndex ? "active" : "waiting";
          return (
            <li key={step.key} className={`${styles.step} ${styles[state]}`}>
              <div className={styles.stepIndex}>{step.done ? <Icon name="check" size={13}/> : index + 1}</div>
              <div>
                <strong>{step.label}</strong>
                <small>{step.detail}</small>
              </div>
              {index === nextIndex && <span className={styles.current}>AGORA</span>}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
