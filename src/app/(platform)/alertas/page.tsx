import Link from "next/link";
import { Topbar } from "@/components/topbar";
import { Icon } from "@/components/icon";
import { EmptyState, PageIntro } from "@/components/ui";
import { isDatabaseMode } from "@/lib/data-mode";
import { requirePlatformSession } from "@/lib/auth/session";
import { listOperationalAlerts, type AlertCriticality } from "@/lib/repositories/alerts";
import { demoAlerts } from "@/lib/demo-data";

export const metadata = { title: "Alertas" };

const CRITICALITY_LABEL: Record<AlertCriticality, string> = { ALTA: "Alta", MEDIA: "Média", BAIXA: "Baixa" };

export default async function AlertsPage() {
  if (!isDatabaseMode()) {
    const byCriticality: Record<AlertCriticality, typeof demoAlerts[number][]> = { ALTA: [], MEDIA: [], BAIXA: [] };
    for (const alert of demoAlerts) byCriticality[alert.criticality].push(alert);
    return <><Topbar eyebrow="Operação · demonstração" title="Alertas"/><div className="content-wrap"><div className="demo-banner"><Icon name="warning" size={14}/><span>Modo demonstração ativo — exemplos ilustrativos, não são alertas reais.</span></div><PageIntro title="Central operacional" description="Coleta atrasada, laudo pendente, revisão aguardando, inconsistência de dados — tudo num só lugar."/>
      <div className="alerts-summary">
        <div className="alerts-summary-card alta"><b>{byCriticality.ALTA.length}</b><span>criticidade alta</span></div>
        <div className="alerts-summary-card media"><b>{byCriticality.MEDIA.length}</b><span>criticidade média</span></div>
        <div className="alerts-summary-card baixa"><b>{byCriticality.BAIXA.length}</b><span>criticidade baixa</span></div>
      </div>
      {(["ALTA", "MEDIA", "BAIXA"] as const).map((level) => byCriticality[level].length > 0 && (
        <section className="card" style={{ marginBottom: 16 }} key={level}>
          <div className="field-ops-section-head compact"><div><span className="eyebrow">{CRITICALITY_LABEL[level].toUpperCase()}</span><h2>{byCriticality[level].length} alerta(s)</h2></div></div>
          {byCriticality[level].map((alert) => (
            <div key={alert.id} className="alert-row">
              <span className={`alert-dot ${level.toLowerCase()}`}/>
              <span className="alert-row-body"><strong>{alert.title}</strong><small>{alert.category} · {alert.description}</small></span>
            </div>
          ))}
        </section>
      ))}
    </div></>;
  }
  const session = await requirePlatformSession();
  const alerts = await listOperationalAlerts(session.tenantId, session.userId);
  const byCriticality: Record<AlertCriticality, typeof alerts> = { ALTA: [], MEDIA: [], BAIXA: [] };
  for (const alert of alerts) byCriticality[alert.criticality].push(alert);

  return (
    <>
      <Topbar eyebrow="Operação" title="Alertas"/>
      <div className="content-wrap">
        <PageIntro title="Central operacional" description="Cada item aqui vem de uma consulta real ao banco — nenhum alerta é decorativo. Clique para ir direto ao problema."/>

        <div className="alerts-summary">
          <div className="alerts-summary-card alta"><b>{byCriticality.ALTA.length}</b><span>criticidade alta</span></div>
          <div className="alerts-summary-card media"><b>{byCriticality.MEDIA.length}</b><span>criticidade média</span></div>
          <div className="alerts-summary-card baixa"><b>{byCriticality.BAIXA.length}</b><span>criticidade baixa</span></div>
        </div>

        {alerts.length === 0 ? (
          <div className="data-card"><EmptyState icon="leaf" title="Nenhum alerta no momento" description="Coleta em dia, laudos importados, interpretações revisadas e rastreabilidade íntegra."/></div>
        ) : (
          (["ALTA", "MEDIA", "BAIXA"] as const).map((level) => byCriticality[level].length > 0 && (
            <section className="card" style={{ marginBottom: 16 }} key={level}>
              <div className="field-ops-section-head compact"><div><span className="eyebrow">{CRITICALITY_LABEL[level].toUpperCase()}</span><h2>{byCriticality[level].length} alerta(s)</h2></div></div>
              {byCriticality[level].map((alert) => (
                <Link key={alert.id} href={alert.href} className="alert-row">
                  <span className={`alert-dot ${level.toLowerCase()}`}/>
                  <span className="alert-row-body">
                    <strong>{alert.title}</strong>
                    <small>{alert.category} · {alert.description}</small>
                  </span>
                  <Icon name="arrow" size={15}/>
                </Link>
              ))}
            </section>
          ))
        )}
      </div>
    </>
  );
}
