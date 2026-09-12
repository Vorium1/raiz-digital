import Link from "next/link";
import { notFound } from "next/navigation";
import { Topbar } from "@/components/topbar";
import { Icon } from "@/components/icon";
import { PrintButton } from "@/components/print-button";
import { PublishReportButton } from "@/components/publish-report-button";
import { RealFieldMap } from "@/components/real-field-map";
import { ReportBrand, ReportSignature } from "@/components/report-brand";
import { PremiumDecisionSummary } from "@/components/premium-decision-summary";
import { StatusBadge, ClassificationBadge } from "@/components/ui";
import { requirePlatformSession } from "@/lib/auth/session";
import { getFieldAnalysisReportData, getPublishedReportSnapshot, type PublishedReportContext, type ReportSnapshotV2 } from "@/lib/repositories/reports";
import { type PremiumReportSnapshotV3 } from "@/lib/repositories/premium-report-publication";
import { getLatestAgronomicNarrative, getLatestAgronomicPrescription } from "@/lib/repositories/ai-generations";
import { getInputComparisonForAnalysis } from "@/lib/repositories/catalog";
import { getTenantBranding, type TenantBranding } from "@/lib/repositories/tenant-branding";
import { getReportPublicationReadiness } from "@/lib/repositories/report-publication-gate";
import { analysisDisplayStatus } from "@/domain/analysis-ui";

const REVIEW_ROLES = new Set(["SUPER_ADMIN", "TENANT_ADMIN", "AGRONOMIST"]);

export const metadata = { title: "Relatório técnico de decisão agronômica" };

type StructuredInterpretation = { sampleCode: string; parameterCode: string; interpretable: boolean; classification?: string; reason?: string };
type StructuredFact = { sampleCode: string; parameterCode: string; value: number; unit: string; method: string; source?: string };
type StructuredOutput = { facts?: StructuredFact[]; interpretation?: StructuredInterpretation[]; confidence?: { score: number; level: string }; trace?: { cropProfileCode: string | null; cropProfileVersion: string | null } };

type DisplayPoint = {
  id: string;
  code: string;
  latitude: number;
  longitude: number;
  depthFromCm: number;
  depthToCm: number;
  collectedAt: string | null;
  gpsSource?: string | null;
};

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
    getPublishedReportSnapshot(session.tenantId, analysisId, session.userId),
  ]);
  if (!data) notFound();
  const { analysis, points, results, interpretation, publishedReport } = data;
  const publicationReadiness = interpretation
    ? await getReportPublicationReadiness(session.tenantId, interpretation.id, session.userId)
    : null;
  const meta = analysisDisplayStatus({ status: analysis.status, latestInterpretationStatus: interpretation?.status ?? null, notInterpretableReason: interpretation?.notInterpretableReason ?? null });
  const liveStructured = interpretation?.structuredOutput as StructuredOutput | null;

  const publishedInfo = publishedSnapshot.found ? publishedSnapshot : null;
  const integrityFailed = publishedInfo != null && publishedInfo.hashVerified === false;
  const canShowPublishedView = publishedInfo != null && publishedInfo.snapshot != null && publishedInfo.hashVerified === true;
  const requestedView = query.versao === "publicada" && canShowPublishedView ? "publicada" : "atual";
  const viewingPublished = requestedView === "publicada";
  const sameRevisionAsPublished = data.isShowingPublishedVersion && canShowPublishedView;

  // Snapshots v3 congelam a decisão completa (contexto, pontos, síntese/recomendação aprovadas). V2 congela
  // contexto e interpretação, mas não os artefatos posteriores. V1 legado não recebe dados vivos por
  // conveniência: o que não foi congelado permanece explicitamente indisponível.
  const rawPublishedSnapshot = viewingPublished
    ? (publishedInfo?.snapshot as unknown as { reportSnapshotVersion?: number; structuredOutput?: unknown } | null)
    : null;
  const publishedSnapshotV3 = rawPublishedSnapshot?.reportSnapshotVersion === 3
    ? (rawPublishedSnapshot as unknown as PremiumReportSnapshotV3)
    : null;
  const publishedSnapshotV2 = rawPublishedSnapshot?.reportSnapshotVersion === 2
    ? (rawPublishedSnapshot as unknown as ReportSnapshotV2)
    : null;
  const isPremiumPublishedSnapshot = publishedSnapshotV3 != null;
  const hasFrozenContext = publishedSnapshotV3 != null || publishedSnapshotV2 != null;
  const displayContext: PublishedReportContext | PremiumReportSnapshotV3["publishedContext"] | typeof analysis =
    publishedSnapshotV3?.publishedContext ?? publishedSnapshotV2?.publishedContext ?? analysis;
  const displayBranding: TenantBranding = publishedSnapshotV3?.brandingSnapshot ?? publishedSnapshotV2?.brandingSnapshot ?? branding;
  const contextUnavailable = viewingPublished && !hasFrozenContext;

  const snapshotOutput = viewingPublished
    ? ((publishedSnapshotV3?.structuredOutput ?? publishedSnapshotV2?.structuredOutput ?? rawPublishedSnapshot?.structuredOutput) as StructuredOutput | undefined)
    : undefined;
  const displayFacts: StructuredFact[] = viewingPublished ? (snapshotOutput?.facts ?? []) : results;
  const displayInterpretation: StructuredInterpretation[] = viewingPublished ? (snapshotOutput?.interpretation ?? []) : (liveStructured?.interpretation ?? []);
  const displayConfidence = viewingPublished ? snapshotOutput?.confidence : liveStructured?.confidence;
  const displayPoints: DisplayPoint[] = viewingPublished
    ? (publishedSnapshotV3?.pointsSnapshot ?? [])
    : points;
  const displayBoundary = viewingPublished ? (publishedSnapshotV3?.publishedContext.fieldBoundary ?? null) : analysis.fieldBoundary;
  const displayNarrative = viewingPublished ? (publishedSnapshotV3?.approvedNarrative ?? null) : narrative;
  const displayPrescription = viewingPublished ? (publishedSnapshotV3?.approvedPrescription ?? null) : prescription;
  const collectedCount = displayPoints.filter((point) => point.collectedAt).length;
  const reportSampleCount = displayPoints.length > 0
    ? displayPoints.length
    : new Set(displayInterpretation.map((row) => row.sampleCode)).size;

  return (
    <>
      <Topbar eyebrow="Relatórios" title="Decisão agronômica">
        <Link href="/relatorios" className="button ghost no-print">Voltar</Link>
      </Topbar>
      <div className="content-wrap">
        <div className="report-toolbar no-print">
          <span className="report-empty-note">Entrega técnica construída com dados persistidos, regras homologadas e revisão profissional.</span>
          <div style={{ display: "flex", gap: 10 }}>
            {interpretation && publicationReadiness?.allowed && REVIEW_ROLES.has(session.role) && <PublishReportButton interpretationId={interpretation.id}/>}
            {!(query.versao === "publicada" && integrityFailed) && <PrintButton/>}
          </div>
        </div>

        {interpretation?.status === "APPROVED" && publicationReadiness && !publicationReadiness.allowed && (
          <div className="report-toolbar no-print">
            <span className="report-empty-note"><Icon name="shield" size={12}/> <strong>Entrega oficial bloqueada:</strong> {publicationReadiness.reason}</span>
          </div>
        )}

        {publishedReport && (
          <div className="report-version-toggle no-print">
            <Link href={`?`} className={!viewingPublished ? "active" : ""}>Versão atual</Link>
            <Link href={`?versao=publicada`} className={viewingPublished ? "active" : ""} aria-disabled={!canShowPublishedView}>
              Versão publicada{integrityFailed ? " (integridade falhou)" : !canShowPublishedView ? " (indisponível)" : ""}
            </Link>
          </div>
        )}

        {integrityFailed && (
          <div className="report-toolbar no-print report-integrity-error">
            <span><Icon name="warning" size={14}/> <strong>Falha de integridade na versão publicada (revisão #{publishedReport?.interpretationRevision}).</strong> O hash do arquivo lido não bate com o hash gravado no momento do publish ({publishedInfo?.report.sha256.slice(0, 12)}…) — o conteúdo pode ter sido adulterado ou corrompido. Por segurança, o conteúdo NÃO é mostrado como versão oficial e não pode ser impresso como tal. Mostrando apenas a versão atual (rascunho) abaixo.</span>
          </div>
        )}

        {!publishedReport ? (
          <div className="report-toolbar no-print"><span className="report-empty-note"><Icon name="warning" size={12}/> Rascunho — nenhuma versão deste relatório foi publicada ainda. O conteúdo abaixo reflete o dado calculado mais recente e pode mudar.</span></div>
        ) : integrityFailed ? null : viewingPublished ? (
          <div className="report-toolbar no-print"><span className="report-empty-note"><Icon name="check" size={12}/> Mostrando o snapshot IMUTÁVEL publicado em {new Date(publishedInfo!.report.publishedAt).toLocaleString("pt-BR")} por {publishedInfo!.report.publishedByName ?? "—"} — revisão #{publishedInfo!.report.revision}. Integridade: hash verificado.{isPremiumPublishedSnapshot ? " Esta entrega congela contexto, interpretação, pontos, marca e a recomendação aprovada da mesma revisão." : contextUnavailable ? " Este snapshot é legado e não continha contexto/marca congelados; esses campos permanecem indisponíveis." : " Este snapshot anterior congela contexto e interpretação; artefatos posteriores que não faziam parte dele permanecem indisponíveis."}</span></div>
        ) : !canShowPublishedView && publishedInfo?.readError ? (
          <div className="report-toolbar no-print"><span className="report-empty-note"><Icon name="warning" size={12}/> Existe uma versão publicada (revisão #{publishedReport.interpretationRevision}, {new Date(publishedReport.publishedAt).toLocaleString("pt-BR")}), mas o snapshot não pôde ser lido de volta agora ({publishedInfo.readError}) — mostrando o dado atual, que pode não ser idêntico ao publicado.</span></div>
        ) : !sameRevisionAsPublished ? (
          <div className="report-toolbar no-print"><span className="report-empty-note"><Icon name="warning" size={12}/> Atenção: existe uma versão publicada (revisão #{publishedReport.interpretationRevision}, {new Date(publishedReport.publishedAt).toLocaleString("pt-BR")}, por {publishedReport.publishedByName ?? "—"}), mas os dados foram recalculados depois (revisão atual #{interpretation?.revision}). Esta tela mostra o dado ATUAL por padrão — use "Versão publicada" acima para ver exatamente o que foi publicado.</span></div>
        ) : (
          <div className="report-toolbar no-print"><span className="report-empty-note"><Icon name="check" size={12}/> A revisão técnica atual (#{interpretation?.revision}) é a mesma que foi publicada em {new Date(publishedReport.publishedAt).toLocaleString("pt-BR")} por {publishedReport.publishedByName ?? "—"}. Para consultar a entrega oficial congelada e verificar sua integridade, use "Versão publicada".</span></div>
        )}

        <article className="report-doc">
          <header className="report-header">
            <ReportBrand branding={displayBranding} />
            <div className="report-header-meta">
              <span>Gerado em</span><strong>{viewingPublished ? new Date(publishedInfo!.report.publishedAt).toLocaleString("pt-BR") : new Date().toLocaleString("pt-BR")}</strong>
              <span style={{ marginTop: 6 }}>Código</span><strong>{contextUnavailable ? "—" : displayContext.code}</strong>
              <span style={{ marginTop: 6 }}>Situação</span><strong>{viewingPublished ? "Publicado (snapshot imutável)" : !publishedReport ? "Rascunho" : sameRevisionAsPublished ? "Rascunho (revisão igual à publicada)" : "Rascunho (mais recente que o publicado)"}</strong>
            </div>
          </header>

          <h1 className="report-title">Relatório Técnico de Decisão Agronômica</h1>
          <p className="report-subtitle">{contextUnavailable ? "Contexto não capturado neste snapshot (formato anterior)" : `${displayContext.clientName} · ${displayContext.propertyName} · ${displayContext.fieldName}`}</p>

          <div className="report-meta-grid">
            {contextUnavailable ? (
              <div className="report-empty-note" style={{ gridColumn: "1/-1" }}>Este snapshot publicado é de um formato legado. Contexto e marca não foram capturados naquele formato e, por isso, não são preenchidos com informação atual como se fossem imutáveis.</div>
            ) : (
              <>
                <div><span>Cliente</span><strong>{displayContext.clientName}</strong></div>
                <div><span>Propriedade</span><strong>{displayContext.propertyName}</strong></div>
                <div><span>Talhão</span><strong>{displayContext.fieldName} · {Number(displayContext.areaHa).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} ha</strong></div>
                <div><span>Safra / cultura</span><strong>{displayContext.seasonLabel} · {displayContext.currentCrop || "não informada"}</strong></div>
                <div><span>Cultivar</span><strong>{displayContext.cultivar || "—"}</strong></div>
                <div><span>Sistema de cultivo</span><strong>{displayContext.managementSystem || "—"}</strong></div>
                <div><span>Textura do solo</span><strong>{displayContext.soilTexture || "—"}</strong></div>
                <div><span>Meta produtiva</span><strong>{displayContext.yieldGoal != null ? `${displayContext.yieldGoal} ${displayContext.yieldGoalUnit ?? ""}` : "—"}</strong></div>
                <div><span>Laboratório</span><strong>{displayContext.laboratoryName || "Não identificado"}</strong></div>
                <div><span>Período</span><strong>{new Date(displayContext.createdAt).toLocaleDateString("pt-BR")} – {new Date(displayContext.updatedAt).toLocaleDateString("pt-BR")}</strong></div>
                <div><span>Status</span><strong>{viewingPublished ? <StatusBadge tone="success">Publicado</StatusBadge> : <StatusBadge tone={meta.tone}>{meta.label}</StatusBadge>}</strong></div>
                <div><span>Confiabilidade do laudo</span><strong>{displayContext.confidenceScore != null ? `${Math.round(Number(displayContext.confidenceScore))}/100 (${displayContext.confidenceLevel})` : "—"}</strong></div>
              </>
            )}
            {displayConfidence && <div><span>Confiabilidade da interpretação{viewingPublished ? " (no publish)" : ""}</span><strong>{displayConfidence.score}/100 ({displayConfidence.level})</strong></div>}
          </div>

          <PremiumDecisionSummary
            rows={displayInterpretation}
            sampleCount={reportSampleCount}
            interpretationStatus={viewingPublished ? "APPROVED" : interpretation?.status ?? null}
            prescriptionStatus={displayPrescription?.status ?? null}
            reportPublished={Boolean(publishedReport)}
            viewingPublished={viewingPublished}
            confidence={displayConfidence ?? null}
            narrativeSummary={displayNarrative?.responsePayload?.narrative?.summary ?? null}
            prescriptionSummary={displayPrescription?.responsePayload?.prescription?.summary ?? null}
            managementPractices={displayPrescription?.responsePayload?.prescription?.managementPractices ?? []}
            missingInformation={displayPrescription?.responsePayload?.prescription?.missingInformation ?? []}
          />

          {viewingPublished && !isPremiumPublishedSnapshot ? (
            <section className="report-section">
              <h2>Pontos de amostragem <span className="report-empty-note">(não faziam parte deste formato de snapshot publicado — ver versão atual)</span></h2>
            </section>
          ) : (
            <section className="report-section">
              <h2>Pontos de amostragem ({displayPoints.length} — {collectedCount} coletados)</h2>
              {displayPoints.length ? (
                <div className="report-table-wrap"><table className="report-table">
                  <thead><tr><th>Código</th><th>Coordenadas</th><th>Profundidade</th><th>Origem</th><th>Status</th></tr></thead>
                  <tbody>{displayPoints.map((point) => (
                    <tr key={point.id}><td>{point.code}</td><td>{point.latitude.toFixed(6)}, {point.longitude.toFixed(6)}</td><td>{point.depthFromCm}–{point.depthToCm} cm</td><td>{point.gpsSource || "—"}</td><td>{point.collectedAt ? "Coletado" : "Pendente"}</td></tr>
                  ))}</tbody>
                </table></div>
              ) : <p className="report-empty-note">Nenhum ponto vinculado a esta análise.</p>}
            </section>
          )}

          {displayPoints.length > 0 && displayBoundary && (
            <section className="report-section no-print">
              <h2>Mapa do talhão e pontos <span className="report-empty-note">({viewingPublished ? "geometria congelada na entrega; " : ""}visualização interativa; coordenadas constam na tabela acima)</span></h2>
              <RealFieldMap boundary={displayBoundary} points={displayPoints.map((point) => ({ ...point, sequence: null, observedLatitude: null, observedLongitude: null, subsampleCount: null, accuracyM: null, gpsSource: point.gpsSource ?? null, notes: null, labResultCount: 0 }))} height={340}/>
            </section>
          )}

          <section className="report-section">
            <h2>Resultados laboratoriais{viewingPublished ? " (do snapshot publicado)" : ""}</h2>
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

          {viewingPublished && !isPremiumPublishedSnapshot ? (
            <>
              <section className="report-section"><h2>Síntese técnica RAIZ <span className="report-empty-note">(não fazia parte deste formato de snapshot publicado)</span></h2></section>
              <section className="report-section"><h2>Recomendação Assistida RAIZ <span className="report-empty-note">(não fazia parte deste formato de snapshot publicado)</span></h2></section>
              <section className="report-section"><h2>Aderência: recomendado × aplicado <span className="report-empty-note">(não fazia parte deste formato de snapshot publicado)</span></h2></section>
            </>
          ) : (
            <>
              {displayNarrative && (
                <section className="report-section narrative-report-section">
                  <h2>Síntese técnica RAIZ</h2>
                  <p className="report-empty-note" style={{ marginBottom: 10 }}>
                    A RAIZ organiza os fatos calculados e a classificação homologada em linguagem técnica legível. {displayNarrative.status === "APPROVED" ? "Síntese aprovada por revisão profissional." : "Síntese ainda sujeita à revisão profissional; não é conclusão definitiva."}
                  </p>
                  <p style={{ fontSize: 12, fontWeight: 600 }}>{displayNarrative.responsePayload.narrative.summary}</p>
                  {displayNarrative.responsePayload.narrative.observations.length > 0 && <ul style={{ fontSize: 11, paddingLeft: 18 }}>{displayNarrative.responsePayload.narrative.observations.map((item: string, index: number) => <li key={index}>{item}</li>)}</ul>}
                </section>
              )}

              {displayPrescription && (
                <section className="report-section narrative-report-section">
                  <h2>Recomendação Assistida RAIZ</h2>
                  <p className="report-empty-note" style={{ marginBottom: 10 }}>
                    Gerada a partir das evidências disponíveis e da interpretação aprovada. {displayPrescription.status === "APPROVED" ? "Aprovada pelo responsável técnico — recomendação oficial." : "Ainda em fluxo de revisão profissional — não é recomendação oficial."}
                  </p>
                  <p style={{ fontSize: 12, fontWeight: 600 }}>{displayPrescription.responsePayload.prescription.summary}</p>
                  {displayPrescription.responsePayload.prescription.diagnosis.length > 0 && (
                    <div className="report-table-wrap"><table className="report-table">
                      <thead><tr><th>Parâmetro</th><th>Resultado</th><th>Interpretação</th><th>Justificativa</th></tr></thead>
                      <tbody>{displayPrescription.responsePayload.prescription.diagnosis.map((item: any, index: number) => (
                        <tr key={index}><td>{item.parameterCode}</td><td>{item.value} {item.unit}</td><td>{item.interpretation}</td><td style={{ fontSize: 10 }}>{item.rationale}</td></tr>
                      ))}</tbody>
                    </table></div>
                  )}
                  {displayPrescription.responsePayload.prescription.recommendations.length > 0 ? (
                    <div className="report-table-wrap" style={{ marginTop: 12 }}><table className="report-table">
                      <thead><tr><th>Insumo</th><th>Dose</th><th>Justificativa</th></tr></thead>
                      <tbody>{displayPrescription.responsePayload.prescription.recommendations.map((item: any, index: number) => (
                        <tr key={index}><td>{item.inputType}</td><td>{item.quantity.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} {item.unit}</td><td style={{ fontSize: 10 }}>{item.rationale}</td></tr>
                      ))}</tbody>
                    </table></div>
                  ) : (
                    <div className="agro-message danger" style={{ marginTop: 12 }}><Icon name="shield" size={13}/><span><strong>Sem dose inventada.</strong> As evidências disponíveis não sustentaram uma dose numérica nesta geração; a lacuna foi preservada para revisão técnica.</span></div>
                  )}
                  {displayPrescription.responsePayload.prescription.managementPractices.length > 0 && (
                    <div style={{ marginTop: 12 }}><strong style={{ fontSize: 10 }}>Práticas de manejo priorizadas</strong><ul style={{ fontSize: 11, paddingLeft: 18, marginTop: 6 }}>{displayPrescription.responsePayload.prescription.managementPractices.map((item: string, index: number) => <li key={index}>{item}</li>)}</ul></div>
                  )}
                  {displayPrescription.responsePayload.prescription.missingInformation.length > 0 && (
                    <div style={{ marginTop: 12 }}><strong style={{ fontSize: 10 }}>Informações ainda necessárias para fechar a decisão</strong><ul style={{ fontSize: 11, paddingLeft: 18, marginTop: 6 }}>{displayPrescription.responsePayload.prescription.missingInformation.map((item: string, index: number) => <li key={index}>{item}</li>)}</ul></div>
                  )}
                  {displayPrescription.responsePayload.prescription.sources.length > 0 && (
                    <p className="report-empty-note" style={{ marginTop: 10 }}>Base técnica: {displayPrescription.responsePayload.prescription.sources.map((source: any) => `${source.title}${source.institution ? ` — ${source.institution}` : ""}`).join("; ")}</p>
                  )}
                </section>
              )}

              {!viewingPublished && comparison.length > 0 && (
                <section className="report-section">
                  <h2>Aderência: recomendado × aplicado</h2>
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
              {viewingPublished && <section className="report-section"><h2>Aderência: recomendado × aplicado <span className="report-empty-note">(não é congelada no snapshot v3; consulte a versão atual para acompanhar execução posterior à recomendação)</span></h2></section>}
            </>
          )}

          {displayInterpretation.some((item) => !item.interpretable) && (
            <section className="report-section">
              <h2>Pendências técnicas{viewingPublished ? " (do snapshot publicado)" : ""}</h2>
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
          <ReportSignature branding={displayBranding} />
        </article>
      </div>
    </>
  );
}
