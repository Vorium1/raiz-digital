import Link from "next/link";
import { Topbar } from "@/components/topbar";
import { Icon } from "@/components/icon";
import { StatusBadge } from "@/components/ui";
import { DashboardFilters } from "@/components/dashboard-filters";
import { analyses, dashboardMetrics, samplePoints, tasks } from "@/lib/demo-data";
import { isDatabaseMode } from "@/lib/data-mode";
import { requirePlatformSession } from "@/lib/auth/session";
import { getDashboardSnapshot, getExecutiveDashboard, getDashboardFilterOptions, getPortfolioFieldSummaries } from "@/lib/repositories/dashboard";
import { listAnalyses } from "@/lib/repositories/analyses";
import { listOperationalAlerts } from "@/lib/repositories/alerts";
import { analysisDisplayStatus, formatRelativeOrDate } from "@/domain/analysis-ui";
import { PortfolioMap } from "@/components/portfolio-map";

export const metadata = { title: "Início" };

export default async function DashboardPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const database = isDatabaseMode();
  if (database) {
    const params = await searchParams;
    const session = await requirePlatformSession();
    const filters = { clientId: params.clientId, propertyId: params.propertyId, cropSeasonId: params.cropSeasonId };
    // getDashboardSnapshot e listAnalyses agora recebem o mesmo filtro de cliente que o painel executivo --
    // antes só o painel executivo respeitava o filtro selecionado, e o resto da tela (hero, indicadores,
    // fluxo de análises) continuava mostrando a carteira inteira sem avisar (bug real confirmado na
    // auditoria, item A). listOperationalAlerts continua global de propósito (central de alertas cobre a
    // carteira toda) -- por isso o teaser abaixo diz isso explicitamente.
    const [snapshot, recent, executive, filterOptions, alerts, portfolioFields] = await Promise.all([
      getDashboardSnapshot(session.tenantId, session.userId, filters.clientId ?? null),
      listAnalyses(session.tenantId, session.userId, filters.clientId ?? null),
      getExecutiveDashboard(session.tenantId, filters, session.userId),
      getDashboardFilterOptions(session.tenantId, session.userId),
      listOperationalAlerts(session.tenantId, session.userId),
      // Mapa da carteira (Etapa 4, item C): mesmo filtro de cliente/propriedade/safra do resto da tela --
      // consulta agregada única (getPortfolioFieldSummaries), nunca uma consulta por talhão.
      getPortfolioFieldSummaries(session.tenantId, filters, session.userId),
    ]);
    // "Prioridades acionáveis" (RAIZ 2.0, Etapa 4): as 8 mais urgentes, ordenadas por criticidade real
    // (ALTA > MEDIA > BAIXA) e, dentro da mesma criticidade, pela data mais antiga primeiro (o que está
    // esperando há mais tempo sobe). Mesma fonte de dado da Central de Alertas -- nenhuma prioridade
    // inventada, só uma leitura priorizada do que já existe.
    //
    // Antes de ordenar: agrupa alertas do MESMO evento numa linha só, preservando fonte/validade (a
    // descrição não muda) e juntando as áreas afetadas -- pedido explícito do briefing ("agrupe alertas
    // repetidos quando houver identidade confiável do evento"). Restrito de propósito a categorias onde UM
    // evento real dispara vários alertas iguais por natureza (hoje só "Aviso climático da safra", que é o
    // mesmo aviso oficial repetido por talhão) -- agrupar por "mesmo título" de forma genérica quebrou em
    // teste real: "2 de 3 pontos pendentes" de ordens DIFERENTES por coincidência têm o mesmo título, mas
    // são eventos reais distintos (ordens de coleta diferentes) que não podem ser fundidos numa linha só.
    const GROUPABLE_CATEGORIES = new Set(["Aviso climático da safra"]);
    const grouped = new Map<string, typeof alerts[number] & { affectedAreas: string[] }>();
    for (const alert of alerts) {
      const key = GROUPABLE_CATEGORIES.has(alert.category) ? `${alert.category}::${alert.title}` : alert.id;
      const existing = grouped.get(key);
      if (existing) existing.affectedAreas.push(alert.context);
      else grouped.set(key, { ...alert, affectedAreas: [alert.context] });
    }
    const CRITICALITY_ORDER: Record<string, number> = { ALTA: 0, MEDIA: 1, BAIXA: 2 };
    const priorities = Array.from(grouped.values()).sort((a, b) => {
      const byCriticality = CRITICALITY_ORDER[a.criticality] - CRITICALITY_ORDER[b.criticality];
      if (byCriticality !== 0) return byCriticality;
      if (a.date && b.date) return new Date(a.date).getTime() - new Date(b.date).getTime();
      return a.date ? -1 : b.date ? 1 : 0;
    }).slice(0, 8);
    return <DatabaseDashboard sessionName={session.name} snapshot={snapshot} recent={recent.slice(0,4)} executive={executive} filterOptions={filterOptions} alertCount={alerts.length} criticalAlertCount={alerts.filter((a)=>a.criticality==="ALTA").length} priorities={priorities} portfolioFields={portfolioFields} />;
  }
  return <DemoDashboard/>;
}

const PRIORITY_TONE: Record<string, "danger" | "review" | "waiting"> = { ALTA: "danger", MEDIA: "review", BAIXA: "waiting" };

function DatabaseDashboard({ sessionName, snapshot, recent, executive, filterOptions, alertCount, criticalAlertCount, priorities, portfolioFields }: { sessionName: string; snapshot: any; recent: any[]; executive: any; filterOptions: any; alertCount: number; criticalAlertCount: number; priorities: any[]; portfolioFields: any[] }) {
  const firstName = sessionName.trim().split(/\s+/)[0] || "equipe";
  const priority = snapshot.awaitingReview + snapshot.inconsistent;
  const metrics = [
    { label:"Análises ativas", value:snapshot.activeAnalyses, detail:`${snapshot.inconsistent} com inconsistência`, icon:"flask" },
    { label:"Aguardando revisão", value:snapshot.awaitingReview, detail:"decisão técnica pendente", icon:"shield" },
    { label:"Pontos coletados", value:snapshot.collectedPoints, detail:"registros confirmados", icon:"location" },
    { label:"Clientes", value:snapshot.clients, detail:"carteira deste tenant", icon:"users" },
  ] as const;
  const executiveMetrics = [
    { label: "Propriedades", value: executive.properties, icon: "map" },
    { label: "Área total", value: `${Number(executive.totalAreaHa).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} ha`, icon: "leaf" },
    { label: "Talhões", value: executive.fields, icon: "layers" },
    { label: "Safras em andamento", value: executive.seasonsInProgress, icon: "calendar" },
    { label: "Ordens abertas", value: executive.openOrders, icon: "location" },
    { label: "Cobertura de coleta", value: `${executive.coveragePct}%`, icon: "check" },
    { label: "Laudos processados", value: executive.labsProcessed, icon: "upload" },
    { label: "Interpretações pendentes", value: executive.interpretationsPending, icon: "clock" },
    { label: "Talhões críticos", value: executive.criticalFields, icon: "warning" },
    { label: "Não avaliado (falta homologação)", value: executive.notInterpretableCount, icon: "shield" },
    { label: "Confiabilidade média", value: executive.avgConfidence != null ? `${Math.round(Number(executive.avgConfidence))}/100` : "—", icon: "shield" },
  ] as const;
  return <>
    <Topbar eyebrow="Operação em tempo real" title={`Olá, ${firstName}.`} />
    <div className="content-wrap dashboard-page">
      <section className="hero-panel real-hero">
        <div><span className="eyebrow light">CENTRAL DE OPERAÇÕES</span><h2>{priority ? `${priority} item${priority === 1 ? "" : "s"} precisa${priority === 1 ? "" : "m"} de atenção.` : "Operação sem pendências críticas."}</h2><p>Os indicadores abaixo vêm direto do banco de dados real desta operação e respeitam a empresa ativa da sua sessão.</p><div className="hero-actions"><Link href="/analises" className="button light">Abrir análises <Icon name="arrow" size={17}/></Link><Link href="/analises/nova" className="text-link light">Criar nova análise</Link></div></div>
        <div className="live-system-card"><span><i/>DADOS REAIS</span><strong>{snapshot.clients}</strong><small>clientes isolados nesta empresa</small><dl><div><dt>Revisões</dt><dd>{snapshot.awaitingReview}</dd></div><div><dt>Inconsistências</dt><dd>{snapshot.inconsistent}</dd></div><div><dt>Coletas</dt><dd>{snapshot.collectedPoints}</dd></div></dl></div>
      </section>

      {/* "Prioridades acionáveis" (RAIZ 2.0, Fase 1, Etapa 4): responde "o que exige atenção, onde, por
          quê e qual a próxima ação" -- mesma fonte de dado da Central de Alertas (por isso global/toda a
          carteira, igual ao teaser abaixo), só que aqui já mostrada como lista priorizada em vez de só um
          contador. Cada linha é clicável direto pro destino real (não pro índice genérico de alertas). */}
      {priorities.length > 0 && (
        <section className="card" style={{ marginBottom: 18 }}>
          <div className="field-ops-section-head compact"><div><span className="eyebrow">PRIORIDADES ACIONÁVEIS · TODA A CARTEIRA</span><h2>O que precisa de atenção agora</h2></div><Link href="/alertas">Ver todas <Icon name="arrow" size={15}/></Link></div>
          <div className="priority-list">
            {priorities.map((item) => (
              <Link key={item.id} href={item.affectedAreas.length > 1 ? "/alertas" : item.href} className="priority-row">
                <StatusBadge tone={PRIORITY_TONE[item.criticality]}>{item.criticality}</StatusBadge>
                <div>
                  <strong>{item.title}</strong>
                  <small className="priority-description">{item.description}</small>
                  {item.affectedAreas.length > 1 && <small className="priority-areas">{item.affectedAreas.length} talhões afetados: {item.affectedAreas.join(", ")}</small>}
                </div>
                <div className="priority-meta">
                  {item.date && <span>{new Date(item.date).toLocaleDateString("pt-BR")}</span>}
                  {item.responsible && <span>{item.responsible}</span>}
                </div>
                <Icon name="chevron" size={16}/>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Mapa da carteira (Etapa 4, item C) -- respeita o mesmo filtro de cliente/propriedade/safra do
          resto da tela (getPortfolioFieldSummaries recebe os mesmos `filters`). Cor vem sempre do status
          real de avaliação calculado no banco, nunca de uma criticidade inventada aqui. */}
      <section className="card" style={{ marginBottom: 18 }}>
        <div className="field-ops-section-head compact"><div><span className="eyebrow">MAPA DA CARTEIRA</span><h2>{portfolioFields.length} talhão(ões) no filtro atual</h2></div></div>
        {portfolioFields.length > 0 ? <PortfolioMap fields={portfolioFields}/> : <div className="chart-empty">Nenhum talhão cadastrado neste filtro ainda.</div>}
      </section>

      <section className="card" style={{ marginBottom: 18 }}>
        <div className="field-ops-section-head compact"><div><span className="eyebrow">PAINEL EXECUTIVO</span><h2>Visão consolidada da operação</h2></div></div>
        <DashboardFilters options={filterOptions}/>
        <div className="executive-metric-grid">
          {executiveMetrics.map((metric) => <div className="executive-metric" key={metric.label}><Icon name={metric.icon} size={17}/><div><strong>{metric.value}</strong><span>{metric.label}</span></div></div>)}
        </div>
        <div className="dashboard-teasers">
          {/* Central de alertas é intencionalmente global (cobre a carteira toda, não só o cliente
              filtrado acima) -- por isso diz isso explicitamente, em vez de parecer só mais um número
              filtrado igual aos outros (item A/Etapa 4: informação global precisa estar identificada). */}
          <Link href="/alertas" className="dashboard-teaser">
            <Icon name="warning" size={20}/>
            <div><strong>{alertCount} alerta(s) ativo(s)</strong><small>{criticalAlertCount} de criticidade alta · toda a carteira</small></div>
            <Icon name="arrow" size={16}/>
          </Link>
          <Link href="/mapas" className="dashboard-teaser">
            <Icon name="map" size={20}/>
            <div><strong>Mapa da operação</strong><small>{executive.fields} talhão(ões) georreferenciado(s)</small></div>
            <Icon name="arrow" size={16}/>
          </Link>
        </div>
      </section>

      <section className="metric-grid" aria-label="Indicadores reais">{metrics.map((metric)=><article className="metric-card" key={metric.label}><div className="metric-icon teal"><Icon name={metric.icon}/></div><div><span>{metric.label}</span><strong>{metric.value}</strong><small>{metric.detail}</small></div></article>)}</section>
      <section className="card analyses-card"><div className="card-header"><div><span className="eyebrow">FLUXO DE ANÁLISES</span><h2>Atualizações recentes</h2></div><Link href="/analises">Ver todas <Icon name="arrow" size={15}/></Link></div>{recent.length ? <div className="analysis-list">{recent.map((analysis)=>{const meta=analysisDisplayStatus(analysis); return <Link className="analysis-row" href={`/analises/${analysis.id}`} key={analysis.id}><div className="analysis-id"><span>{analysis.code}</span><strong>{analysis.clientName}</strong><small>{analysis.fieldName} · {Number(analysis.areaHa).toLocaleString("pt-BR",{maximumFractionDigits:2})} ha</small></div><div className="analysis-progress"><div><i style={{width:`${meta.progress}%`}}/></div><small>{meta.progress}% do fluxo</small></div><StatusBadge tone={meta.tone}>{meta.label}</StatusBadge><span className="analysis-updated">{formatRelativeOrDate(analysis.updatedAt)}</span><Icon name="chevron" size={18}/></Link>})}</div> : <div className="empty-state"><Icon name="flask"/><strong>Nenhuma análise ainda</strong><small>Crie a primeira análise para alimentar esta central com dados reais.</small><Link className="button primary" href="/analises/nova">Criar análise</Link></div>}</section>
      <section className="system-foundation-grid"><article className="card foundation-card"><Icon name="shield"/><span className="eyebrow">ISOLAMENTO</span><strong>Cada empresa só vê os próprios dados</strong><small>Toda consulta ao banco roda isolada pela empresa ativa da sua sessão, aplicado no próprio banco de dados — não é um filtro de tela que dá pra contornar.</small></article><article className="card foundation-card"><Icon name="history"/><span className="eyebrow">AUDITORIA</span><strong>Cadastros rastreáveis</strong><small>Criações de clientes, análises e importações registram autor, entidade e horário.</small></article><article className="card foundation-card"><Icon name="upload"/><span className="eyebrow">LABORATÓRIO</span><strong>CSV validado antes de persistir</strong><small>Bloqueios técnicos mantêm a interpretação indisponível até correção humana.</small></article></section>
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
