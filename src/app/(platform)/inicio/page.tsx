import { Suspense } from "react";
import Link from "next/link";
import { Icon } from "@/components/icon";
import { SimplePortfolioMap } from "@/components/simple-portfolio-map";
import { isDatabaseMode } from "@/lib/data-mode";
import { requirePlatformSession } from "@/lib/auth/session";
import { userActionAlerts } from "@/domain/user-attention";
import { listOperationalAlerts } from "@/lib/repositories/alerts";
import { getPortfolioFieldSummaries } from "@/lib/repositories/dashboard";

export const metadata = { title: "Início" };

const SEND_HREF = "/enviar";

export default async function InicioPage() {
  if (!isDatabaseMode()) return <DemoInicio/>;

  const session = await requirePlatformSession();
  const firstName = session.name.trim().split(/\s+/)[0] || "você";

  return (
    <div className="simple-home">
      <header className="simple-home-head">
        <div>
          <span>RAIZ DIGITAL</span>
          <h1>Olá, {firstName}.</h1>
          <p>O que você quer fazer?</p>
        </div>
        <Suspense fallback={<HomeAttentionFallback/>}>
          <HomeAttention tenantId={session.tenantId} userId={session.userId}/>
        </Suspense>
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
        <Suspense fallback={<HomeFieldsFallback/>}>
          <HomeFields tenantId={session.tenantId} userId={session.userId}/>
        </Suspense>
      </section>
    </div>
  );
}

async function HomeAttention({ tenantId, userId }: { tenantId: string; userId: string }) {
  const alerts = userActionAlerts(await listOperationalAlerts(tenantId, userId));
  const hasAttention = alerts.length > 0;
  return (
    <Link href="/atencao" className={`simple-alert-button ${hasAttention ? "has-attention" : ""}`} aria-label={hasAttention ? "Há algo para conferir" : "Nada precisa da sua atenção agora"}>
      <Icon name={hasAttention ? "warning" : "check"} size={22}/>
      {hasAttention && <span className="simple-alert-dot" aria-hidden="true"/>}
    </Link>
  );
}

function HomeAttentionFallback() {
  return (
    <Link href="/atencao" className="simple-alert-button" aria-label="Carregando itens que precisam da sua atenção">
      <Icon name="check" size={22}/>
    </Link>
  );
}

async function HomeFields({ tenantId, userId }: { tenantId: string; userId: string }) {
  const fields = await getPortfolioFieldSummaries(tenantId, {}, userId);
  if (fields.length > 0) return <SimplePortfolioMap fields={fields as any}/>;

  return (
    <div className="simple-empty-map">
      <Icon name="map" size={34}/>
      <strong>Nenhum talhão cadastrado ainda.</strong>
      <small>Quando uma área for adicionada, ela aparece aqui automaticamente.</small>
    </div>
  );
}

function HomeFieldsFallback() {
  return (
    <div className="simple-empty-map" role="status" aria-live="polite">
      <Icon name="clock" size={30}/>
      <strong>Carregando suas áreas…</strong>
      <small>A página já está pronta para uso enquanto o mapa é preparado.</small>
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
