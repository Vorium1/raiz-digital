import Link from "next/link";
import { Topbar } from "@/components/topbar";
import { Icon } from "@/components/icon";
import { StatusBadge } from "@/components/ui";
import { isDatabaseMode } from "@/lib/data-mode";
import { requirePlatformSession } from "@/lib/auth/session";
import { getDashboardSnapshot } from "@/lib/repositories/dashboard";
import { listAnalyses } from "@/lib/repositories/analyses";
import { listOperationalAlerts } from "@/lib/repositories/alerts";
import { analysisDisplayStatus, formatRelativeOrDate } from "@/domain/analysis-ui";

export const metadata = { title: "Início" };

const FLOW = [
  {
    step: 1,
    label: "Receber dados",
    detail: "Qualquer pessoa envia.",
    icon: "upload" as const,
    href: "/analises/nova?etapa=laudo&nivel=interpretacao-rapida",
  },
  {
    step: 2,
    label: "Processamento automático",
    detail: "O sistema organiza e valida.",
    icon: "sparkles" as const,
    href: "/analises",
  },
  {
    step: 3,
    label: "Análise",
    detail: "Interpretação técnica automática.",
    icon: "flask" as const,
    href: "/analises",
  },
  {
    step: 4,
    label: "Recomendação",
    detail: "Plano preparado com ciência e dados.",
    icon: "leaf" as const,
    href: "/analises",
  },
  {
    step: 5,
    label: "Revisão do agrônomo",
    detail: "O agrônomo confere e assina.",
    icon: "shield" as const,
    href: "/analises?status=revisao",
  },
  {
    step: 6,
    label: "Entrega ao cliente",
    detail: "Relatório final, pronto para uso.",
    icon: "file" as const,
    href: "/relatorios",
  },
] as const;

const REVIEW_ROLES = new Set(["SUPER_ADMIN", "TENANT_ADMIN", "AGRONOMIST"]);

export default async function InicioPage() {
  if (!isDatabaseMode()) return <DemoInicio />;

  const session = await requirePlatformSession();
  const [snapshot, analyses, alerts] = await Promise.all([
    getDashboardSnapshot(session.tenantId, session.userId),
    listAnalyses(session.tenantId, session.userId),
    listOperationalAlerts(session.tenantId, session.userId),
  ]);

  const recent = analyses.slice(0, 4);
  const reviewCount = snapshot.awaitingReview + snapshot.inconsistent;
  const criticalAlerts = alerts.filter((alert) => alert.criticality === "ALTA").length;
  const firstName = session.name.trim().split(/\s+/)[0] || "equipe";

  return (
    <>
      <Topbar eyebrow="RAIZ DIGITAL" title={`Olá, ${firstName}.`}>
        <span className="ux2-system-online"><i aria-hidden="true" />Sistema online</span>
      </Topbar>
      <div className="content-wrap ux2-home concept-home">
        <header className="concept-heading">
          <div>
            <span className="concept-kicker">TECNOLOGIA QUE TRANSFORMA DADOS EM PRODUTIVIDADE</span>
            <h2>RAIZ Digital — Fluxo Inteligente</h2>
            <p>Do envio dos dados à recomendação assinada.</p>
          </div>
          <Link className="button primary concept-main-action" href="/analises/nova?etapa=laudo&nivel=interpretacao-rapida">
            <Icon name="upload" size={17}/> Enviar dados
          </Link>
        </header>

        <section className="concept-flow" aria-label="Fluxo inteligente da RAIZ Digital">
          {FLOW.map((item) => (
            <article className={`concept-stage stage-${item.step}`} key={item.step}>
              <div className="concept-stage-title">
                <span>{item.step}</span>
                <div><h3>{item.label}</h3><p>{item.detail}</p></div>
              </div>

              <div className="concept-device">
                <div className="concept-device-head"><Icon name={item.icon} size={16}/><strong>RAIZ DIGITAL</strong></div>

                {item.step === 1 && (
                  <div className="concept-screen intake-screen">
                    <h4>Enviar dados</h4>
                    <p>Envie os dados da forma mais fácil. A RAIZ cuida do restante.</p>
                    <div className="concept-source active"><Icon name="flask" size={14}/><span>Arquivo do laboratório<small>CSV / XLSX disponível</small></span></div>
                    <div className="concept-source"><Icon name="file" size={14}/><span>PDF e fotos<small>integração em evolução</small></span></div>
                    <div className="concept-source"><Icon name="map" size={14}/><span>GPS e shapefile<small>fluxo espacial disponível à parte</small></span></div>
                    <Link href={item.href} className="concept-screen-button">Enviar dados</Link>
                  </div>
                )}

                {item.step === 2 && (
                  <div className="concept-screen process-screen">
                    <h4>Processando dados</h4>
                    <p>A RAIZ organiza e valida automaticamente.</p>
                    <ul>
                      <li><Icon name="check" size={13}/>Leitura do arquivo</li>
                      <li><Icon name="check" size={13}/>Normalização dos resultados</li>
                      <li><Icon name="check" size={13}/>Validação de consistência</li>
                      <li><Icon name="check" size={13}/>Vínculo de contexto quando necessário</li>
                      <li><Icon name="check" size={13}/>Preparação para o motor técnico</li>
                    </ul>
                    <div className="concept-processing"><i/><span>Processamento rastreável</span></div>
                  </div>
                )}

                {item.step === 3 && (
                  <div className="concept-screen analysis-screen">
                    <div className="concept-screen-row"><h4>Análise do solo</h4><span>{snapshot.activeAnalyses} ativa(s)</span></div>
                    <div className="concept-analysis-visual"><Icon name="map" size={31}/><span>Mapa e evidências quando disponíveis</span></div>
                    <h5>Principais insights</h5>
                    <ul>
                      <li><i className="danger"/>Parâmetros fora da faixa ficam destacados</li>
                      <li><i className="warning"/>Evidência insuficiente vira pendência</li>
                      <li><i className="success"/>O motor não inventa valores</li>
                    </ul>
                    <Link href={item.href} className="concept-text-link">Abrir análises <Icon name="arrow" size={12}/></Link>
                  </div>
                )}

                {item.step === 4 && (
                  <div className="concept-screen recommendation-screen">
                    <h4>Recomendação</h4>
                    <p>Plano preliminar preparado pela RAIZ.</p>
                    <div className="concept-recommendation"><Icon name="leaf" size={18}/><span><strong>Dose e fonte</strong><small>somente quando o motor determinístico liberar</small></span></div>
                    <div className="concept-recommendation"><Icon name="layers" size={18}/><span><strong>Manejo e aplicação</strong><small>com rastreabilidade da regra utilizada</small></span></div>
                    <div className="concept-result-box"><Icon name="check" size={13}/><span>Sem recomendação oficial antes da revisão profissional.</span></div>
                  </div>
                )}

                {item.step === 5 && (
                  <div className="concept-screen review-screen">
                    <div className="concept-screen-row"><h4>Revisão técnica</h4><span>{reviewCount} pendente(s)</span></div>
                    <p>A recomendação já chega preparada para conferência.</p>
                    <dl>
                      <div><dt>Fontes dos dados</dt><dd>visíveis</dd></div>
                      <div><dt>Fórmulas e regras</dt><dd>rastreáveis</dd></div>
                      <div><dt>Limitações</dt><dd>explícitas</dd></div>
                      <div><dt>Publicação</dt><dd>somente após aprovação</dd></div>
                    </dl>
                    {REVIEW_ROLES.has(session.role) ? <Link href={item.href} className="concept-screen-button">Abrir revisões</Link> : <span className="concept-disabled-button">Perfil técnico necessário</span>}
                  </div>
                )}

                {item.step === 6 && (
                  <div className="concept-screen delivery-screen">
                    <div className="concept-delivery-ready"><Icon name="check" size={20}/><span><strong>Relatório pronto</strong><small>quando a decisão estiver aprovada e publicada</small></span></div>
                    <div className="concept-report-preview">
                      <Icon name="file" size={34}/>
                      <strong>Recomendação Agronômica</strong>
                      <small>dados, decisão, assinatura e auditoria congelados na versão publicada</small>
                    </div>
                    <Link href={item.href} className="concept-screen-button">Ver entregas</Link>
                  </div>
                )}
              </div>

              <Link href={item.href} className="concept-stage-link">Abrir etapa <Icon name="arrow" size={12}/></Link>
            </article>
          ))}
        </section>

        <section className="concept-benefits" aria-label="Benefícios do fluxo">
          <div><Icon name="users" size={21}/><strong>Qualquer pessoa envia</strong><span>Produtor, consultor, técnico, laboratório ou equipe.</span></div>
          <div><Icon name="layers" size={21}/><strong>Dados organizados</strong><span>Tudo estruturado e pronto para análise, sem retrabalho manual.</span></div>
          <div><Icon name="flask" size={21}/><strong>Diagnóstico completo</strong><span>Interpretação de dados, contexto e evidências disponíveis.</span></div>
          <div><Icon name="leaf" size={21}/><strong>Recomendação pronta</strong><span>Dose, fonte, manejo e aplicação quando houver suporte técnico.</span></div>
          <div><Icon name="shield" size={21}/><strong>O agrônomo só confere</strong><span>Revisa fontes, cálculos e limitações. Sem refazer do zero.</span></div>
          <div><Icon name="file" size={21}/><strong>Cliente recebe valor</strong><span>Relatório profissional, claro e pronto para uso no campo.</span></div>
        </section>

        <section className="concept-live-grid">
          <div className="card concept-live-card">
            <div className="concept-section-head"><div><span>OPERAÇÃO REAL</span><h3>Continue de onde parou</h3></div><Link href="/analises">Ver todas <Icon name="arrow" size={13}/></Link></div>
            {recent.length ? <div className="concept-recent-list">{recent.map((analysis) => {
              const meta = analysisDisplayStatus(analysis);
              return <Link href={`/analises/${analysis.id}`} key={analysis.id} className="concept-recent-row">
                <span className="concept-recent-icon"><Icon name={meta.tone === "success" ? "check" : meta.tone === "danger" ? "warning" : "flask"} size={15}/></span>
                <div><strong>{analysis.clientName}</strong><small>{analysis.fieldName} · {analysis.code}</small></div>
                <StatusBadge tone={meta.tone}>{meta.label}</StatusBadge>
                <time>{formatRelativeOrDate(analysis.updatedAt)}</time>
                <Icon name="chevron" size={14}/>
              </Link>;
            })}</div> : <div className="concept-empty"><Icon name="upload" size={24}/><strong>Nenhum dado enviado ainda.</strong><Link href="/analises/nova?etapa=laudo&nivel=interpretacao-rapida">Enviar primeiro arquivo</Link></div>}
          </div>

          <aside className="card concept-today-card">
            <span>VISÃO DE HOJE</span>
            <div><strong>{snapshot.activeAnalyses}</strong><small>análises em andamento</small></div>
            <div><strong>{reviewCount}</strong><small>aguardando revisão técnica</small></div>
            <div><strong>{snapshot.collectedPoints}</strong><small>pontos coletados</small></div>
            <div><strong>{criticalAlerts}</strong><small>alertas críticos</small></div>
          </aside>
        </section>
      </div>
    </>
  );
}

function DemoInicio() {
  return (
    <>
      <Topbar eyebrow="RAIZ DIGITAL" title="Fluxo inteligente" />
      <div className="content-wrap ux2-home concept-home">
        <header className="concept-heading">
          <div><span className="concept-kicker">TECNOLOGIA QUE TRANSFORMA DADOS EM PRODUTIVIDADE</span><h2>RAIZ Digital — Fluxo Inteligente</h2><p>Do envio dos dados à recomendação assinada.</p></div>
          <Link className="button primary" href="/analises/nova?etapa=laudo&nivel=interpretacao-rapida"><Icon name="upload" size={17}/> Enviar dados</Link>
        </header>
        <section className="concept-flow concept-flow-demo">{FLOW.map((item)=><article className="concept-stage" key={item.step}><div className="concept-stage-title"><span>{item.step}</span><div><h3>{item.label}</h3><p>{item.detail}</p></div></div><div className="concept-device"><div className="concept-device-head"><Icon name={item.icon} size={16}/><strong>RAIZ DIGITAL</strong></div><div className="concept-screen demo-screen"><Icon name={item.icon} size={30}/><strong>{item.label}</strong><small>{item.detail}</small></div></div></article>)}</section>
      </div>
    </>
  );
}
