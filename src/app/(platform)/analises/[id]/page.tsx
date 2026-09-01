import Link from "next/link";
import { notFound } from "next/navigation";
import { Topbar } from "@/components/topbar";
import { Icon } from "@/components/icon";
import { StatusBadge } from "@/components/ui";
import { analyses } from "@/lib/demo-data";
import { isDatabaseMode } from "@/lib/data-mode";
import { requirePlatformSession } from "@/lib/auth/session";
import { getAnalysisById } from "@/lib/repositories/analyses";
import { analysisStatusMeta, formatRelativeOrDate } from "@/domain/analysis-ui";

export default async function AnalysisDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (isDatabaseMode()) {
    const session = await requirePlatformSession();
    const analysis = await getAnalysisById(session.tenantId, id, session.userId);
    if (!analysis) notFound();
    return <RealAnalysisDetail analysis={analysis as any}/>;
  }
  const analysis = analyses.find((item)=>item.id === id);
  if (!analysis) notFound();
  return <DemoAnalysisDetail analysis={analysis}/>;
}

function RealAnalysisDetail({ analysis }: { analysis: any }) {
  const meta = analysisStatusMeta(analysis.status);
  const imported = Number(analysis.importCount) > 0;
  const interpreted = Number(analysis.interpretationCount) > 0;
  return <><Topbar eyebrow="Análises" title={analysis.code}><Link href="/analises/nova?etapa=laudo" className="button secondary"><Icon name="upload" size={16}/>Importar laudo</Link></Topbar><div className="content-wrap detail-page">
    <div className="detail-header"><div><div className="breadcrumb"><Link href="/analises">Análises</Link><Icon name="chevron" size={13}/><span>{analysis.code}</span></div><h2>{analysis.clientName}</h2><p>{analysis.propertyName} · {analysis.fieldName} · {Number(analysis.areaHa).toLocaleString("pt-BR",{maximumFractionDigits:2})} ha · Safra {analysis.seasonLabel}</p></div><StatusBadge tone={meta.tone}>{meta.label}</StatusBadge></div>
    <ol className="workflow-bar"><li className={imported ? "done" : "active"}><span>{imported ? <Icon name="check" size={13}/> : "1"}</span><div><strong>Entrada laboratorial</strong><small>{imported ? `${analysis.importCount} importação(ões) registrada(s)` : "Aguardando laudo"}</small></div></li><li className={imported && analysis.status !== "INCONSISTENT" ? "done" : analysis.status === "INCONSISTENT" ? "active" : ""}><span>{imported && analysis.status !== "INCONSISTENT" ? <Icon name="check" size={13}/> : "2"}</span><div><strong>Validação</strong><small>{analysis.status === "INCONSISTENT" ? "Existem bloqueios técnicos" : imported ? "Entrada sem bloqueio registrado" : "Pendente"}</small></div></li><li className={interpreted ? "done" : ""}><span>{interpreted ? <Icon name="check" size={13}/> : "3"}</span><div><strong>Interpretação</strong><small>{interpreted ? "Cálculo registrado" : "Motor ainda não executado"}</small></div></li><li className={analysis.status === "AWAITING_REVIEW" ? "active" : ""}><span>4</span><div><strong>Revisão técnica</strong><small>{analysis.status === "AWAITING_REVIEW" ? "Aguardando profissional" : "Pendente"}</small></div></li><li className={analysis.status === "REPORT_SENT" ? "done" : ""}><span>5</span><div><strong>Publicação</strong><small>{analysis.status === "REPORT_SENT" ? "Relatório enviado" : "Pendente"}</small></div></li></ol>
    <div className="detail-columns">
      <div><section className="card interpretation-card"><div className="card-header"><div><span className="eyebrow">ESTADO REAL</span><h2>Núcleo técnico da análise</h2></div>{analysis.confidenceScore != null && <div className="confidence"><b>{Math.round(Number(analysis.confidenceScore))}</b><span>Confiabilidade<br/><strong>{analysis.confidenceLevel ?? "—"}</strong></span></div>}</div><div className="interpretation-body real-analysis-body">
        {interpreted ? <div className="import-message"><Icon name="check"/><div><strong>Interpretação registrada</strong><small>Há uma ou mais revisões do motor associadas a esta análise. A tela de revisão agronômica executável será conectada na próxima fase.</small></div></div> : <div className="pending-engine"><Icon name="shield" size={24}/><div><span className="eyebrow">SEM RECOMENDAÇÃO INVENTADA</span><h3>O motor agronômico ainda não foi executado.</h3><p>A RAIZ não exibirá parecer, dose ou recomendação fictícia. Primeiro o laudo precisa estar consistente; depois um rule set homologado será aplicado e revisado por um agrônomo.</p></div></div>}
        <div className="review-grid"><div className="review-summary"><span>Cultura</span><strong>{analysis.currentCrop || "Não informada"}</strong><small>Próxima: {analysis.nextCrop || "não informada"}</small></div><div className="review-summary"><span>Meta produtiva</span><strong>{analysis.yieldGoal ?? "—"} {analysis.yieldGoalUnit ?? ""}</strong><small>Contexto da safra</small></div><div className="review-summary"><span>Coleta</span><strong>{analysis.collectionCode || "Sem ordem vinculada"}</strong><small>Rastreabilidade de campo</small></div><div className="review-summary"><span>Laboratório</span><strong>{analysis.laboratoryName || "Não identificado"}</strong><small>{analysis.importCount} importação(ões)</small></div></div>
      </div></section></div>
      <aside className="review-sidebar"><section className="card trace-card"><div className="card-header"><div><span className="eyebrow">RASTREABILIDADE</span><h2>Registro atual</h2></div></div><dl className="detail-list"><div><dt>ID</dt><dd>{analysis.id.slice(0,8)}…</dd></div><div><dt>Fonte</dt><dd>{analysis.sourceType || "Não definida"}</dd></div><div><dt>Importações</dt><dd>{analysis.importCount}</dd></div><div><dt>Amostras normalizadas</dt><dd>{analysis.labSampleCount}</dd></div><div><dt>Atualização</dt><dd>{formatRelativeOrDate(analysis.updatedAt)}</dd></div></dl></section><section className="card"><div className="review-actions"><small className="audit-hint"><Icon name="history" size={12}/>Mudanças de cadastro e importações são registradas na trilha de auditoria.</small></div></section></aside>
    </div>
  </div></>;
}

function DemoAnalysisDetail({ analysis }: { analysis: (typeof analyses)[number] }) {
  return <><Topbar eyebrow="Análises · demonstração" title={analysis.id}><button className="button secondary"><Icon name="file" size={16}/>Prévia do relatório</button></Topbar><div className="content-wrap detail-page"><div className="demo-banner"><Icon name="warning" size={14}/><span>Exemplo visual. Diagnóstico, regras, profissional e recomendações desta tela não representam dados reais.</span></div>
    <div className="detail-header"><div><div className="breadcrumb"><Link href="/analises">Análises</Link><Icon name="chevron" size={13}/><span>{analysis.id}</span></div><h2>{analysis.client}</h2><p>{analysis.area} · Safra 2026/27 · Soja → Milho</p></div><StatusBadge tone={analysis.statusTone}>{analysis.status}</StatusBadge></div>
    <section className="card interpretation-card"><div className="card-header"><div><span className="eyebrow">DEMONSTRAÇÃO</span><h2>Como será a revisão agronômica</h2></div></div><div className="interpretation-body"><div className="pending-engine"><Icon name="sparkles" size={24}/><div><h3>Interface de parecer e aprovação</h3><p>Esta visualização serve apenas para validar UX. A versão conectada ao banco não mostra recomendação até existir rule set homologado e interpretação registrada.</p></div></div></div></section>
  </div></>;
}
