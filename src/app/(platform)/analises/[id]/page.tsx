import Link from "next/link";
import { notFound } from "next/navigation";
import { Topbar } from "@/components/topbar";
import { Icon } from "@/components/icon";
import { StatusBadge, ClassificationBadge } from "@/components/ui";
import { AgronomicIntelligencePanel } from "@/components/agronomic-intelligence-panel";
import { LabImportConfidenceExplainer } from "@/components/lab-import-confidence-explainer";
import { TechnicalConfidenceExplainer } from "@/components/technical-confidence-explainer";
import { AssistantEntryButton } from "@/components/assistant-entry-button";
import { DecisionReadinessCard } from "@/components/decision-readiness-card";
import { InputApplicationsManager } from "@/components/input-applications-manager";
import { InputComparisonPanel } from "@/components/input-comparison-panel";
import { CommercialSimulationPanel } from "@/components/commercial-simulation-panel";
import { SourceVerificationPanel } from "@/components/source-verification-panel";
import { NitrogenRecommendationPanel } from "@/components/nitrogen-recommendation-panel";
import { Ux2TechnicalReview } from "@/components/ux2-technical-review";
import { analyses, demoInterpretation, demoNarrative } from "@/lib/demo-data";
import { isDatabaseMode } from "@/lib/data-mode";
import { requirePlatformSession } from "@/lib/auth/session";
import { getAnalysisById } from "@/lib/repositories/analyses";
import { getLatestAnalysisImportConfidenceDetails } from "@/lib/repositories/imports";
import { getDecisionDeliveryStatuses, type DecisionDeliveryStatus } from "@/lib/repositories/decision-delivery-status";
import { analysisDisplayStatus, formatRelativeOrDate } from "@/domain/analysis-ui";

const RUN_ROLES = new Set(["SUPER_ADMIN", "TENANT_ADMIN", "AGRONOMIST", "FIELD_TECH"]);
const REVIEW_ROLES = new Set(["SUPER_ADMIN", "TENANT_ADMIN", "AGRONOMIST"]);

const DEMO_LAB_CONFIDENCE = {
  score: 88,
  level: "ADEQUATE" as const,
  dimensions: [
    { key: "completeness", label: "Integridade laboratorial", score: 100, weight: 35 },
    { key: "laboratory", label: "Coerência laboratorial", score: 80, weight: 35 },
    { key: "ruleCompatibility", label: "Compatibilidade de regra", score: 83, weight: 30 },
  ],
};
const DEMO_LAB_ISSUES = [{
  severity: "WARNING" as const,
  code: "METHOD_INFERRED",
  message: "Exemplo visual: um método analítico foi preenchido a partir do contexto demonstrativo.",
  line: 4,
  sampleCode: "P1",
  parameterCode: "P",
}];
const DEMO_INTERPRETATION_CONFIDENCE = {
  score: 88,
  level: "ADEQUATE",
  dimensions: [
    { key: "completeness", label: "Completude", score: 100, weight: 0.5 },
    { key: "context", label: "Contexto agronômico", score: 80, weight: 0.3 },
    { key: "ruleCompatibility", label: "Compatibilidade de regra", score: 70, weight: 0.2 },
  ],
};
const DEMO_CONFIDENCE_INTERPRETATION = [
  { parameterCode: "P", classificationRole: "TARGET" as const, interpretable: true },
  { parameterCode: "K", classificationRole: "TARGET" as const, interpretable: true },
  { parameterCode: "CLAY", classificationRole: "AUXILIARY" as const, interpretable: false, code: "NOT_CLASSIFICATION_TARGET", reason: "Dado auxiliar demonstrativo." },
];

export default async function AnalysisDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (isDatabaseMode()) {
    const session = await requirePlatformSession();
    const [analysis, deliveryRows, labConfidence] = await Promise.all([
      getAnalysisById(session.tenantId, id, session.userId),
      getDecisionDeliveryStatuses(session.tenantId, [id], session.userId),
      getLatestAnalysisImportConfidenceDetails(session.tenantId, id, session.userId),
    ]);
    if (!analysis) notFound();
    return <RealAnalysisDetail analysis={analysis as any} delivery={deliveryRows[0] ?? null} labConfidence={labConfidence} canRun={RUN_ROLES.has(session.role)} canReview={REVIEW_ROLES.has(session.role)}/>;
  }
  const analysis = analyses.find((item)=>item.id === id);
  if (!analysis) notFound();
  return <DemoAnalysisDetail analysis={analysis}/>;
}

function RealAnalysisDetail({ analysis, delivery, labConfidence, canRun, canReview }: { analysis: any; delivery: DecisionDeliveryStatus | null; labConfidence: Awaited<ReturnType<typeof getLatestAnalysisImportConfidenceDetails>>; canRun: boolean; canReview: boolean }) {
  const persistedMeta = analysisDisplayStatus(analysis);
  const meta = analysis.latestInterpretationStatus && delivery?.interpretationCurrent === false
    ? {
        label: "Precisa atualizar",
        tone: "waiting" as const,
        progress: persistedMeta.progress,
        detail: delivery.interpretationStaleReason ?? "A interpretação anterior permanece no histórico, mas não representa a evidência agronômica corrente.",
      }
    : persistedMeta;
  const imported = Number(analysis.importCount) > 0 || Number(analysis.labSampleCount) > 0;
  return <><Topbar eyebrow="Fluxo inteligente" title={analysis.code}><AssistantEntryButton label="Pergunte sobre esta análise"/>{canRun && <Link href={`/analises/${analysis.id}/importar`} className="button secondary"><Icon name="upload" size={16}/>Adicionar dados</Link>}</Topbar><div className="content-wrap detail-page ux2-analysis-detail">
    <div className="detail-header"><div><div className="breadcrumb"><Link href="/inicio">Início</Link><Icon name="chevron" size={13}/><Link href="/analises">Operações</Link><Icon name="chevron" size={13}/><span>{analysis.code}</span></div><h2>{analysis.clientName}</h2><p>{analysis.propertyName} · {analysis.fieldName} · {Number(analysis.areaHa).toLocaleString("pt-BR",{maximumFractionDigits:2})} ha · Safra {analysis.seasonLabel}{analysis.laboratoryName ? ` · ${analysis.laboratoryName}` : ""}</p></div><StatusBadge tone={meta.tone}>{meta.label}</StatusBadge></div>
    {meta.detail && <div className="agro-message danger" style={{ margin: "0 0 16px" }}><Icon name="warning" size={15}/><span>{meta.detail}</span></div>}

    {imported ? <Ux2TechnicalReview analysisId={analysis.id} canReview={canReview}/> : (
      <section className="card ux2-review-empty"><Icon name="upload" size={24}/><div><span className="eyebrow">AGUARDANDO DADOS</span><h2>Envie o laudo para iniciar o fluxo automático.</h2><p>A RAIZ só gera diagnóstico e recomendação quando existe evidência persistida e rastreável.</p></div></section>
    )}

    <details className="ux2-technical-details">
      <summary><Icon name="layers" size={16}/><strong>Ver detalhes técnicos completos</strong><span>mapas, laudo, motor, simulações e rastreabilidade</span></summary>
      <div className="ux2-technical-details-body">
        <DecisionReadinessCard analysisId={analysis.id} analysisStatus={analysis.status} imported={imported} interpretationStatus={analysis.latestInterpretationStatus ?? null} delivery={delivery}/>
        {imported && <SourceVerificationPanel analysisId={analysis.id}/>} 
        {imported && <section className="card interpretation-card"><div className="card-header"><div><span className="eyebrow">NUTRIÇÃO · CONTEXTO</span><h2>Nitrogênio determinístico</h2></div></div><div className="interpretation-body"><NitrogenRecommendationPanel analysisId={analysis.id} canRun={canRun}/></div></section>}
        <section id="nucleo-tecnico" className="card interpretation-card"><div className="card-header"><div><span className="eyebrow">INTELIGÊNCIA AGRONÔMICA</span><h2>Núcleo técnico da análise</h2></div></div><div className="interpretation-body real-analysis-body">
          {labConfidence && <LabImportConfidenceExplainer confidence={labConfidence.confidence} issues={labConfidence.issues} reconstructionMatchesStoredScore={labConfidence.reconstructionMatchesStoredScore} fileName={labConfidence.fileName}/>}\n          <div className="review-grid"><div className="review-summary"><span>Cultura</span><strong>{analysis.currentCrop || "Não informada"}</strong><small>Próxima: {analysis.nextCrop || "não informada"}</small></div><div className="review-summary"><span>Meta produtiva</span><strong>{analysis.yieldGoal ?? "—"} {analysis.yieldGoalUnit ?? ""}</strong><small>Contexto da safra</small></div><div className="review-summary"><span>Coleta</span><strong>{analysis.collectionCode || "Sem ordem vinculada"}</strong><small>Rastreabilidade de campo</small></div><div className="review-summary"><span>Laboratório</span><strong>{analysis.laboratoryName || "Não identificado"}</strong><small>{analysis.importCount} importação(ões)</small></div></div>
          <AgronomicIntelligencePanel analysisId={analysis.id} fieldId={analysis.fieldId ?? null} collectionOrderId={analysis.collectionOrderId ?? null} canRun={canRun} canReview={canReview}/>
        </div></section>
        <div className="detail-columns detail-columns-secondary"><div><InputComparisonPanel analysisId={analysis.id}/><CommercialSimulationPanel analysisId={analysis.id}/><InputApplicationsManager analysisId={analysis.id} canEdit={canRun}/></div><section className="card trace-card"><div className="card-header"><div><span className="eyebrow">RASTREABILIDADE</span><h2>Registro atual</h2></div></div><dl className="detail-list"><div><dt>ID</dt><dd>{analysis.id.slice(0,8)}…</dd></div><div><dt>Fonte</dt><dd>{analysis.sourceType || "Não definida"}</dd></div><div><dt>Importações</dt><dd>{analysis.importCount}</dd></div><div><dt>Amostras normalizadas</dt><dd>{analysis.labSampleCount}</dd></div><div><dt>Atualização</dt><dd>{formatRelativeOrDate(analysis.updatedAt)}</dd></div></dl><div className="review-actions"><small className="audit-hint"><Icon name="history" size={12}/>Mudanças de cadastro e importações são registradas na trilha de auditoria.</small></div></section></div>
      </div>
    </details>
  </div></>;
}

function DemoAnalysisDetail({ analysis }: { analysis: (typeof analyses)[number] }) {
  const showFullExample = analysis.id === "AN-2026-0148";
  return <><Topbar eyebrow="Análises · demonstração" title={analysis.id}><button className="button secondary"><Icon name="file" size={16}/>Prévia do relatório</button></Topbar><div className="content-wrap detail-page"><div className="demo-banner"><Icon name="warning" size={14}/><span>Exemplo visual. Diagnóstico, regras, profissional e recomendações desta tela não representam dados reais.</span></div>
    <div className="detail-header"><div><div className="breadcrumb"><Link href="/analises">Análises</Link><Icon name="chevron" size={13}/><span>{analysis.id}</span></div><h2>{analysis.client}</h2><p>{analysis.area} · Safra 2026/27 · Soja → Milho</p></div><StatusBadge tone={analysis.statusTone}>{analysis.status}</StatusBadge></div>
    <div className="detail-columns"><div><section className="card interpretation-card"><div className="card-header"><div><span className="eyebrow">INTELIGÊNCIA AGRONÔMICA · EXEMPLO</span><h2>Núcleo técnico da análise</h2></div>{showFullExample && <div className="confidence"><b>{demoInterpretation.confidence.score}</b><span>Confiabilidade<br/><strong>{demoInterpretation.confidence.level}</strong></span></div>}</div><div className="interpretation-body">
        {showFullExample ? <div className="agro-panel">
        <LabImportConfidenceExplainer confidence={DEMO_LAB_CONFIDENCE} issues={DEMO_LAB_ISSUES} reconstructionMatchesStoredScore={true} fileName="laudo-exemplo-demonstrativo.csv"/>
        <TechnicalConfidenceExplainer confidence={DEMO_INTERPRETATION_CONFIDENCE} interpretation={DEMO_CONFIDENCE_INTERPRETATION}/><div className="agro-summary-row"><div className="agro-stat"><span>Status</span><strong>Aprovada</strong></div><div className="agro-stat"><span>Confiabilidade</span><strong>{demoInterpretation.confidence.score}/100</strong><small>{demoInterpretation.confidence.level}</small></div><div className="agro-stat"><span>Base técnica</span><strong>{demoInterpretation.cropProfileCode}</strong><small>v{demoInterpretation.cropProfileVersion}</small></div><div className="agro-stat"><span>Revisão</span><strong>#{demoInterpretation.revision}</strong><small>{new Date(demoInterpretation.createdAt).toLocaleString("pt-BR")}</small></div></div><div className="agro-table-wrap"><table className="agro-table"><thead><tr><th>Ponto</th><th>Parâmetro</th><th>Resultado</th><th>Classificação</th></tr></thead><tbody>{demoInterpretation.rows.map((row, index) => <tr key={index}><td>{row.sampleCode}</td><td>{row.parameterCode}</td><td>{row.value} {row.unit}</td><td><ClassificationBadge label={row.classification}/></td></tr>)}</tbody></table></div><section className="narrative-panel"><div className="narrative-panel-head"><div><span className="eyebrow">SÍNTESE ASSISTIDA POR IA · EXEMPLO</span><h3>Explicação em linguagem simples</h3></div><StatusBadge tone="success">Aprovada</StatusBadge></div><div className="narrative-provider-note"><Icon name="shield" size={13}/>Gerado por motor de texto local (sem custo) — reformata os fatos já calculados, não é um modelo de linguagem real ainda.</div><p className="narrative-summary">{demoNarrative.summary}</p><div className="narrative-block"><h4>Observações</h4><ul>{demoNarrative.observations.map((item, i) => <li key={i}>{item}</li>)}</ul></div><div className="narrative-block attention"><h4><Icon name="warning" size={12}/> Pontos de atenção</h4><ul>{demoNarrative.attentionPoints.map((item, i) => <li key={i}>{item}</li>)}</ul></div><div className="narrative-block"><h4>Tendências</h4><ul>{demoNarrative.trends.map((item, i) => <li key={i}>{item}</li>)}</ul></div><div className="narrative-block muted"><h4>Fontes técnicas</h4><ul>{demoNarrative.technicalReferences.map((item, i) => <li key={i}>{item}</li>)}</ul></div></section></div> : <div className="pending-engine"><Icon name="sparkles" size={24}/><div><h3>Interface de parecer e aprovação</h3><p>Esta análise ({analysis.status.toLowerCase()}) ainda não chegou nessa etapa nesta demonstração. Veja <Link href="/analises/AN-2026-0148">AN-2026-0148 · Fazenda Horizonte</Link> para o exemplo completo, do laudo à síntese aprovada.</p></div></div>}
      </div></section></div><aside className="review-sidebar"><section className="card trace-card"><div className="card-header"><div><span className="eyebrow">RASTREABILIDADE</span><h2>Registro de exemplo</h2></div></div><dl className="detail-list"><div><dt>ID</dt><dd>{analysis.id}</dd></div><div><dt>Origem do laudo</dt><dd>Importação CSV (exemplo)</dd></div><div><dt>Amostras normalizadas</dt><dd>6</dd></div></dl></section></aside></div>
  </div></>;
}
