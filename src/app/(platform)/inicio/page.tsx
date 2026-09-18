import Link from "next/link";
import { Icon } from "@/components/icon";
import { SimplePortfolioMap } from "@/components/simple-portfolio-map";
import { isDatabaseMode } from "@/lib/data-mode";
import { requirePlatformSession } from "@/lib/auth/session";
import { getDashboardSnapshot, getPortfolioFieldSummaries } from "@/lib/repositories/dashboard";
import { listOperationalAlerts } from "@/lib/repositories/alerts";
import { userActionAlerts } from "@/domain/user-attention";

export const metadata = { title: "Início" };

const REVIEW_ROLES = new Set(["SUPER_ADMIN", "TENANT_ADMIN", "AGRONOMIST"]);
const SEND_HREF = "/enviar";

export default async function InicioPage() {
  if (!isDatabaseMode()) return <DemoInicio/>;

  const session = await requirePlatformSession();
  const [snapshot, alerts, fields] = await Promise.all([
    getDashboardSnapshot(session.tenantId, session.userId),
    listOperationalAlerts(session.tenantId, session.userId),
    getPortfolioFieldSummaries(session.tenantId, {}, session.userId),
  ]);

  const firstName = session.name.trim().split(/\s+/)[0] || "você";
  const canReview = REVIEW_ROLES.has(session.role);
  const reviewCount = snapshot.awaitingReview;
  const actionableAlerts = userActionAlerts(alerts);
  const attentionCount = actionableAlerts.length + (canReview ? reviewCount : 0);

  return (
    <div className="simple-home">
      <header className="simple-home-head">
        <div>
          <span>RAIZ DIGITAL</span>
          <h1>Olá, {firstName}.</h1>
          <p>O que você quer fazer?</p>
        </div>
        <Link href="/atencao" className={`simple-alert-button ${attentionCount > 0 ? "has-attention" : ""}`} aria-label={attentionCount > 0 ? "Há algo para conferir" : "Nada precisa da sua atenção agora"}>
          <Icon name={attentionCount > 0 ? "warning" : "check"} size={22}/>
          {attentionCount > 0 && <span className="simple-alert-dot" aria-hidden="true"/>}
        </Link>
      </header>

      <section className="simple-action-grid" aria-label="Ações principais">
        <Link href={SEND_HREF} className="simple-action-card primary">
          <span><Icon name="upload" size={28}/></span>
          <div><strong>Enviar dados</strong><small>Laudo, planilha ou arquivo</small></div>
          <Icon name="arrow" size={18}/>
        </Link>

        <Link href="/talhoes" className="simple-action-card">
          <span><Icon name="layers" size={28}/></span>
          <div><strong>Talhões</strong><small>Veja suas áreas e histórico</small></div>
          <Icon name="arrow" size={18}/>
        </Link>

        {canReview && (
          <Link href="/revisar" className="simple-action-card">
            <span><Icon name="shield" size={28}/></span>
            <div><strong>Revisar</strong><small>Confira conclusões pendentes</small></div>
            <Icon name="arrow" size={18}/>
          </Link>
        )}

        <Link href="/resultados" className="simple-action-card">
          <span><Icon name="file" size={28}/></span>
          <div><strong>Resultados</strong><small>Relatórios prontos</small></div>
          <Icon name="arrow" size={18}/>
        </Link>
      </section>

      <section className="simple-fields-section">
        <div className="simple-section-head">
          <div><span>SEUS TALHÕES</span><h2>Suas áreas</h2><p>Clique em uma área para abrir.</p></div>
          <Link href="/talhoes">Ver todos <Icon name="arrow" size={15}/></Link>
        </div>
        {fields.length > 0 ? (
          <SimplePortfolioMap fields={fields as any}/>
        ) : (
          <div className="simple-empty-map">
            <Icon name="map" size={34}/>
            <strong>Nenhum talhão cadastrado ainda.</strong>
            <small>Quando uma área for adicionada, ela aparece aqui automaticamente.</small>
          </div>
        )}
      </section>
    </div>
  );
}

function DemoInicio() {
  return (
    <div className="simple-home">
      <header className="simple-home-head"><div><span>RAIZ DIGITAL</span><h1>Olá.</h1><p>O que você quer fazer?</p></div></header>
      <section className="simple-action-grid">
        <Link href={SEND_HREF} className="simple-action-card primary"><span><Icon name="upload" size={28}/></span><div><strong>Enviar dados</strong><small>Comece por aqui</small></div><Icon name="arrow" size={18}/></Link>
        <Link href="/talhoes" className="simple-action-card"><span><Icon name="layers" size={28}/></span><div><strong>Meus talhões</strong><small>Veja suas áreas</small></div><Icon name="arrow" size={18}/></Link>
        <Link href="/resultados" className="simple-action-card"><span><Icon name="file" size={28}/></span><div><strong>Resultados</strong><small>Veja suas entregas</small></div><Icon name="arrow" size={18}/></Link>
      </section>
    </div>
  );
}
