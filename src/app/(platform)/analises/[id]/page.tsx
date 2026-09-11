import Link from "next/link";
import { notFound } from "next/navigation";
import { Topbar } from "@/components/topbar";
import { Icon } from "@/components/icon";
import { StatusBadge, ClassificationBadge } from "@/components/ui";
import { AgronomicIntelligencePanel } from "@/components/agronomic-intelligence-panel";
import { AssistantEntryButton } from "@/components/assistant-entry-button";
import { InputApplicationsManager } from "@/components/input-applications-manager";
import { InputComparisonPanel } from "@/components/input-comparison-panel";
import { analyses, demoInterpretation, demoNarrative } from "@/lib/demo-data";
import { isDatabaseMode } from "@/lib/data-mode";
import { requirePlatformSession } from "@/lib/auth/session";
import { getAnalysisById } from "@/lib/repositories/analyses";
import { analysisDisplayStatus, formatRelativeOrDate } from "@/domain/analysis-ui";

const RUN_ROLES = new Set(["SUPER_ADMIN", "TENANT_ADMIN", "AGRONOMIST", "FIELD_TECH"]);
const REVIEW_ROLES = new Set(["SUPER_ADMIN", "TENANT_ADMIN", "AGRONOMIST"]);

export default async function AnalysisDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (isDatabaseMode()) {
    const session = await requirePlatformSession();
    const analysis = await getAnalysisById(session.tenantId, id, session.userId);
    if (!analysis) notFound();
    return <RealAnalysisDetail analysis={analysis as any} canRun={RUN_ROLES.has(session.role)} canReview={REVIEW_ROLES.has(session.role)}/>;
  }
  const analysis = analyses.find((item)=>item.id === id);
  if (!analysis) notFound();
  return <DemoAnalysisDetail analysis={analysis}/>;
}

function RealAnalysisDetail({ analysis, canRun, canReview }: { analysis: any; canRun: boolean; canReview: boolean }) {
  const meta = analysisDisplayStatus(analysis);
  // Verificado ao vivo com dado real (2026-09-10): análises importadas por PDF_OCR gravam lab_samples/
  // lab_results direto, sem nunca passar por analysis_imports -- então `importCount` sozinho fica 0 mesmo
  // com laudo real já processado, e a etapa 1 aparecia "Aguardando laudo" ao lado da etapa 3 já concluída
  // ("Cálculo registrado"), a mesma contradição confirmada na auditoria (item C). `labSampleCount` é a
  // evidência real de que o laudo chegou, não importa por qual caminho de ingestão.
  const imported = Number(analysis.importCount) > 0 || Number(analysis.labSampleCount) > 0;
  const interpreted = Number(analysis.interpretationCount) > 0;
  return <><Topbar eyebrow="Análises" title={analysis.code}><AssistantEntryButton label="Pergunte sobre esta análise"/><Link href="/analises/nova?etapa=laudo" className="button secondary"><Icon name="upload" size={16}/>Importar laudo</Link></Topbar><div className="content-wrap detail-page">
    <div className="detail-header"><div><div className="breadcrumb"><Link href="/analises">Análises</Link><Icon name="chevron" size={13}/><span>{analysis.code}</span></div><h2>{analysis.clientName}</h2><p>{analysis.propertyName} · {analysis.fieldName} · {Number(analysis.areaHa).toLocaleString("pt-BR",{maximumFractionDigits:2})} ha · Safra {analysis.seasonLabel}{analysis.laboratoryName ? ` · Laboratório: ${analysis.laboratoryName}` : ""}</p></div><StatusBadge tone={meta.tone}>{meta.label}</StatusBadge></div>
    {meta.detail && <div className="agro-message danger" style={{ margin: "0 0 16px" }}><Icon name="warning" size={15}/><span>{meta.detail}</span></div>}
    <ol className="workflow-bar"><li className={imported ? "done" : "active"}><span>{imported ? <Icon name="check" size={13}/> : "1"}</span><div><strong>Entrada laboratorial</strong><small>{Number(analysis.importCount) > 0 ? `${analysis.importCount} importação(ões) registrada(s)` : imported ? `${analysis.labSampleCount} amostra(s) processada(s) (leitura por IA)` : "Aguardando laudo"}</small></div></li><li className={imported && analysis.status !== "INCONSISTENT" ? "done" : analysis.status === "INCONSISTENT" ? "active" : ""}><span>{imported && analysis.status !== "INCONSISTENT" ? <Icon name="check" size={13}/> : "2"}</span><div><strong>Validação</strong><small>{analysis.status === "INCONSISTENT" ? "Existem bloqueios técnicos" : imported ? "Entrada sem bloqueio registrado" : "Pendente"}</small></div></li><li className={interpreted ? "done" : ""}><span>{interpreted ? <Icon name="check" size={13}/> : "3"}</span><div><strong>Interpretação</strong><small>{interpreted ? "Cálculo registrado" : "Motor ainda não executado"}</small></div></li><li className={analysis.status === "AWAITING_REVIEW" ? "active" : ""}><span>4</span><div><strong>Revisão técnica</strong><small>{analysis.status === "AWAITING_REVIEW" ? "Aguardando profissional" : "Pendente"}</small></div></li><li className={analysis.status === "REPORT_SENT" ? "done" : ""}><span>5</span><div><strong>Publicação</strong><small>{analysis.status === "REPORT_SENT" ? "Relatório enviado" : "Pendente"}</small></div></li></ol>
    <section className="card interpretation-card"><div className="card-header"><div><span className="eyebrow">INTELIGÊNCIA AGRONÔMICA</span><h2>Núcleo técnico da análise</h2></div>{/* Antes dizia só "Confiabilidade" -- igual ao rótulo usado dentro de AgronomicIntelligencePanel logo
                abaixo, só que pra um número DIFERENTE (qualidade do laudo importado vs. completude da
                interpretação agronômica -- duas fórmulas reais e distintas, achado confirmado na
                auditoria, item D). Agora cada um diz claramente do que se trata. */}
              {analysis.confidenceScore != null && <div className="confidence"><b>{Math.round(Number(analysis.confidenceScore))}</b><span>Confiabilidade do laudo<br/><strong>{analysis.confidenceLevel ?? "—"}</strong></span></div>}</div><div className="interpretation-body real-analysis-body">
      <div className="review-grid"><div className="review-summary"><span>Cultura</span><strong>{analysis.currentCrop || "Não informada"}</strong><small>Próxima: {analysis.nextCrop || "não informada"}</small></div><div className="review-summary"><span>Meta produtiva</span><strong>{analysis.yieldGoal ?? "—"} {analysis.yieldGoalUnit ?? ""}</strong><small>Contexto da safra</small></div><div className="review-summary"><span>Coleta</span><strong>{analysis.collectionCode || "Sem ordem vinculada"}</strong><small>Rastreabilidade de campo</small></div><div className="review-summary"><span>Laboratório</span><strong>{analysis.laboratoryName || "Não identificado"}</strong><small>{analysis.importCount} importação(ões)</small></div></div>
      {/* Cockpit técnico contextual (Fase 3, Bloco B): ocupa a largura toda de propósito -- duas regiões
          internas (evidência + leitura técnica/revisão), não faz sentido espremido numa coluna estreita
          ao lado da rastreabilidade/insumos, que continuam abaixo, fora do cockpit. */}
      <AgronomicIntelligencePanel analysisId={analysis.id} fieldId={analysis.fieldId ?? null} collectionOrderId={analysis.collectionOrderId ?? null} canRun={canRun} canReview={canReview}/>
    </div></section>
    <div className="detail-columns detail-columns-secondary">
      <div><InputComparisonPanel analysisId={analysis.id}/><InputApplicationsManager analysisId={analysis.id} canEdit={canRun}/></div>
      <section className="card trace-card"><div className="card-header"><div><span className="eyebrow">RASTREABILIDADE</span><h2>Registro atual</h2></div></div><dl className="detail-list"><div><dt>ID</dt><dd>{analysis.id.slice(0,8)}…</dd></div><div><dt>Fonte</dt><dd>{analysis.sourceType || "Não definida"}</dd></div><div><dt>Importações</dt><dd>{analysis.importCount}</dd></div><div><dt>Amostras normalizadas</dt><dd>{analysis.labSampleCount}</dd></div><div><dt>Atualização</dt><dd>{formatRelativeOrDate(analysis.updatedAt)}</dd></div></dl><div className="review-actions"><small className="audit-hint"><Icon name="history" size={12}/>Mudanças de cadastro e importações são registradas na trilha de auditoria.</small></div></section>
    </div>
  </div></>;
}

function DemoAnalysisDetail({ analysis }: { analysis: (typeof analyses)[number] }) {
  const showFullExample = analysis.id === "AN-2026-0148";
  return <><Topbar eyebrow="Análises · demonstração" title={analysis.id}><button className="button secondary"><Icon name="file" size={16}/>Prévia do relatório</button></Topbar><div className="content-wrap detail-page"><div className="demo-banner"><Icon name="warning" size={14}/><span>Exemplo visual. Diagnóstico, regras, profissional e recomendações desta tela não representam dados reais.</span></div>
    <div className="detail-header"><div><div className="breadcrumb"><Link href="/analises">Análises</Link><Icon name="chevron" size={13}/><span>{analysis.id}</span></div><h2>{analysis.client}</h2><p>{analysis.area} · Safra 2026/27 · Soja → Milho</p></div><StatusBadge tone={analysis.statusTone}>{analysis.status}</StatusBadge></div>
    <div className="detail-columns">
      <div><section className="card interpretation-card"><div className="card-header"><div><span className="eyebrow">INTELIGÊNCIA AGRONÔMICA · EXEMPLO</span><h2>Núcleo técnico da análise</h2></div>{showFullExample && <div className="confidence"><b>{demoInterpretation.confidence.score}</b><span>Confiabilidade<br/><strong>{demoInterpretation.confidence.level}</strong></span></div>}</div><div className="interpretation-body">
        {showFullExample ? (
          <div className="agro-panel">
            <div className="agro-summary-row">
              <div className="agro-stat"><span>Status</span><strong>Aprovada</strong></div>
              <div className="agro-stat"><span>Confiabilidade</span><strong>{demoInterpretation.confidence.score}/100</strong><small>{demoInterpretation.confidence.level}</small></div>
              <div className="agro-stat"><span>Base técnica</span><strong>{demoInterpretation.cropProfileCode}</strong><small>v{demoInterpretation.cropProfileVersion}</small></div>
              <div className="agro-stat"><span>Revisão</span><strong>#{demoInterpretation.revision}</strong><small>{new Date(demoInterpretation.createdAt).toLocaleString("pt-BR")}</small></div>
            </div>
            <div className="agro-table-wrap"><table className="agro-table">
              <thead><tr><th>Ponto</th><th>Parâmetro</th><th>Resultado</th><th>Classificação</th></tr></thead>
              <tbody>{demoInterpretation.rows.map((row, index) => (
                <tr key={index}><td>{row.sampleCode}</td><td>{row.parameterCode}</td><td>{row.value} {row.unit}</td>
                  <td><ClassificationBadge label={row.classification}/></td>
                </tr>
              ))}</tbody>
            </table></div>
            <section className="narrative-panel">
              <div className="narrative-panel-head"><div><span className="eyebrow">SÍNTESE ASSISTIDA POR IA · EXEMPLO</span><h3>Explicação em linguagem simples</h3></div><StatusBadge tone="success">Aprovada</StatusBadge></div>
              <div className="narrative-provider-note"><Icon name="shield" size={13}/>Gerado por motor de texto local (sem custo) — reformata os fatos já calculados, não é um modelo de linguagem real ainda.</div>
              <p className="narrative-summary">{demoNarrative.summary}</p>
              <div className="narrative-block"><h4>Observações</h4><ul>{demoNarrative.observations.map((item, i) => <li key={i}>{item}</li>)}</ul></div>
              <div className="narrative-block attention"><h4><Icon name="warning" size={12}/> Pontos de atenção</h4><ul>{demoNarrative.attentionPoints.map((item, i) => <li key={i}>{item}</li>)}</ul></div>
              <div className="narrative-block"><h4>Tendências</h4><ul>{demoNarrative.trends.map((item, i) => <li key={i}>{item}</li>)}</ul></div>
              <div className="narrative-block muted"><h4>Fontes técnicas</h4><ul>{demoNarrative.technicalReferences.map((item, i) => <li key={i}>{item}</li>)}</ul></div>
            </section>
          </div>
        ) : (
          <div className="pending-engine"><Icon name="sparkles" size={24}/><div><h3>Interface de parecer e aprovação</h3><p>Esta análise ({analysis.status.toLowerCase()}) ainda não chegou nessa etapa nesta demonstração. Veja <Link href="/analises/AN-2026-0148">AN-2026-0148 · Fazenda Horizonte</Link> para o exemplo completo, do laudo à síntese aprovada.</p></div></div>
        )}
      </div></section></div>
      <aside className="review-sidebar"><section className="card trace-card"><div className="card-header"><div><span className="eyebrow">RASTREABILIDADE</span><h2>Registro de exemplo</h2></div></div><dl className="detail-list"><div><dt>ID</dt><dd>{analysis.id}</dd></div><div><dt>Origem do laudo</dt><dd>Importação CSV (exemplo)</dd></div><div><dt>Amostras normalizadas</dt><dd>6</dd></div></dl></section></aside>
    </div>
  </div></>;
}
