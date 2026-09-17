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
  { step: 1, label: "Receber", detail: "Laudos e arquivos entram sem exigir cadastro técnico prévio.", icon: "upload" as const },
  { step: 2, label: "Vincular", detail: "A RAIZ conecta cliente, área, safra e contexto da análise.", icon: "layers" as const },
  { step: 3, label: "Processar", detail: "Os dados são normalizados, validados e preparados com rastreabilidade.", icon: "sparkles" as const },
  { step: 4, label: "Analisar", detail: "O motor determinístico interpreta somente o que possui suporte técnico.", icon: "flask" as const },
  { step: 5, label: "Recomendar", detail: "A plataforma prepara a recomendação preliminar e suas evidências.", icon: "leaf" as const },
  { step: 6, label: "Revisar", detail: "O agrônomo confere fontes, cálculos e limitações antes de aprovar.", icon: "shield" as const },
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

  const recent = analyses.slice(0, 3);
  const reviewCount = snapshot.awaitingReview + snapshot.inconsistent;
  const criticalAlerts = alerts.filter((alert) => alert.criticality === "ALTA").length;
  const firstName = session.name.trim().split(/\s+/)[0] || "equipe";

  return (
    <>
      <Topbar eyebrow="RAIZ DIGITAL" title={`Olá, ${firstName}.`}>
        <span className="ux2-system-online"><i aria-hidden="true" />Sistema online</span>
      </Topbar>
      <div className="content-wrap ux2-home">
        <section className="ux2-hero">
          <div className="ux2-hero-visual" aria-hidden="true">
            <span className="ux2-orbit orbit-one" />
            <span className="ux2-orbit orbit-two" />
            <span className="ux2-orbit-core"><Icon name="leaf" size={26}/></span>
          </div>
          <div className="ux2-hero-copy">
            <span className="ux2-hero-kicker"><Icon name="sparkles" size={13}/> RAIZ DIGITAL <i/> INTELIGÊNCIA AGRONÔMICA</span>
            <h2>Da coleta à <span>prescrição.</span></h2>
            <p>Um fluxo visual, inteligente e auditável. Da chegada dos dados à decisão técnica final, com rastreabilidade em cada etapa e revisão profissional no momento certo.</p>
            <div className="ux2-hero-actions">
              <Link className="button ux2-primary-cta" href="/analises/nova?etapa=laudo&nivel=interpretacao-rapida">
                <Icon name="upload" size={17}/> Enviar dados
              </Link>
              {REVIEW_ROLES.has(session.role) && (
                <Link className="ux2-secondary-cta" href="/analises?status=revisao">Abrir revisões <Icon name="arrow" size={15}/></Link>
              )}
            </div>
          </div>
          <div className="ux2-hero-mini-status">
            <span><i aria-hidden="true"/>OPERAÇÃO ATIVA</span>
            <strong>{reviewCount}</strong>
            <small>{reviewCount === 1 ? "decisão técnica aguardando revisão" : "decisões técnicas aguardando revisão"}</small>
          </div>
        </section>

        <section className="ux2-flow-card" aria-label="Fluxo inteligente da RAIZ">
          <div className="ux2-section-head">
            <div><span className="eyebrow">COMO FUNCIONA</span><h2>Um único fluxo. Simples, rastreável e seguro.</h2></div>
            <small>O sistema prepara a análise; o agrônomo concentra sua responsabilidade na revisão final. A publicação oficial continua sendo uma ação explícita após a aprovação.</small>
          </div>
          <ol className="ux2-flow-track">
            {FLOW.map((item) => (
              <li key={item.step}>
                <b className="ux2-flow-number">{String(item.step).padStart(2, "0")}</b>
                <div className="ux2-flow-icon"><Icon name={item.icon} size={22}/></div>
                <div className="ux2-flow-copy"><strong>{item.label}</strong><small>{item.detail}</small></div>
              </li>
            ))}
          </ol>
        </section>

        <section className="ux2-recent-section">
          <div className="ux2-section-head ux2-section-head-compact">
            <div><span className="eyebrow">OPERAÇÕES RECENTES</span><h2>Continue de onde parou</h2></div>
            <Link href="/analises" className="ux2-section-link">Ver todas <Icon name="arrow" size={14}/></Link>
          </div>
          {recent.length ? (
            <div className="ux2-operation-grid">
              {recent.map((analysis) => {
                const meta = analysisDisplayStatus(analysis);
                return (
                  <Link href={`/analises/${analysis.id}`} key={analysis.id} className="ux2-operation-card">
                    <div className="ux2-operation-card-head">
                      <span className="ux2-operation-state"><Icon name={meta.tone === "success" ? "check" : meta.tone === "danger" ? "warning" : "flask"} size={18}/></span>
                      <StatusBadge tone={meta.tone}>{meta.label}</StatusBadge>
                    </div>
                    <strong>{analysis.clientName}</strong>
                    <small>{analysis.fieldName} · {analysis.code}</small>
                    <div className="ux2-operation-card-foot">
                      <time>{formatRelativeOrDate(analysis.updatedAt)}</time>
                      <span>Abrir operação <Icon name="arrow" size={13}/></span>
                    </div>
                  </Link>
                );
              })}
            </div>
          ) : (
            <div className="ux2-empty">
              <Icon name="upload" size={26}/>
              <strong>Nenhum dado enviado ainda</strong>
              <small>Comece enviando um laudo. A RAIZ conduz as próximas etapas.</small>
              <Link className="button primary" href="/analises/nova?etapa=laudo&nivel=interpretacao-rapida">Enviar primeiro arquivo</Link>
            </div>
          )}
        </section>

        <section className="ux2-metric-row" aria-label="Resumo operacional">
          <Link href="/analises" className="ux2-metric-card">
            <span className="ux2-metric-icon"><Icon name="flask" size={21}/></span>
            <div><small>Operações</small><strong>{snapshot.activeAnalyses}</strong><span>análises em andamento</span></div>
            <Icon name="chevron" size={16}/>
          </Link>
          <Link href="/analises?status=revisao" className="ux2-metric-card">
            <span className="ux2-metric-icon"><Icon name="shield" size={21}/></span>
            <div><small>Revisão técnica</small><strong>{reviewCount}</strong><span>aguardando conferência</span></div>
            <Icon name="chevron" size={16}/>
          </Link>
          <Link href="/mapas" className="ux2-metric-card">
            <span className="ux2-metric-icon"><Icon name="map" size={21}/></span>
            <div><small>Campo</small><strong>{snapshot.collectedPoints}</strong><span>pontos coletados</span></div>
            <Icon name="chevron" size={16}/>
          </Link>
          <Link href="/alertas" className="ux2-metric-card">
            <span className="ux2-metric-icon"><Icon name="warning" size={21}/></span>
            <div><small>Prioridades</small><strong>{alerts.length}</strong><span>{criticalAlerts} crítica(s)</span></div>
            <Icon name="chevron" size={16}/>
          </Link>
        </section>

        <aside className="card ux2-review-card">
          <div className="ux2-review-copy">
            <span className="eyebrow">PAPEL DO AGRÔNOMO</span>
            <h2>Revisar, entender e assinar.</h2>
            <p>A revisão final reúne o que foi calculado, de onde veio cada regra e quais limitações permaneceram — sem obrigar o profissional a reconstruir a análise.</p>
          </div>
          <ul>
            <li><Icon name="check" size={15}/><span>Fontes e versão das regras</span></li>
            <li><Icon name="check" size={15}/><span>Fórmulas e cálculos determinísticos</span></li>
            <li><Icon name="check" size={15}/><span>Pendências e evidências insuficientes</span></li>
            <li><Icon name="check" size={15}/><span>Assinatura e trilha de auditoria</span></li>
          </ul>
          {REVIEW_ROLES.has(session.role) ? (
            <Link href="/analises?status=revisao" className="button secondary">Ver fila de revisão <Icon name="arrow" size={15}/></Link>
          ) : (
            <small className="ux2-role-note"><Icon name="shield" size={13}/>A aprovação final é reservada ao perfil técnico autorizado.</small>
          )}
        </aside>
      </div>
    </>
  );
}

function DemoInicio() {
  return (
    <>
      <Topbar eyebrow="RAIZ DIGITAL" title="Experiência UX 2.0" />
      <div className="content-wrap ux2-home">
        <section className="ux2-hero ux2-hero-demo">
          <div className="ux2-hero-visual" aria-hidden="true">
            <span className="ux2-orbit orbit-one" />
            <span className="ux2-orbit orbit-two" />
            <span className="ux2-orbit-core"><Icon name="leaf" size={26}/></span>
          </div>
          <div className="ux2-hero-copy">
            <span className="ux2-hero-kicker"><Icon name="sparkles" size={13}/> RAIZ DIGITAL <i/> INTELIGÊNCIA AGRONÔMICA</span>
            <h2>Da coleta à <span>prescrição.</span></h2>
            <p>Um fluxo visual, inteligente e auditável. A plataforma começa pelos dados, prepara a análise e termina na revisão técnica responsável.</p>
            <div className="ux2-hero-actions"><Link className="button ux2-primary-cta" href="/analises/nova?etapa=laudo&nivel=interpretacao-rapida"><Icon name="upload" size={17}/> Enviar dados</Link></div>
          </div>
        </section>
        <section className="ux2-flow-card">
          <div className="ux2-section-head"><div><span className="eyebrow">COMO FUNCIONA</span><h2>Um único fluxo. Simples, rastreável e seguro.</h2></div></div>
          <ol className="ux2-flow-track">{FLOW.map((item)=><li key={item.step}><b className="ux2-flow-number">{String(item.step).padStart(2,"0")}</b><div className="ux2-flow-icon"><Icon name={item.icon} size={22}/></div><div className="ux2-flow-copy"><strong>{item.label}</strong><small>{item.detail}</small></div></li>)}</ol>
        </section>
      </div>
    </>
  );
}
