import Link from "next/link";
import { Icon } from "@/components/icon";
import { getExecutiveDecisionMetrics } from "@/lib/repositories/executive-decision-metrics";
import styles from "./decision-portfolio-funnel.module.css";

type DashboardDecisionFilters = { clientId?: string; propertyId?: string; cropSeasonId?: string };

export async function DecisionPortfolioFunnelCard({ tenantId, userId, filters }: { tenantId: string; userId: string; filters: DashboardDecisionFilters }) {
  const data = await getExecutiveDecisionMetrics(tenantId, {
    clientId: filters.clientId,
    propertyId: filters.propertyId,
    seasonId: filters.cropSeasonId,
  }, userId);
  const deliveryRate = data.totalAnalyses > 0 ? Math.round((data.deliveredAnalyses / data.totalAnalyses) * 100) : 0;
  const stages = [
    { label: "Análises", value: data.totalAnalyses, detail: "no filtro atual", cls: "" },
    { label: "Interpretadas", value: data.approvedInterpretations + data.awaitingInterpretationReview + data.blockedInterpretations, detail: "com leitura registrada", cls: styles.accent },
    { label: "Aprovadas", value: data.approvedInterpretations, detail: "base técnica validada", cls: styles.accent },
    { label: "Recomendação aprovada", value: data.recommendationsApproved, detail: "manejo validado", cls: styles.accent },
    { label: "Entregues", value: data.deliveredAnalyses, detail: "relatório publicado", cls: styles.delivery },
  ];
  return <section className={styles.card} aria-label="Funil executivo de decisão e entrega">
    <div className={styles.head}><div><span className={styles.eyebrow}>FUNIL DE DECISÃO E ENTREGA</span><h2>Quanto da carteira virou decisão entregue?</h2><p>Da análise ao documento publicado: o indicador usa somente estados reais do motor, revisão profissional, recomendação e relatório.</p></div><div className={styles.conversion}><strong>{deliveryRate}%</strong><span>das análises com entrega publicada</span></div></div>
    <div className={styles.funnel}>{stages.map((stage)=><div className={`${styles.stage} ${stage.cls}`} key={stage.label}><span>{stage.label}</span><strong>{stage.value}</strong><small>{stage.detail}</small></div>)}</div>
    {(data.recommendationsInReview > 0 || data.readyForPublication > 0) && <div className={styles.review}><Icon name="clock" size={13}/><strong>{data.recommendationsInReview} em revisão · {data.readyForPublication} pronta(s) para publicar.</strong><span>É valor técnico já processado que ainda não virou entrega oficial.</span></div>}
    <div className={styles.footer}><span>Carteira filtrada e isolada por empresa. Nenhuma etapa posterior é promovida sem o gate técnico anterior.</span><Link href="/inteligencia">Abrir Central de Decisões <Icon name="arrow" size={13}/></Link></div>
  </section>;
}
