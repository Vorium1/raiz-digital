import Link from "next/link";
import { Icon } from "@/components/icon";
import { getDecisionPortfolioFunnel, type DecisionPortfolioFilters } from "@/lib/repositories/decision-delivery-status";
import styles from "./decision-portfolio-funnel.module.css";

export async function DecisionPortfolioFunnelCard({ tenantId, userId, filters }: { tenantId: string; userId: string; filters: DecisionPortfolioFilters }) {
  const data = await getDecisionPortfolioFunnel(tenantId, filters, userId);
  const deliveryRate = data.totalAnalyses > 0 ? Math.round((data.reportsPublished / data.totalAnalyses) * 100) : 0;
  const stages = [
    { label: "Análises", value: data.totalAnalyses, detail: "no filtro atual", className: "" },
    { label: "Interpretadas", value: data.interpreted, detail: "motor executado", className: styles.accent },
    { label: "Aprovadas", value: data.interpretationsApproved, detail: "validação profissional", className: styles.accent },
    { label: "Recomendação aprovada", value: data.prescriptionsApproved, detail: "manejo validado", className: styles.accent },
    { label: "Entregues", value: data.reportsPublished, detail: "relatório publicado", className: styles.delivery },
  ];

  return (
    <section className={styles.card} aria-label="Funil executivo de decisão e entrega">
      <div className={styles.head}>
        <div><span className={styles.eyebrow}>FUNIL DE DECISÃO E ENTREGA</span><h2>Quanto da carteira virou decisão entregue?</h2><p>Este funil mede avanço real — análise, interpretação, aprovação profissional, recomendação validada e relatório publicado. Não usa etapas visuais simuladas.</p></div>
        <div className={styles.conversion}><strong>{deliveryRate}%</strong><span>das análises com entrega publicada</span></div>
      </div>
      <div className={styles.funnel}>
        {stages.map((stage) => <div className={`${styles.stage} ${stage.className}`} key={stage.label}><span>{stage.label}</span><strong>{stage.value}</strong><small>{stage.detail}</small></div>)}
      </div>
      {data.prescriptionsInReview > 0 && <div className={styles.review}><Icon name="clock" size={13}/><strong>{data.prescriptionsInReview} recomendação(ões) em revisão.</strong><span>É trabalho técnico já calculado que ainda não pode ser tratado como entrega oficial.</span></div>}
      <div className={styles.footer}><span>Indicador da carteira filtrada e isolada por empresa. Publicação exige os gates técnicos anteriores.</span><Link href="/inteligencia">Abrir Central de Decisões <Icon name="arrow" size={13}/></Link></div>
    </section>
  );
}
