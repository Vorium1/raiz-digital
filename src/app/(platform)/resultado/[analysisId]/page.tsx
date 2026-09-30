import Link from "next/link";
import { notFound } from "next/navigation";
import { FinalVisualReport } from "@/components/report-final-visual";
import { Icon } from "@/components/icon";
import { PrintButton } from "@/components/print-button";
import { SimplePublishResultButton } from "@/components/simple-publish-result-button";
import type { MapPoint } from "@/components/spatial-map-types";
import { requirePlatformSession } from "@/lib/auth/session";
import { getPublishedReportSnapshot, type ReportSnapshotV2 } from "@/lib/repositories/reports";
import type { PremiumReportSnapshotV3 } from "@/lib/repositories/premium-report-publication";

export const metadata = { title: "Resultado" };

const TECHNICAL_DETAIL_ROLES = new Set(["SUPER_ADMIN", "TENANT_ADMIN", "AGRONOMIST", "FIELD_TECH"]);

type StructuredOutput = {
  facts?: Array<{
    sampleCode: string;
    parameterCode: string;
    value: number;
    unit: string;
    method: string;
    sampleType?: string | null;
    depthFromCm?: number | null;
    depthToCm?: number | null;
    source?: string;
  }>;
  interpretation?: Array<{
    sampleCode: string;
    parameterCode: string;
    interpretable: boolean;
    classification?: string;
    reason?: string;
  }>;
  confidence?: { score: number; level: string };
  trace?: {
    cropProfileCode?: string | null;
    cropProfileVersion?: string | null;
    generatedAt?: string | null;
  };
};

function isV3(value: unknown): value is PremiumReportSnapshotV3 {
  return Boolean(
    value
    && typeof value === "object"
    && (value as { reportSnapshotVersion?: number }).reportSnapshotVersion === 3
  );
}

function isV2(value: unknown): value is ReportSnapshotV2 {
  return Boolean(
    value
    && typeof value === "object"
    && (value as { reportSnapshotVersion?: number }).reportSnapshotVersion === 2
  );
}

export default async function ResultadoPage({ params }: { params: Promise<{ analysisId: string }> }) {
  const { analysisId } = await params;
  const session = await requirePlatformSession();
  const canViewTechnical = TECHNICAL_DETAIL_ROLES.has(session.role);
  const published = await getPublishedReportSnapshot(session.tenantId, analysisId, session.userId);
  if (!published.found) notFound();

  if (published.hashVerified !== true || !published.snapshot) {
    return (
      <div className="simple-result-page">
        <div className="simple-result-back"><Link href="/resultados"><Icon name="arrow" size={15}/> Resultados</Link></div>
        <section className="simple-result-integrity-error">
          <span><Icon name="warning" size={28}/></span>
          <div>
            <h1>Não foi possível validar este resultado.</h1>
            <p>Por segurança, a RAIZ não mostra uma versão oficial quando não consegue confirmar que o arquivo publicado está íntegro.</p>
          </div>
          {canViewTechnical && <Link href={`/relatorios/talhao/${analysisId}?versao=publicada`}>Ver detalhes técnicos</Link>}
        </section>
      </div>
    );
  }

  const snapshot: unknown = published.snapshot;
  const v3 = isV3(snapshot) ? snapshot : null;
  const v2 = isV2(snapshot) ? snapshot : null;
  const context = v3?.publishedContext ?? v2?.publishedContext ?? null;

  if (!context) {
    return (
      <div className="simple-result-page">
        <div className="simple-result-back"><Link href="/resultados"><Icon name="arrow" size={15}/> Resultados</Link></div>
        <section className="simple-result-integrity-error legacy">
          <span><Icon name="file" size={28}/></span>
          <div>
            <h1>Resultado de uma versão anterior.</h1>
            <p>Este documento foi publicado antes do formato atual e não contém contexto suficiente para reproduzir o relatório conceitual sem misturar dados novos.</p>
          </div>
          {canViewTechnical && <Link href={`/relatorios/talhao/${analysisId}?versao=publicada`}>Abrir versão técnica publicada</Link>}
        </section>
      </div>
    );
  }

  const structured = (v3?.structuredOutput ?? v2?.structuredOutput ?? {}) as StructuredOutput;
  const branding = v3?.brandingSnapshot ?? v2!.brandingSnapshot;
  const prescription = v3?.approvedPrescription?.responsePayload?.prescription ?? null;
  const narrative = v3?.approvedNarrative?.responsePayload?.narrative ?? null;
  const points: MapPoint[] = (v3?.pointsSnapshot ?? []).map((point) => ({
    id: point.id,
    code: point.code,
    sequence: null,
    latitude: point.latitude,
    longitude: point.longitude,
    observedLatitude: point.observedLatitude ?? null,
    observedLongitude: point.observedLongitude ?? null,
    collectedAt: point.collectedAt,
    depthFromCm: point.depthFromCm,
    depthToCm: point.depthToCm,
    subsampleCount: null,
    accuracyM: point.accuracyM ?? null,
    gpsSource: point.gpsSource,
    notes: null,
    labResultCount: 0,
  }));

  const technicalBase = structured.trace
    ? [structured.trace.cropProfileCode, structured.trace.cropProfileVersion].filter(Boolean).join(" · ") || null
    : null;
  const responsibleName = v3?.approvedPrescription.reviewedByName ?? published.report.publishedByName ?? null;
  const publishedAt = new Date(published.report.publishedAt).toLocaleString("pt-BR");

  return (
    <div className="simple-result-page concept-result-host">
      <div className="concept-result-toolbar no-print">
        <Link href="/resultados"><Icon name="arrow" size={15}/> Resultados</Link>
        <div>
          <PrintButton/>
          {canViewTechnical && (
            <SimplePublishResultButton
              analysisId={analysisId}
              label="Atualizar laudo com dados atuais"
              busyLabel="Atualizando laudo…"
              initialCommercialPlanSnapshotId={v3?.commercialPlanSnapshot?.id ?? ""}
            />
          )}
          {canViewTechnical && <Link href={`/relatorios/talhao/${analysisId}?versao=publicada`} className="simple-result-technical-link">Detalhes técnicos</Link>}
        </div>
      </div>

      <FinalVisualReport
        context={context}
        branding={branding}
        facts={structured.facts ?? []}
        interpretationRows={structured.interpretation ?? []}
        points={points}
        boundary={v3?.publishedContext.fieldBoundary ?? null}
        narrativeSummary={narrative?.summary ?? null}
        prescription={prescription}
        interpretationStatus="APPROVED"
        prescriptionStatus={v3?.approvedPrescription.status ?? null}
        confidence={structured.confidence ?? null}
        viewingPublished={true}
        currentStatusLabel="Publicado"
        generatedAt={publishedAt}
        interpretationRevision={v3?.revision ?? v2?.revision ?? published.report.revision}
        responsibleName={responsibleName}
        technicalBase={technicalBase}
        publishedByName={published.report.publishedByName ?? null}
        publishedAt={publishedAt}
        publishedHashPrefix={published.report.sha256.slice(0, 12)}
        commercialPlanSnapshot={v3?.commercialPlanSnapshot ?? null}
        ndviSnapshot={v3?.ndviSnapshot ?? null}
      />
    </div>
  );
}
