import Link from "next/link";
import { notFound } from "next/navigation";
import { Topbar } from "@/components/topbar";
import { Icon } from "@/components/icon";
import { PrintButton } from "@/components/print-button";
import { PublishReportButton } from "@/components/publish-report-button";
import { RealFieldMap } from "@/components/real-field-map";
import { ReportBrand, ReportSignature } from "@/components/report-brand";
import { StatusBadge, ClassificationBadge } from "@/components/ui";
import { requirePlatformSession } from "@/lib/auth/session";
import { getFieldAnalysisReportData, getPublishedReportSnapshot } from "@/lib/repositories/reports";
import { getLatestAgronomicNarrative, getLatestAgronomicPrescription } from "@/lib/repositories/ai-generations";
import { getInputComparisonForAnalysis } from "@/lib/repositories/catalog";
import { getTenantBranding } from "@/lib/repositories/tenant-branding";
import { analysisDisplayStatus } from "@/domain/analysis-ui";

const REVIEW_ROLES = new Set(["SUPER_ADMIN", "TENANT_ADMIN", "AGRONOMIST"]);

export const metadata = { title: "Relatório de análise por talhão" };

type StructuredInterpretation = { sampleCode: string; parameterCode: string; interpretable: boolean; classification?: string; reason?: string };
type StructuredFact = { sampleCode: string; parameterCode: string; value: number; unit: string; method: string; source?: string };
type StructuredOutput = { facts?: StructuredFact[]; interpretation?: StructuredInterpretation[]; confidence?: { score: number; level: string }; trace?: { cropProfileCode: string | null; cropProfileVersion: string | null } };

export default async function FieldAnalysisReportPage({ params, searchParams }: { params: Promise<{ analysisId: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { analysisId } = await params;
  const query = await searchParams;
  const session = await requirePlatformSession();
  const [data, narrative, prescription, comparison, branding, publishedSnapshot] = await Promise.all([
    getFieldAnalysisReportData(session.tenantId, analysisId, session.userId),
    getLatestAgronomicNarrative(session.tenantId, analysisId, session.userId),
    getLatestAgronomicPrescription(session.tenantId, analysisId, session.userId),
    getInputComparisonForAnalysis(session.tenantId, analysisId, session.userId),
    getTenantBranding(session.tenantId),
    // Fechamento técnico Fase 3 (item 2): lê de volta o snapshot IMUTÁVEL gravado no publish -- nunca
    // reconstrói a "versão publicada" a partir do dado atual.
    getPublishedReportSnapshot(session.tenantId, analysisId, session.userId),
  ]);
  if (!data) notFound();
  const { analysis, points, results, interpretation, publishedReport, isShowingPublishedVersion } = data;
  // Fase 3, Bloco F: usa a MESMA correção já aplicada na tela de análise (Fase 1) -- "Pronta para
  // interpretar" mentiria aqui quando o motor já rodou e não achou nada interpretável. Esse relatório
  // divergia da tela de origem antes desta correção (achado real desta rodada).
  const meta = analysisDisplayStatus({ status: analysis.status, latestInterpretationStatus: interpretation?.status ?? null, notInterpretableReason: interpretation?.notInterpretableReason ?? null });
  const liveStructured = interpretation?.structuredOutput as StructuredOutput | null;
  const collectedCount = points.filter((point: any) => point.collectedAt).length;

  // A alternância só faz sentido quando existe pelo menos um publish real. Nunca mostra "Versão
  // publicada" como conteúdo reconstruído -- só quando o snapshot foi lido e verificado de verdade.
  // `publishedInfo` estreita o tipo union uma única vez (found === true), evitando repetir o guard em
  // cada uso de `.report`/`.hashVerified`/`.readError` pelo resto da página.
  const publishedInfo = publishedSnapshot.found ? publishedSnapshot : null;
  const canShowPublishedView = publishedInfo != null && publishedInfo.snapshot != null;
  const requestedView = query.versao === "publicada" && canShowPublishedView ? "publicada" : "atual";
  const viewingPublished = requestedView === "publicada";

  const snapshotOutput = viewingPublished ? (publishedInfo?.snapshot?.structuredOutput as StructuredOutput | undefined) : undefined;
  const displayFacts: StructuredFact[] = viewingPublished ? (snapshotOutput?.facts ?? []) : results;
  const displayInterpretation: StructuredInterpretation[] = viewingPublished ? (snapshotOutput?.interpretation ?? []) : (liveStructured?.interpretation ?? []);
  const displayConfidence = viewingPublished ? snapshotOutput?.confidence : liveStructured?.confidence;

  return (
    <>
      <Topbar eyebrow="Relatórios" title="Análise por talhão">
        <Link href="/relatorios" className="button ghost no-print">Voltar</Link>
      </Topbar>
      <div className="content-wrap">
        <div className="report-toolbar no-print">
          <span className="report-empty-note">Documento gerado a partir de dados reais persistidos — nenhum valor estimado.</span>
          <div style={{ display: "flex", gap: 10 }}>
            {interpretation && interpretation.status === "APPROVED" && REVIEW_ROLES.has(session.role) && <PublishReportButton interpretationId={interpretation.id}/>}
            <PrintButton/>
          </div>
        </div>

        {/* Fase 3, fechamento técnico (item 2): alternância real Versão atual / Versão publicada -- só
            aparece quando existe publish com snapshot legível. "Versão publicada" renderiza o conteúdo
            gravado em `reports`/storage no momento do publish, nunca o dado recalculado depois. */}
        {publishedReport && (
          <div className="report-version-toggle no-print">
            <Link href={`?`} className={!viewingPublished ? "active" : ""}>Versão atual</Link>
            <Link href={`?versao=publicada`} className={viewingPublished ? "active" : ""} aria-disabled={!canShowPublishedView}>Versão publicada{!canShowPublishedView ? " (indisponível)" : ""}</Link>
          </div>
        )}

        {!publishedReport ? (
          <div className="report-toolbar no-print"><span className="report-empty-note"><Icon name="warning" size={12}/> Rascunho — nenhuma versão deste relatório foi publicada ainda. O conteúdo abaixo reflete o dado calculado mais recente e pode mudar.</span></div>
        ) : viewingPublished ? (
          <div className="report-toolbar no-print"><span className="report-empty-note"><Icon name="check" size={12}/> Mostrando o snapshot IMUTÁVEL publicado em {new Date(publishedInfo!.report.publishedAt).toLocaleString("pt-BR")} por {publishedInfo!.report.publishedByName ?? "—"} — revisão #{publishedInfo!.report.revision}. Integridade do arquivo: {publishedInfo!.hashVerified ? "hash verificado, conteúdo íntegro." : "não verificado."} Seções não capturadas no snapshot (pontos/mapa/narrativa/prescrição/comparação de insumo) aparecem como nota, não como dado atual disfarçado de publicado.</span></div>
        ) : !canShowPublishedView && publishedInfo?.readError ? (
          <div className="report-toolbar no-print"><span className="report-empty-note"><Icon name="warning" size={12}/> Existe uma versão publicada (revisão #{publishedReport.interpretationRevision}, {new Date(publishedReport.publishedAt).toLocaleString("pt-BR")}), mas o snapshot não pôde ser lido de volta agora ({publishedInfo.readError}) — mostrando o dado atual, que pode não ser idêntico ao publicado.</span></div>
        ) : !isShowingPublishedVersion ? (
          <div className="report-toolbar no-print"><span className="report-empty-note"><Icon name="warning" size={12}/> Atenção: existe uma versão publicada (revisão #{publishedReport.interpretationRevision}, {new Date(publishedReport.publishedAt).toLocaleString("pt-BR")}, por {publishedReport.publishedByName ?? "—"}), mas os dados foram recalculados depois (revisão atual #{interpretation?.revision}). Esta tela mostra o dado ATUAL por padrão — use "Versão publicada" acima para ver exatamente o que foi publicado.</span></div>
        ) : (
          <div className="report-toolbar no-print"><span className="report-empty-note"><Icon name="check" size={12}/> Publicado em {new Date(publishedReport.publishedAt).toLocaleString("pt-BR")} por {publishedReport.publishedByName ?? "—"} — revisão #{publishedReport.interpretationRevision} (versão atual e publicada coincidem).</span></div>
        )}

        <article className="report-doc">
          <header className="report-header">
            <ReportBrand branding={branding} />
            <div className="report-header-meta">
              <span>Gerado em</span><strong>{new Date().toLocaleString("pt-BR")}</strong>
              <span style={{ marginTop: 6 }}>Código</span><strong>{analysis.code}</strong>
              <span style={{ marginTop: 6 }}>Situação</span><strong>{viewingPublished ? "Publicado (snapshot imutável)" : !publishedReport ? "Rascunho" : isShowingPublishedVersion ? "Publicado" : "Rascunho (mais recente que o publicado)"}</strong>
            </div>
          </header>

          <h1 className="report-title">Relatório de análise por talhão</h1>
          <p className="report-subtitle">{analysis.clientName} · {analysis.propertyName} · {analysis.fieldName}</p>

          <div className="report-meta-grid">
            <div><span>Cliente</span><strong>{analysis.clientName}</strong></div>
            <div><span>Propriedade</span><strong>{analysis.propertyName}</strong></div>
            <div><span>Talhão</span><strong>{analysis.fieldName} · {Number(analysis.areaHa).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} ha</strong></div>
            <div><span>Safra / cultura</span><strong>{analysis.seasonLabel} · {analysis.currentCrop || "não informada"}</strong></div>
            <div><span>Cultivar</span><strong>{analysis.cultivar || "—"}</strong></div>
            <div><span>Sistema de cultivo</span><strong>{analysis.managementSystem || "—"}</strong></div>
            <div><span>Textura do solo</span><strong>{analysis.soilTexture || "—"}</strong></div>
            <div><span>Meta produtiva</span><strong>{analysis.yieldGoal != null ? `${analysis.yieldGoal} ${analysis.yieldGoalUnit ?? ""}` : "—"}</strong></div>
            <div><span>Laboratório</span><strong>{analysis.laboratoryName || "Não identificado"}</strong></div>
            <div><span>Período</span><strong>{new Date(analysis.createdAt).toLocaleDateString("pt-BR")} – {new Date(analysis.updatedAt).toLocaleDateString("pt-BR")}</strong></div>
            <div><span>Status</span><strong>{viewingPublished ? <StatusBadge tone="success">Publicado</StatusBadge> : <StatusBadge tone={meta.tone}>{meta.label}</StatusBadge>}</strong></div>
            {/* Mesmo rótulo "Confiabilidade do laudo" usado no detalhe da análise -- os dois vêm da mesma
                fonte (analyses.confidence_score), mas o nome agora deixa explícito do que se trata (não é
                a mesma coisa que a confiabilidade da interpretação agronômica, mostrada só na tela de
                detalhe). Achado real confirmado na auditoria, item D. */}
            <div><span>Confiabilidade do laudo</span><strong>{analysis.confidenceScore != null ? `${Math.round(Number(analysis.confidenceScore))}/100 (${analysis.confidenceLevel})` : "—"}</strong></div>
            {displayConfidence && <div><span>Confiabilidade da interpretação{viewingPublished ? " (no publish)" : ""}</span><strong>{displayConfidence.score}/100 ({displayConfidence.level})</strong></div>}
          </div>

          {viewingPublished ? (
            <section className="report-section">
              <h2>Pontos de amostragem <span className="report-empty-note">(não fazia parte do snapshot publicado — coordenadas/GPS não são versionados nesta instância; ver &quot;Versão atual&quot;)</span></h2>
            </section>
          ) : (
            <section className="report-section">
              <h2>Pontos de amostragem ({points.length} — {collectedCount} coletados)</h2>
              {points.length ? (
                <div className="report-table-wrap"><table className="report-table">
                  <thead><tr><th>Código</th><th>Coordenadas</th><th>Profundidade</th><th>Status</th></tr></thead>
                  <tbody>{points.map((point: any) => (
                    <tr key={point.id}><td>{point.code}</td><td>{point.latitude.toFixed(6)}, {point.longitude.toFixed(6)}</td><td>{point.depthFromCm}–{point.depthToCm} cm</td><td>{point.collectedAt ? "Coletado" : "Pendente"}</td></tr>
                  ))}</tbody>
                </table></div>
              ) : <p className="report-empty-note">Nenhum ponto vinculado a esta análise.</p>}
            </section>
          )}

          {!viewingPublished && points.length > 0 && (
            <section className="report-section no-print">
              <h2>Mapa real <span className="report-empty-note">(só na tela — no PDF, ver coordenadas na tabela de pontos de amostragem acima)</span></h2>
              <RealFieldMap boundary={analysis.fieldBoundary} points={points.map((point: any) => ({ ...point, sequence: null, observedLatitude: null, observedLongitude: null, subsampleCount: null, accuracyM: null, gpsSource: null, notes: null, labResultCount: 0 }))} height={340}/>
            </section>
          )}

          <section className="report-section">
            <h2>Parâmetros laboratoriais{viewingPublished ? " (do snapshot publicado)" : ""}</h2>
            {displayFacts.length ? (
              <div className="report-table-wrap"><table className="report-table">
                <thead><tr><th>Ponto</th><th>Parâmetro</th><th>Valor</th><th>Unidade</th><th>Método</th></tr></thead>
                <tbody>{displayFacts.map((result: any, index: number) => (
                  <tr key={index}><td>{result.sampleCode}</td><td>{result.parameterCode}</td><td>{result.value}</td><td>{result.unit}</td><td>{result.method}</td></tr>
                ))}</tbody>
              </table></div>
            ) : <p className="report-empty-note">Nenhum resultado laboratorial {viewingPublished ? "estava presente no snapshot publicado" : "persistido ainda para esta análise"}.</p>}
          </section>

          <section className="report-section">
            <h2>Classificações homologadas{viewingPublished ? " (do snapshot publicado)" : ""}</h2>
            {displayInterpretation.length ? (
              <div className="report-table-wrap"><table className="report-table">
                <thead><tr><th>Ponto</th><th>Parâmetro</th><th>Classificação</th></tr></thead>
                <tbody>{displayInterpretation.map((item, index) => (
                  <tr key={index}><td>{item.sampleCode}</td><td>{item.parameterCode}</td><td>{item.interpretable && item.classification ? <ClassificationBadge label={item.classification}/> : <em>Não interpretável</em>}</td></tr>
                ))}</tbody>
              </table></div>
            ) : <p className="report-empty-note">Nenhuma interpretação calculada ainda — sem recomendação ou classificação inventada.</p>}
          </section>

          {viewingPublished ? (
            <>
              <section className="report-section"><h2>Síntese assistida por IA <span className="report-empty-note">(não fazia parte do snapshot publicado)</span></h2></section>
              <section className="report-section"><h2>Prescrição assistida por IA <span className="report-empty-note">(não fazia parte do snapshot publicado)</span></h2></section>
              <section className="report-section"><h2>Insumo: recomendado × usado <span className="report-empty-note">(não fazia parte do snapshot publicado)</span></h2></section>
            </>
          ) : (
            <>
              {narrative && (
                <section className="report-section narrative-report-section">
                  <h2>Síntese assistida por IA</h2>
                  <p className="report-empty-note" style={{ marginBottom: 10 }}>
                    {narrative.responsePayload.isRealLanguageModel ? `Gerado por ${narrative.provider}.` : "Gerado por motor de texto local (sem custo) — reformata os fatos e a classificação já calculados, não é um modelo de linguagem real ainda."}
                    {" "}Status: {narrative.status === "APPROVED" ? "aprovada por revisão profissional." : "aguardando ou pendente de revisão profissional — não é conclusão definitiva."}
                  </p>
                  <p style={{ fontSize: 12, fontWeight: 600 }}>{narrative.responsePayload.narrative.summary}</p>
                  {narrative.responsePayload.narrative.observations.length > 0 && <ul style={{ fontSize: 11, paddingLeft: 18 }}>{narrative.responsePayload.narrative.observations.map((item: string, index: number) => <li key={index}>{item}</li>)}</ul>}
                </section>
              )}

              {prescription && (
                <section className="report-section narrative-report-section">
                  <h2>Prescrição assistida por IA</h2>
                  <p className="report-empty-note" style={{ marginBottom: 10 }}>
                    Gerado por {prescription.provider} ({prescription.model}).{" "}
                    {prescription.status === "APPROVED" ? "Aprovada por revisão profissional — recomendação oficial." : "Aguardando ou pendente de revisão profissional — sugestão de IA, não é recomendação oficial ainda."}
                  </p>
                  <p style={{ fontSize: 12, fontWeight: 600 }}>{prescription.responsePayload.prescription.summary}</p>
                  {prescription.responsePayload.prescription.diagnosis.length > 0 && (
                    <div className="report-table-wrap"><table className="report-table">
                      <thead><tr><th>Parâmetro</th><th>Resultado</th><th>Interpretação</th><th>Justificativa</th></tr></thead>
                      <tbody>{prescription.responsePayload.prescription.diagnosis.map((item: any, index: number) => (
                        <tr key={index}><td>{item.parameterCode}</td><td>{item.value} {item.unit}</td><td>{item.interpretation}</td><td style={{ fontSize: 10 }}>{item.rationale}</td></tr>
                      ))}</tbody>
                    </table></div>
                  )}
                  {prescription.responsePayload.prescription.recommendations.length > 0 && (
                    <div className="report-table-wrap" style={{ marginTop: 12 }}><table className="report-table">
                      <thead><tr><th>Insumo</th><th>Dose</th><th>Justificativa</th></tr></thead>
                      <tbody>{prescription.responsePayload.prescription.recommendations.map((item: any, index: number) => (
                        <tr key={index}><td>{item.inputType}</td><td>{item.quantity.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} {item.unit}</td><td style={{ fontSize: 10 }}>{item.rationale}</td></tr>
                      ))}</tbody>
                    </table></div>
                  )}
                  {prescription.responsePayload.prescription.managementPractices.length > 0 && (
                    <ul style={{ fontSize: 11, paddingLeft: 18, marginTop: 10 }}>{prescription.responsePayload.prescription.managementPractices.map((item: string, index: number) => <li key={index}>{item}</li>)}</ul>
                  )}
                  {prescription.responsePayload.prescription.sources.length > 0 && (
                    <p className="report-empty-note" style={{ marginTop: 10 }}>Fontes: {prescription.responsePayload.prescription.sources.map((source: any) => source.title).join("; ")}</p>
                  )}
                </section>
              )}

              {comparison.length > 0 && (
                <section className="report-section">
                  <h2>Insumo: recomendado × usado</h2>
                  <div className="report-table-wrap"><table className="report-table">
                    <thead><tr><th>Insumo</th><th>Recomendado</th><th>Aplicado</th><th>Situação</th></tr></thead>
                    <tbody>{comparison.map((row: any) => (
                      <tr key={row.inputType}>
                        <td>{row.inputType}</td>
                        <td>{row.recommendedQuantity.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} {row.recommendedUnit}</td>
                        <td>{row.appliedQuantity != null ? `${row.appliedQuantity.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} ${row.appliedUnit}` : row.hasAnyApplication ? "Em outra unidade" : "—"}</td>
                        <td>{{ OK: "Conforme recomendado", UNDER: "Abaixo do recomendado", OVER: "Acima do recomendado", UNIT_MISMATCH: "Unidade diferente", NOT_APPLIED: "Ainda não aplicado" }[row.status as string]}</td>
                      </tr>
                    ))}</tbody>
                  </table></div>
                </section>
              )}
            </>
          )}

          {displayInterpretation.some((item) => !item.interpretable) && (
            <section className="report-section">
              <h2>Pendências{viewingPublished ? " (do snapshot publicado)" : ""}</h2>
              <ul className="report-pendencies">
                {Array.from(new Set(displayInterpretation.filter((item) => !item.interpretable).map((item) => item.reason))).map((reason, index) => <li key={index}><Icon name="warning" size={12}/> {reason}</li>)}
              </ul>
            </section>
          )}

          <div className="report-signature">
            {viewingPublished ? (
              <>
                <div><span>Situação</span>Publicado (snapshot imutável)</div>
                <div><span>Publicado por</span>{publishedInfo?.report.publishedByName || "—"}</div>
                <div><span>Publicado em</span>{new Date(publishedInfo!.report.publishedAt).toLocaleString("pt-BR")}</div>
              </>
            ) : (
              <>
                <div><span>Status de revisão</span>{interpretation ? (interpretation.status === "APPROVED" ? "Aprovada" : "Aguardando validação técnica") : "Sem interpretação registrada"}</div>
                <div><span>Responsável técnico</span>{interpretation?.approvedByName || interpretation?.reviewedByName || "—"}</div>
                <div><span>Base técnica</span>{interpretation?.cropProfileName || "—"}</div>
              </>
            )}
          </div>
          <ReportSignature branding={branding} />
        </article>
      </div>
    </>
  );
}
