import Link from "next/link";
import { Topbar } from "@/components/topbar";
import { Icon } from "@/components/icon";
import { StatusBadge } from "@/components/ui";
import { analyses, dashboardMetrics, samplePoints, tasks } from "@/lib/demo-data";
import { isDatabaseMode } from "@/lib/data-mode";
import { requirePlatformSession } from "@/lib/auth/session";
import { getDashboardSnapshot } from "@/lib/repositories/dashboard";
import { listAnalyses } from "@/lib/repositories/analyses";
import { analysisStatusMeta, formatRelativeOrDate } from "@/domain/analysis-ui";

export const metadata = { title: "Início" };

export default async function DashboardPage() {
  const database = isDatabaseMode();
  if (database) {
    const session = await requirePlatformSession();
    const [snapshot, recent] = await Promise.all([
      getDashboardSnapshot(session.tenantId, session.userId),
      listAnalyses(session.tenantId, session.userId),
    ]);
    return <DatabaseDashboard sessionName={session.name} snapshot={snapshot} recent={recent.slice(0,4)} />;
  }
  return <DemoDashboard/>;
}

function DatabaseDashboard({ sessionName, snapshot, recent }: { sessionName: string; snapshot: any; recent: any[] }) {
  const firstName = sessionName.trim().split(/\s+/)[0] || "equipe";
  const priority = snapshot.awaitingReview + snapshot.inconsistent;
  const metrics = [
    { label:"Análises ativas", value:snapshot.activeAnalyses, detail:`${snapshot.inconsistent} com inconsistência`, icon:"flask" },
    { label:"Aguardando revisão", value:snapshot.awaitingReview, detail:"decisão técnica pendente", icon:"shield" },
    { label:"Pontos coletados", value:snapshot.collectedPoints, detail:"registros confirmados", icon:"location" },
    { label:"Clientes", value:snapshot.clients, detail:"carteira deste tenant", icon:"users" },
  ] as const;
  return <>
    <Topbar eyebrow="Operação em tempo real" title={`Olá, ${firstName}.`} />
    <div className="content-wrap dashboard-page">
      <section className="hero-panel real-hero">
        <div><span className="eyebrow light">CENTRAL DE OPERAÇÕES</span><h2>{priority ? `${priority} item${priority === 1 ? "" : "s"} precisa${priority === 1 ? "" : "m"} de atenção.` : "Operação sem pendências críticas."}</h2><p>Os indicadores abaixo vêm diretamente do PostgreSQL e respeitam o tenant ativo da sessão.</p><div className="hero-actions"><Link href="/analises" className="button light">Abrir análises <Icon name="arrow" size={17}/></Link><Link href="/analises/nova" className="text-link light">Criar nova análise</Link></div></div>
        <div className="live-system-card"><span><i/>DADOS REAIS</span><strong>{snapshot.clients}</strong><small>clientes isolados nesta empresa</small><dl><div><dt>Revisões</dt><dd>{snapshot.awaitingReview}</dd></div><div><dt>Inconsistências</dt><dd>{snapshot.inconsistent}</dd></div><div><dt>Coletas</dt><dd>{snapshot.collectedPoints}</dd></div></dl></div>
      </section>
      <section className="metric-grid" aria-label="Indicadores reais">{metrics.map((metric)=><article className="metric-card" key={metric.label}><div className="metric-icon teal"><Icon name={metric.icon}/></div><div><span>{metric.label}</span><strong>{metric.value}</strong><small>{metric.detail}</small></div></article>)}</section>
      <section className="card analyses-card"><div className="card-header"><div><span className="eyebrow">FLUXO DE ANÁLISES</span><h2>Atualizações recentes</h2></div><Link href="/analises">Ver todas <Icon name="arrow" size={15}/></Link></div>{recent.length ? <div className="analysis-list">{recent.map((analysis)=>{const meta=analysisStatusMeta(analysis.status); return <Link className="analysis-row" href={`/analises/${analysis.id}`} key={analysis.id}><div className="analysis-id"><span>{analysis.code}</span><strong>{analysis.clientName}</strong><small>{analysis.fieldName} · {Number(analysis.areaHa).toLocaleString("pt-BR",{maximumFractionDigits:2})} ha</small></div><div className="analysis-progress"><div><i style={{width:`${meta.progress}%`}}/></div><small>{meta.progress}% do fluxo</small></div><StatusBadge tone={meta.tone}>{meta.label}</StatusBadge><span className="analysis-updated">{formatRelativeOrDate(analysis.updatedAt)}</span><Icon name="chevron" size={18}/></Link>})}</div> : <div className="empty-state"><Icon name="flask"/><strong>Nenhuma análise ainda</strong><small>Crie a primeira análise para alimentar esta central com dados reais.</small><Link className="button primary" href="/analises/nova">Criar análise</Link></div>}</section>
      <section className="system-foundation-grid"><article className="card foundation-card"><Icon name="shield"/><span className="eyebrow">ISOLAMENTO</span><strong>Tenant aplicado no banco</strong><small>A sessão define `app.tenant_id` dentro da transação antes de acessar entidades operacionais.</small></article><article className="card foundation-card"><Icon name="history"/><span className="eyebrow">AUDITORIA</span><strong>Cadastros rastreáveis</strong><small>Criações de clientes, análises e importações registram autor, entidade e horário.</small></article><article className="card foundation-card"><Icon name="upload"/><span className="eyebrow">LABORATÓRIO</span><strong>CSV validado antes de persistir</strong><small>Bloqueios técnicos mantêm a interpretação indisponível até correção humana.</small></article></section>
    </div>
  </>;
}

function DemoDashboard() {
  const recentAnalysis = analyses[0];
  const quickActions = [
    { href: "/analises?status=revisao", label: "Revisar análises", detail: "3 prontas para decisão", icon: "check" },
    { href: "/analises/nova?etapa=laudo", label: "Importar laudo", detail: "Validar CSV laboratorial", icon: "upload" },
    { href: "/coletas", label: "Programar coleta", detail: "Grid, GPS e equipe", icon: "map" },
    { href: "/clientes", label: "Novo cliente", detail: "Cadastro e propriedades", icon: "users" },
  ] as const;
  return <><Topbar eyebrow="Modo demonstração" title="RAIZ Digital"/><div className="content-wrap dashboard-page"><div className="demo-banner"><Icon name="warning" size={14}/><span>Modo demonstração ativo. Números, clientes e resultados abaixo são exemplos visuais.</span></div>
    <section className="hero-panel"><div><span className="eyebrow light">CENTRAL DE OPERAÇÕES</span><h2>Da coleta à decisão,<br/>tudo sob controle.</h2><p>Experiência demonstrativa da operação agronômica.</p><div className="hero-actions"><Link href="/analises" className="button light">Ver análises <Icon name="arrow" size={17}/></Link></div></div><div className="hero-visual" aria-label="Visual ilustrativo de talhão"> <div className="field-grid">{samplePoints.map((point)=><span key={point.id} className={`field-point ${point.className}`} style={{left:`${point.x}%`,top:`${point.y}%`}}><b>{point.id}</b><small>pH {point.value}</small></span>)}<svg viewBox="0 0 420 240" aria-hidden="true"><path d="M40 48 205 22l153 37 24 103-79 54-205-5-61-77z"/><path d="M49 92h318M71 151h296M139 34l-1 174M244 31l-3 183"/></svg></div></div></section>
    <section className="dashboard-actions-grid"><article className="continue-card"><div className="continue-icon"><Icon name="history" size={21}/></div><div className="continue-copy"><span className="eyebrow">EXEMPLO DE CONTINUIDADE</span><strong>{recentAnalysis.id} · {recentAnalysis.client}</strong><small>{recentAnalysis.area} · {recentAnalysis.status}</small></div><Link href={`/analises/${recentAnalysis.id}`} className="button secondary">Abrir</Link></article><article className="quick-actions-card"><div className="quick-actions-heading"><span className="eyebrow">ATALHOS</span><strong>Ações frequentes</strong></div><div className="quick-actions-list">{quickActions.map((action)=><Link key={action.label} href={action.href} className="quick-action"><span><Icon name={action.icon} size={18}/></span><div><strong>{action.label}</strong><small>{action.detail}</small></div><Icon name="chevron" size={15}/></Link>)}</div></article></section>
    <section className="metric-grid">{dashboardMetrics.map((metric)=><article className="metric-card" key={metric.label}><div className={`metric-icon ${metric.tone}`}><Icon name={metric.tone === "copper" ? "shield" : metric.tone === "cyan" ? "location" : metric.tone === "green" ? "users" : "flask"}/></div><div><span>{metric.label}</span><strong>{metric.value}</strong><small>{metric.trend}</small></div></article>)}</section>
    <div className="dashboard-columns"><section className="card analyses-card"><div className="card-header"><div><span className="eyebrow">EXEMPLOS</span><h2>Fluxo demonstrativo</h2></div><Link href="/analises">Ver todas</Link></div><div className="analysis-list">{analyses.slice(0,3).map((analysis)=><Link className="analysis-row" href={`/analises/${analysis.id}`} key={analysis.id}><div className="analysis-id"><span>{analysis.id}</span><strong>{analysis.client}</strong><small>{analysis.area}</small></div><div className="analysis-progress"><div><i style={{width:`${analysis.progress}%`}}/></div><small>{analysis.progress}% concluída</small></div><StatusBadge tone={analysis.statusTone}>{analysis.status}</StatusBadge><span className="analysis-updated">{analysis.updated}</span><Icon name="chevron" size={18}/></Link>)}</div></section><aside className="card agenda-card"><div className="card-header"><div><span className="eyebrow">EXEMPLO</span><h2>Agenda</h2></div></div><div className="timeline">{tasks.map((task)=><div className="timeline-item" key={task.time}><time>{task.time}</time><i className={task.type}/><div><strong>{task.title}</strong><small>{task.detail}</small></div></div>)}</div></aside></div>
  </div></>;
}
