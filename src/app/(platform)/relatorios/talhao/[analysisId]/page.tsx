import Link from "next/link";
import { notFound } from "next/navigation";
import { Topbar } from "@/components/topbar";
import { Icon } from "@/components/icon";
import { PrintButton } from "@/components/print-button";
import { PublishReportButton } from "@/components/publish-report-button";
import { RealFieldMap } from "@/components/real-field-map";
import { effectivePointCoordinates, pointPositionKind, type MapPoint } from "@/components/spatial-map-types";
import { ReportBrand, ReportSignature } from "@/components/report-brand";
import { PremiumDecisionSummary } from "@/components/premium-decision-summary";
import { FinalVisualReport } from "@/components/report-final-visual";
import { StatusBadge, ClassificationBadge } from "@/components/ui";
import { requirePlatformSession } from "@/lib/auth/session";
import { getAnalysisEvidenceState } from "@/lib/repositories/analysis-evidence";
import { getAgronomicNarrativeFreshness } from "@/lib/repositories/agronomic-narrative-safety";
import { getAgronomicPrescriptionFreshness } from "@/lib/repositories/prescription-freshness";
import { getFieldAnalysisReportData, getPublishedReportSnapshot, type PublishedReportContext, type ReportSnapshotV2 } from "@/lib/repositories/reports";
import { type PremiumReportSnapshotV3 } from "@/lib/repositories/premium-report-publication";
import { getLatestAgronomicNarrative, getLatestAgronomicPrescription } from "@/lib/repositories/ai-generations";
import { getCurrentInputComparisonForAnalysis } from "@/lib/repositories/input-comparison";
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
  observedLatitude?: number | null;
  observedLongitude?: number | null;
  accuracyM?: number | null;
  depthFromCm: number;
  depthToCm: number;
  collectedAt: string | null;
  gpsSource?: string | null;
};

export default async function FieldAnalysisReportPage({ params, searchParams }: { params: Promise<{ analysisId: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { analysisId } = await params;
  const query = await searchParams;
  const session = await requirePlatformSession();
  const [data, narrative, prescription, comparison, branding, publishedSnapshot, evidence] = await Promise.all([
    getFieldAnalysisReportData(session.tenantId, analysisId, session.userId),
    getLatestAgronomicNarrative(session.tenantId, analysisId, session.userId),
    getLatestAgronomicPrescription(session.tenantId, analysisId, session.userId),
    getCurrentInputComparisonForAnalysis(session.tenantId, analysisId, session.userId),
    getTenantBranding(session.tenantId),
    getPublishedReportSnapshot(session.tenantId, analysisId, session.userId),
    getAnalysisEvidenceState({ tenantId: session.tenantId, userId: session.userId, analysisId }),
  ]);
  if (!data) notFound();
  const { analysis, points, results, interpretation, publishedReport } = data;
  const [publicationReadiness, narrativeFreshness, prescriptionFreshness] = await Promise.all([
    interpretation ? getReportPublicationReadiness(session.tenantId, interpretation.id, session.userId) : Promise.resolve(null),
    narrative ? getAgronomicNarrativeFreshness({ tenantId: session.tenantId, userId: session.userId, analysisId, generationId: narrative.id }) : Promise.resolve(null),
    prescription ? getAgronomicPrescriptionFreshness({ tenantId: session.tenantId, userId: session.userId, analysisId, generationId: prescription.id }) : Promise.resolve(null),
  ]);
  const interpretationCurrent = evidence.interpretationId === interpretation?.id && evidence.freshness.current === true;
  const narrativeCurrent = Boolean(interpretationCurrent && narrative && narrativeFreshness?.current === true);
  const prescriptionCurrent = Boolean(interpretationCurrent && prescription && prescriptionFreshness?.current === true);
  const currentNarrative = narrativeCurrent ? narrative : null;
  const currentPrescription = prescriptionCurrent ? prescription : null;
  const meta = interpretationCurrent
    ? analysisDisplayStatus({ status: analysis.status, latestInterpretationStatus: interpretation?.status ?? null, notInterpretableReason: interpretation?.notInterpretableReason ?? null })
    : { label: "Precisa atualizar", tone: "waiting" as const };
  const liveStructured = (interpretationCurrent ? interpretation?.structuredOutput : null) as StructuredOutput | null;

  const publishedInfo = publishedSnapshot.found ? publishedSnapshot : null;
  const requestedPublished = query.versao === "publicada";
  const integrityFailed = publishedInfo != null && publishedInfo.hashVerified === false;
  const canShowPublishedView = publishedInfo != null && publishedInfo.snapshot != null && publishedInfo.hashVerified === true;
  const requestedView = requestedPublished && canShowPublishedView ? "publicada" : "atual";
  const viewingPublished = requestedView === "publicada";
  const publishedInterpretationIsCurrent = data.isShowingPublishedVersion && canShowPublishedView && interpretationCurrent;

  // Snapshots v3 congelam a decisão completa (contexto, pontos, síntese/recomendação aprovadas). V2 congela
  // contexto e interpretação, mas não os artefatos posteriores. V1 legado não recebe dados vivos por
  // conveniência: o que não foi congelado permanece explicitamente indisponível.
  const rawPublishedSnapshot = canShowPublishedView
    ? (publishedInfo?.snapshot as unknown as { reportSnapshotVersion?: number; structuredOutput?: unknown } | null)
    : null;
  const publishedSnapshotV3 = rawPublishedSnapshot?.reportSnapshotVersion === 3
    ? (rawPublishedSnapshot as unknown as PremiumReportSnapshotV3)
    : null;
  const publishedSnapshotV2 = rawPublishedSnapshot?.reportSnapshotVersion === 2
    ? (rawPublishedSnapshot as unknown as ReportSnapshotV2)
    : null;
  const isPremiumPublishedSnapshot = publishedSnapshotV3 != null;
  const publishedPrescriptionMatchesCurrent = Boolean(
    publishedSnapshotV3
    && currentPrescription?.id
    && publishedSnapshotV3.approvedPrescription.id === currentPrescription.id,
  );
  const sameDecisionAsPublished = publishedInterpretationIsCurrent && publishedPrescriptionMatchesCurrent;
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
  const publishedTechnicalBase = viewingPublished && snapshotOutput?.trace
    ? [snapshotOutput.trace.cropProfileCode, snapshotOutput.trace.cropProfileVersion].filter(Boolean).join(" · ") || null
    : null;
  const displayPoints: DisplayPoint[] = viewingPublished
    ? (publishedSnapshotV3?.pointsSnapshot ?? [])
    : points;
  const displayBoundary = viewingPublished ? (publishedSnapshotV3?.publishedContext.fieldBoundary ?? null) : analysis.fieldBoundary;
  const displayNarrative = viewingPublished ? (publishedSnapshotV3?.approvedNarrative ?? null) : currentNarrative;
  const displayPrescription = viewingPublished ? (publishedSnapshotV3?.approvedPrescription ?? null) : currentPrescription;
  const reportMapPoints: MapPoint[] = displayPoints.map((point) => ({
    ...point,
    sequence: null,
    observedLatitude: point.observedLatitude ?? null,
    observedLongitude: point.observedLongitude ?? null,
    subsampleCount: null,
    accuracyM: point.accuracyM ?? null,
    gpsSource: point.gpsSource ?? null,
    notes: null,
    labResultCount: 0,
  }));
  const observedPointCount = reportMapPoints.filter((point) => pointPositionKind(point) === "OBSERVED").length;
  const auditedPointCount = reportMapPoints.filter((point) => pointPositionKind(point) === "AUDITED_SOURCE").length;
  const plannedPointCount = reportMapPoints.filter((point) => pointPositionKind(point) === "PLANNED").length;
  const pointProvenanceLabel = (point: MapPoint) => {
    const kind = pointPositionKind(point);
    if (kind === "OBSERVED") return "Posição observada em campo";
    if (kind === "AUDITED_SOURCE") return "Importação espacial auditada";
    return viewingPublished && point.observedLatitude == null && point.observedLongitude == null && !point.gpsSource
      ? "Origem não capturada no snapshot"
      : "Planejada / estimada";
  };
  const collectedCount = reportMapPoints.filter((point) => point.collectedAt).length;
  const reportSampleCount = reportMapPoints.length > 0
    ? reportMapPoints.length
    : new Set(displayInterpretation.map((row) => row.sampleCode)).size;

  if (requestedPublished && !canShowPublishedView) {
    const reason = !publishedInfo
      ? "Não existe uma versão oficial publicada para esta análise."
      : integrityFailed
        ? "O arquivo publicado falhou na verificação de integridade. Por segurança, o conteúdo atual não será mostrado no lugar dele."
        : publishedInfo.readError
          ? `O snapshot oficial não pôde ser lido: ${publishedInfo.readError}`
          : "O snapshot oficial não está disponível em formato verificável.";
    return (
      <>
        <Topbar eyebrow="Relatórios" title="Versão publicada">
          <Link href="/relatorios" className="button ghost no-print">Voltar</Link>
        </Topbar>
        <div className="content-wrap">
          <section className="simple-result-integrity-error">
            <span><Icon name="warning" size={28}/></span>
            <div>
              <h1>Não foi possível abrir a versão publicada.</h1>
              <p>{reason}</p>
              <p>A versão atual permanece separada e não é usada como substituta do documento oficial.</p>
            </div>
            <Link href={`/relatorios/talhao/${analysisId}`} className="button secondary no-print">Abrir somente o rascunho atual</Link>
          </section>
        </div>
      </>
    );
  }

  return (
    <>
      <Topbar eyebrow="Relatórios" title="Decisão agronômica">
        <Link href="/relatorios" className="button ghost no-print">Voltar</Link>
      </Topbar>
      <div className="content-wrap">
        <div className="report-toolbar no-print">
          <span className="report-empty-note">Entrega técnica construída com dados persistidos, regras homologadas e revisão profissional.</span>
          <div style={{ display: "flex", gap: 10 }}>
            {interpretation && publicationReadiness?.allowed && REVIEW_ROLES.has(session.role) && <PublishReportButton interpretationId={interpretation.id} analysisId={analysisId} initialCommercialPlanSnapshotId={publishedSnapshotV3?.commercialPlanSnapshot?.id ?? ""}/>}
            {!(query.versao === "publicada" && integrityFailed) && <PrintButton/>}
          </div>
        </div>

        {interpretation?.status === "APPROVED" && publicationReadiness && !publicationReadiness.allowed && (
          <div className="report-toolbar no-print">
            <span className="report-empty-note"><Icon name="shield" size={12}/> <strong>Entrega oficial bloqueada:</strong> {publicationReadiness.reason}</span>
          </div>
        )}

        {!viewingPublished && interpretation && !interpretationCurrent && (
          <div className="report-toolbar no-print">
            <span className="report-empty-note"><Icon name="warning" size={12}/> <strong>Interpretação histórica:</strong> {evidence.freshness.reason ?? "A evidência ou regra agronômica mudou depois desta revisão."} Os resultados laboratoriais permanecem visíveis, mas classificação, síntese e recomendação antigas não são apresentadas como decisão corrente.</span>
          </div>
        )}

        {!viewingPublished && narrative && !narrativeCurrent && (
          <div className="report-toolbar no-print">
            <span className="report-empty-note"><Icon name="warning" size={12}/> A síntese assistida mais recente permanece no histórico, mas não representa a interpretação corrente.</span>
          </div>
        )}

        {!viewingPublished && prescription && !prescriptionCurrent && (
          <div className="report-toolbar no-print">
            <span className="report-empty-note"><Icon name="warning" size={12}/> A prescrição mais recente permanece no histórico, mas não é usada como recomendação corrente neste documento.</span>
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
        ) : !publishedInterpretationIsCurrent ? (
          <div className="report-toolbar no-print"><span className="report-empty-note"><Icon name="warning" size={12}/> Atenção: existe uma versão publicada (revisão #{publishedReport.interpretationRevision}, {new Date(publishedReport.publishedAt).toLocaleString("pt-BR")}, por {publishedReport.publishedByName ?? "—"}), mas os dados foram recalculados depois (revisão atual #{interpretation?.revision}). Esta tela mostra o dado ATUAL por padrão — use "Versão publicada" acima para ver exatamente o que foi publicado.</span></div>
        ) : !sameDecisionAsPublished ? (
          <div className="report-toolbar no-print"><span className="report-empty-note"><Icon name="warning" size={12}/> {isPremiumPublishedSnapshot ? "A interpretação atual é a mesma da versão publicada, mas a recomendação atual é diferente da recomendação congelada naquele snapshot. Esta decisão atual continua como rascunho até uma nova publicação passar pelos gates oficiais." : "A interpretação atual coincide com uma publicação legada, mas esse formato não congelava a recomendação aprovada. Por segurança, não tratamos a decisão atual como já publicada; gere uma nova versão oficial no formato atual."}</span></div>
        ) : (
          <div className="report-toolbar no-print"><span className="report-empty-note"><Icon name="check" size={12}/> A decisão técnica atual (interpretação #{interpretation?.revision} + recomendação aprovada corrente) é a mesma que foi congelada em {new Date(publishedReport.publishedAt).toLocaleString("pt-BR")} por {publishedReport.publishedByName ?? "—"}. Para consultar a entrega oficial e verificar sua integridade, use "Versão publicada".</span></div>
        )}

        <FinalVisualReport
          context={contextUnavailable ? {} : displayContext}
          branding={displayBranding}
          facts={displayFacts}
          interpretationRows={displayInterpretation}
          points={reportMapPoints}
          boundary={displayBoundary}
          narrativeSummary={displayNarrative?.responsePayload?.narrative?.summary ?? null}
          prescription={displayPrescription?.responsePayload?.prescription ?? null}
          interpretationStatus={viewingPublished ? "APPROVED" : interpretationCurrent ? interpretation?.status ?? null : null}
          prescriptionStatus={displayPrescription?.status ?? null}
          confidence={displayConfidence ?? null}
          viewingPublished={viewingPublished}
          currentStatusLabel={meta.label}
          generatedAt={viewingPublished ? new Date(publishedInfo!.report.publishedAt).toLocaleString("pt-BR") : new Date().toLocaleString("pt-BR")}
          interpretationRevision={viewingPublished ? (publishedSnapshotV3?.revision ?? publishedSnapshotV2?.revision ?? publishedReport?.interpretationRevision ?? null) : interpretation?.revision ?? null}
          responsibleName={viewingPublished ? displayPrescription?.reviewedByName ?? null : interpretation?.approvedByName || interpretation?.reviewedByName || null}
          technicalBase={viewingPublished ? publishedTechnicalBase : interpretation?.cropProfileName ?? null}
          publishedByName={viewingPublished ? publishedInfo?.report.publishedByName ?? null : null}
          publishedAt={viewingPublished ? new Date(publishedInfo!.report.publishedAt).toLocaleString("pt-BR") : null}
          publishedHashPrefix={viewingPublished ? publishedInfo?.report.sha256.slice(0, 12) ?? null : null}
          commercialPlanSnapshot={viewingPublished ? publishedSnapshotV3?.commercialPlanSnapshot ?? null : null}
        />
      </div>
    </>
  );
}
