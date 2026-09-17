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
  { step: 1, label: "Receber dados", detail: "Qualquer pessoa envia laudos e arquivos.", icon: "upload" as const },
  { step: 2, label: "Processar", detail: "A RAIZ organiza, valida e vincula o contexto.", icon: "sparkles" as const },
  { step: 3, label: "Analisar", detail: "O motor determinístico interpreta o que é suportado.", icon: "flask" as const },
  { step: 4, label: "Recomendar", detail: "O sistema prepara o plano técnico rastreável.", icon: "leaf" as const },
  { step: 5, label: "Revisar", detail: "O agrônomo confere fontes, cálculos e assina.", icon: "shield" as const },
  { step: 6, label: "Entregar", detail: "O cliente recebe o relatório final aprovado.", icon: "file" as const },
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

  const recent = analyses.slice(0, 5);
  const reviewCount = snapshot.awaitingReview + snapshot.inconsistent;
  const criticalAlerts = alerts.filter((alert) => alert.criticality === "ALTA").length;

  return (
    <>
      <Topbar eyebrow="RAIZ UX 2.0" title={`Olá, ${session.name.trim().split(/\s+/)[0] || "equipe"}.`} />
      <div className="content-wrap ux2-home">
        <section className="ux2-hero">
          <div className="ux2-hero-copy">
            <span className="eyebrow light">FLUXO INTELIGENTE</span>
            <h2>Envie os dados.<br/>A RAIZ prepara o restante.</h2>
            <p>O trabalho começa pela entrada de dados — não por formulários técnicos. A plataforma organiza, analisa e prepara a recomendação para o agrônomo revisar e assinar no final.</p>
            <div className="ux2-hero-actions">
              <Link className="button light ux2-primary-cta" href="/analises/nova?etapa=laudo&nivel=interpretacao-rapida">
                <Icon name="upload" size={17}/> Enviar dados
              </Link>
              {REVIEW_ROLES.has(session.role) && (
                <Link className="text-link light" href="/analises?status=revisao">Abrir revisões <Icon name="arrow" size={15}/></Link>
              )}
            </div>
          </div>
          <div className="ux2-hero-status">
            <span><i/>OPERAÇÃO ATIVA</span>
            <strong>{reviewCount}</strong>
            <small>{reviewCount === 1 ? "item aguardando decisão técnica" : "itens aguardando decisão técnica"}</small>
            <dl>
              <div><dt>Análises ativas</dt><dd>{snapshot.activeAnalyses}</dd></div>
              <div><dt>Alertas críticos</dt><dd>{criticalAlerts}</dd></div>
              <div><dt>Clientes</dt><dd>{snapshot.clients}</dd></div>
            </dl>
          </div>
        </section>

        <section className="ux2-flow-card" aria-label="Fluxo inteligente da RAIZ">
          <div className="ux2-section-head">
            <div><span className="eyebrow">COMO FUNCIONA</span><h2>Do arquivo recebido à entrega assinada</h2></div>
            <small>O agrônomo entra no fim do fluxo, onde agrega responsabilidade técnica — não trabalho repetitivo.</small>
          </div>
          <ol className="ux2-flow-track">
            {FLOW.map((item, index) => (
              <li key={item.step} className={index === 0 ? "current" : ""}>
                <div className="ux2-flow-icon"><Icon name={item.icon} size={20}/><b>{item.step}</b></div>
                <div><strong>{item.label}</strong><small>{item.detail}</small></div>
                {index < FLOW.length - 1 && <span className="ux2-flow-arrow"><Icon name="arrow" size={14}/></span>}
              </li>
            ))}
          </ol>
        </section>

        <section className="ux2-metric-row">
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

        <div className="ux2-home-grid">
          <section className="card ux2-recent-card">
            <div className="card-header">
              <div><span className="eyebrow">FLUXO EM ANDAMENTO</span><h2>Últimas operações</h2></div>
              <Link href="/analises">Ver todas <Icon name="arrow" size={14}/></Link>
            </div>
            {recent.length ? (
              <div className="ux2-operation-list">
                {recent.map((analysis) => {
                  const meta = analysisDisplayStatus(analysis);
                  return (
                    <Link href={`/analises/${analysis.id}`} key={analysis.id} className="ux2-operation-row">
                      <span className="ux2-operation-state"><Icon name={meta.tone === "success" ? "check" : meta.tone === "danger" ? "warning" : "flask"} size={17}/></span>
                      <div><strong>{analysis.clientName}</strong><small>{analysis.fieldName} · {analysis.code}</small></div>
                      <StatusBadge tone={meta.tone}>{meta.label}</StatusBadge>
                      <time>{formatRelativeOrDate(analysis.updatedAt)}</time>
                      <Icon name="chevron" size={16}/>
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

          <aside className="card ux2-review-card">
            <span className="eyebrow">PAPEL DO AGRÔNOMO</span>
            <h2>Revisar, entender e assinar.</h2>
            <p>A revisão final deve mostrar de forma objetiva o que foi calculado, de onde veio cada regra e quais limitações permaneceram.</p>
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
      </div>
    </>
  );
}

function DemoInicio() {
  return (
    <>
      <Topbar eyebrow="RAIZ UX 2.0 · demonstração" title="Fluxo inteligente" />
      <div className="content-wrap ux2-home">
        <section className="ux2-hero">
          <div className="ux2-hero-copy">
            <span className="eyebrow light">NOVO PONTO DE ENTRADA</span>
            <h2>Primeiro os dados.<br/>Depois a RAIZ trabalha.</h2>
            <p>Esta experiência reorganiza a plataforma para começar no envio do material e terminar na revisão técnica assinada.</p>
            <div className="ux2-hero-actions"><Link className="button light" href="/analises/nova?etapa=laudo&nivel=interpretacao-rapida"><Icon name="upload" size={17}/> Enviar dados</Link></div>
          </div>
          <div className="ux2-hero-status"><span><i/>DEMONSTRAÇÃO</span><strong>6</strong><small>etapas do fluxo inteligente</small></div>
        </section>
        <section className="ux2-flow-card"><ol className="ux2-flow-track">{FLOW.map((item, index)=><li key={item.step}><div className="ux2-flow-icon"><Icon name={item.icon} size={20}/><b>{item.step}</b></div><div><strong>{item.label}</strong><small>{item.detail}</small></div>{index < FLOW.length - 1 && <span className="ux2-flow-arrow"><Icon name="arrow" size={14}/></span>}</li>)}</ol></section>
      </div>
    </>
  );
}
