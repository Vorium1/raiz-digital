import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import { evaluateAnalysisEvidenceFreshness } from "@/domain/analysis-evidence-freshness";
import { withTenant } from "@/lib/db";
import { saveReportSnapshot } from "@/lib/storage";
import { writeAudit } from "@/lib/repositories/audit";
import { getTenantBranding, type TenantBranding } from "@/lib/repositories/tenant-branding";
import { ReportError, type PublishedReportContext } from "@/lib/repositories/reports";

export const PREMIUM_REPORT_SNAPSHOT_VERSION = 3 as const;

export type PublishedReportContextV3 = PublishedReportContext & {
  collectionOrderId: string | null;
  fieldBoundary: unknown | null;
};

export type FrozenSamplePoint = {
  id: string;
  code: string;
  latitude: number;
  longitude: number;
  /** Ausente em snapshots v3 antigos. Novas publicações congelam a captura observada separadamente. */
  observedLatitude?: number | null;
  observedLongitude?: number | null;
  accuracyM?: number | null;
  depthFromCm: number;
  depthToCm: number;
  collectedAt: string | null;
  gpsSource: string | null;
};

export type FrozenNdviSnapshot = {
  id: string;
  capturedAt: string;
  createdAt: string;
  rasterArchivedAt: string | null;
  source: string;
  cloudCoverPct: number | null;
  pixelCount: number;
  meanNdvi: number;
  minNdvi: number;
  maxNdvi: number;
  stddevNdvi: number | null;
  zoneBreakdownPct: Record<string, number>;
  rasterArchived: boolean;
};

export type FrozenReviewedGeneration = {
  id: string;
  status: "APPROVED";
  responsePayload: any;
  reviewedAt: string | null;
  reviewedByName: string | null;
  promptVersion: string | null;
  provider: string | null;
  model: string | null;
};

export type PremiumReportSnapshotV3 = {
  reportSnapshotVersion: 3;
  interpretationId: string;
  revision: number;
  publishedContext: PublishedReportContextV3;
  structuredOutput: unknown;
  brandingSnapshot: TenantBranding;
  pointsSnapshot: FrozenSamplePoint[];
  ndviSnapshot?: FrozenNdviSnapshot | null;
  approvedNarrative: FrozenReviewedGeneration | null;
  approvedPrescription: FrozenReviewedGeneration;
  publishedAt: string;
  publishedBy: string;
};

type CurrentPublicationState = {
  analysisId: string;
  interpretationStatus: string;
  interpretationCreatedAt: string;
  interpretationCropProfileId: string | null;
  currentCropProfileId: string | null;
  latestInterpretationId: string | null;
  latestImportCommittedAt: string | null;
  latestRuleUpdatedAt: string | null;
  sourceHumanVerified: boolean;
  sourceVerificationRequired: boolean;
  cropSeasonUpdatedAt: string;
  prescriptionId: string | null;
  prescriptionStatus: string | null;
  prescriptionCreatedAt: string | null;
};

async function assertCurrentPublicationState(
  client: PoolClient,
  input: { tenantId: string; interpretationId: string; expectedPrescriptionId?: string | null },
): Promise<CurrentPublicationState> {
  const result = await client.query<CurrentPublicationState>(
    `SELECT i.analysis_id::text AS "analysisId",
            i.status::text AS "interpretationStatus",
            i.created_at::text AS "interpretationCreatedAt",
            i.crop_profile_id::text AS "interpretationCropProfileId",
            cs.crop_profile_id::text AS "currentCropProfileId",
            latest_i.id::text AS "latestInterpretationId",
            latest_import.latest_import_at::text AS "latestImportCommittedAt",
            rule_state.latest_rule_updated_at::text AS "latestRuleUpdatedAt",
            a.source_human_verified AS "sourceHumanVerified",
            t.require_source_human_verification AS "sourceVerificationRequired",
            cs.updated_at::text AS "cropSeasonUpdatedAt",
            prescription.id::text AS "prescriptionId",
            prescription.status::text AS "prescriptionStatus",
            prescription.created_at::text AS "prescriptionCreatedAt"
     FROM interpretations i
     JOIN analyses a ON a.tenant_id=i.tenant_id AND a.id=i.analysis_id
     JOIN crop_seasons cs ON cs.tenant_id=a.tenant_id AND cs.id=a.crop_season_id
     LEFT JOIN crop_profiles cp ON cp.id=cs.crop_profile_id
     JOIN tenants t ON t.id=i.tenant_id
     LEFT JOIN LATERAL (
       SELECT li.id
       FROM interpretations li
       WHERE li.tenant_id=i.tenant_id AND li.analysis_id=i.analysis_id
       ORDER BY li.revision DESC
       LIMIT 1
     ) latest_i ON true
     LEFT JOIN LATERAL (
       SELECT max(coalesce(ai.committed_at, ai.created_at)) AS latest_import_at
       FROM analysis_imports ai
       WHERE ai.tenant_id=i.tenant_id AND ai.analysis_id=i.analysis_id
     ) latest_import ON true
     LEFT JOIN LATERAL (
       SELECT greatest(cp.updated_at, coalesce(max(cpp.updated_at), cp.updated_at)) AS latest_rule_updated_at
       FROM crop_profile_parameters cpp
       WHERE cpp.crop_profile_id=cp.id
     ) rule_state ON cp.id IS NOT NULL
     LEFT JOIN LATERAL (
       SELECT ag.id, ag.status, ag.created_at
       FROM ai_generations ag
       WHERE ag.tenant_id=i.tenant_id
         AND ag.analysis_id=i.analysis_id
         AND ag.interpretation_id=i.id
         AND ag.kind='AGRONOMIC_PRESCRIPTION'
       ORDER BY ag.created_at DESC
       LIMIT 1
     ) prescription ON true
     WHERE i.tenant_id=$1::uuid AND i.id=$2::uuid
     LIMIT 1
     FOR UPDATE OF i
     FOR SHARE OF a, cs`,
    [input.tenantId, input.interpretationId],
  );
  const state = result.rows[0];
  if (!state) throw new ReportError("Interpretação não encontrada.", 404);
  if (state.interpretationStatus !== "APPROVED") {
    throw new ReportError("Só é possível publicar uma decisão com interpretação aprovada pelo responsável técnico.", 409);
  }
  if (state.latestInterpretationId !== input.interpretationId) {
    throw new ReportError("Esta interpretação foi superada por uma revisão mais recente. Publique somente a revisão atual aprovada.", 409);
  }

  const evidenceFreshness = evaluateAnalysisEvidenceFreshness({
    interpretationCreatedAt: state.interpretationCreatedAt,
    latestImportCommittedAt: state.latestImportCommittedAt,
    interpretationCropProfileId: state.interpretationCropProfileId,
    currentCropProfileId: state.currentCropProfileId,
    latestRuleUpdatedAt: state.latestRuleUpdatedAt,
  });
  if (!evidenceFreshness.current) {
    throw new ReportError(
      evidenceFreshness.reason ?? "Os dados ou as regras agronômicas mudaram depois desta análise. Atualize antes de publicar.",
      409,
    );
  }

  if (state.sourceVerificationRequired && !state.sourceHumanVerified) {
    throw new ReportError("A política desta empresa exige conferência humana do arquivo original do laudo antes da publicação.", 409);
  }
  if (!state.prescriptionId || state.prescriptionStatus !== "APPROVED") {
    throw new ReportError("A conclusão técnica mais recente da mesma interpretação precisa estar aprovada antes da publicação.", 409);
  }
  if (input.expectedPrescriptionId && state.prescriptionId !== input.expectedPrescriptionId) {
    throw new ReportError("A conclusão técnica mudou durante a publicação. Atualize a análise e tente novamente.", 409);
  }
  if (!state.prescriptionCreatedAt || new Date(state.prescriptionCreatedAt).getTime() < new Date(state.cropSeasonUpdatedAt).getTime()) {
    throw new ReportError("A conclusão técnica aprovada foi preparada com um contexto agronômico anterior. Prepare e aprove uma nova versão antes de publicar.", 409);
  }
  return state;
}

type ExistingDecisionPublication = {
  id: string;
  revision: number;
  storageKey: string;
  publishedAt: string;
};

async function getLatestDecisionPublication(
  client: PoolClient,
  input: { tenantId: string; interpretationId: string; prescriptionId: string },
): Promise<ExistingDecisionPublication | null> {
  const existing = await client.query<ExistingDecisionPublication>(
    `SELECT r.id::text, r.revision, r.storage_key AS "storageKey", r.published_at::text AS "publishedAt"
     FROM reports r
     WHERE r.tenant_id=$1::uuid
       AND r.interpretation_id=$2::uuid
       AND r.prescription_generation_id=$3::uuid
     ORDER BY r.published_at DESC
     LIMIT 1`,
    [input.tenantId, input.interpretationId, input.prescriptionId],
  );
  return existing.rows[0] ?? null;
}

/**
 * Publicação premium da decisão agronômica. Diferente do snapshot v2, congela também a recomendação
 * APROVADA da mesma interpretação, eventual síntese aprovada, contorno do talhão e pontos de amostragem.
 * Assim, reabrir a versão oficial não precisa buscar conteúdo vivo para reconstruir o que foi entregue.
 *
 * A entrega falha fechada se a interpretação, o laudo, a recomendação, o contexto da safra ou a
 * confirmação de fonte mudarem durante o processo. A interpretação fica bloqueada para atualização pela
 * transação inteira, serializando publicações concorrentes da mesma decisão; análise/safra permanecem
 * protegidas por lock compartilhado. `reports.prescription_generation_id` e seu índice UNIQUE reforçam
 * no banco que uma mesma decisão só nasce uma vez. O snapshot no storage é imutável; se uma falha ocorrer
 * na gravação externa, nenhum registro oficial incompleto nasce em `reports`.
 */
export async function publishPremiumFieldAnalysisReport(input: { tenantId: string; userId: string; interpretationId: string }) {
  return withTenant({ tenantId: input.tenantId, userId: input.userId }, async (client) => {
    const initialState = await assertCurrentPublicationState(client, {
      tenantId: input.tenantId,
      interpretationId: input.interpretationId,
    });
    const currentPrescriptionId = initialState.prescriptionId;
    if (!currentPrescriptionId) {
      throw new ReportError("A decisão atual não possui conclusão técnica aprovada para publicação.", 409);
    }

    const interpretationResult = await client.query(
      `SELECT i.id::text, i.analysis_id::text AS "analysisId", i.revision, i.status::text,
              i.structured_output AS "structuredOutput"
       FROM interpretations i
       WHERE i.tenant_id=$1::uuid AND i.id=$2::uuid
       LIMIT 1`,
      [input.tenantId, input.interpretationId],
    );
    const interpretation = interpretationResult.rows[0];
    if (!interpretation) throw new ReportError("Interpretação não encontrada.", 404);

    const prescriptionResult = await client.query(
      `SELECT g.id::text, g.status::text, g.response_payload AS "responsePayload",
              g.reviewed_at::text AS "reviewedAt", reviewer.name AS "reviewedByName",
              g.prompt_version AS "promptVersion", g.provider, g.model
       FROM ai_generations g
       LEFT JOIN users reviewer ON reviewer.id=g.reviewed_by
       WHERE g.tenant_id=$1::uuid
         AND g.id=$2::uuid
         AND g.kind='AGRONOMIC_PRESCRIPTION'
       LIMIT 1`,
      [input.tenantId, currentPrescriptionId],
    );
    const approvedPrescription = prescriptionResult.rows[0] as FrozenReviewedGeneration | undefined;
    if (!approvedPrescription || approvedPrescription.status !== "APPROVED") {
      throw new ReportError("A conclusão técnica atual deixou de estar aprovada durante a publicação.", 409);
    }

    const narrativeResult = await client.query(
      `SELECT g.id::text, g.status::text, g.response_payload AS "responsePayload",
              g.reviewed_at::text AS "reviewedAt", reviewer.name AS "reviewedByName",
              g.prompt_version AS "promptVersion", g.provider, g.model
       FROM ai_generations g
       LEFT JOIN users reviewer ON reviewer.id=g.reviewed_by
       WHERE g.tenant_id=$1::uuid
         AND g.analysis_id=$2::uuid
         AND g.interpretation_id=$3::uuid
         AND g.kind='AGRONOMIC_NARRATIVE'
         AND g.status='APPROVED'
       ORDER BY g.reviewed_at DESC NULLS LAST, g.created_at DESC
       LIMIT 1`,
      [input.tenantId, interpretation.analysisId, interpretation.id],
    );
    const approvedNarrative = (narrativeResult.rows[0] as FrozenReviewedGeneration | undefined) ?? null;

    const contextResult = await client.query<PublishedReportContextV3>(
      `SELECT a.id::text, a.code, a.status::text, a.confidence_score::float8 AS "confidenceScore", a.confidence_level AS "confidenceLevel",
              a.created_at::text AS "createdAt", a.updated_at::text AS "updatedAt", a.collection_order_id::text AS "collectionOrderId",
              c.name AS "clientName", p.name AS "propertyName", p.municipality, p.state,
              f.id::text AS "fieldId", f.name AS "fieldName", f.area_ha::float8 AS "areaHa", ST_AsGeoJSON(f.boundary)::json AS "fieldBoundary",
              cs.season_label AS "seasonLabel", cs.current_crop AS "currentCrop", cs.next_crop AS "nextCrop", cp.name AS "cropProfileName", cs.cultivar, cs.management_system AS "managementSystem",
              cs.soil_texture AS "soilTexture", cs.yield_goal::float8 AS "yieldGoal", cs.yield_goal_unit AS "yieldGoalUnit",
              l.name AS "laboratoryName"
       FROM analyses a
       JOIN crop_seasons cs ON cs.tenant_id=a.tenant_id AND cs.id=a.crop_season_id
       LEFT JOIN crop_profiles cp ON cp.id=cs.crop_profile_id
       JOIN fields f ON f.tenant_id=cs.tenant_id AND f.id=cs.field_id
       JOIN properties p ON p.tenant_id=f.tenant_id AND p.id=f.property_id
       JOIN clients c ON c.tenant_id=p.tenant_id AND c.id=p.client_id
       LEFT JOIN laboratories l ON l.id=a.laboratory_id
       WHERE a.tenant_id=$1::uuid AND a.id=$2::uuid
       LIMIT 1`,
      [input.tenantId, interpretation.analysisId],
    );
    const publishedContext = contextResult.rows[0];
    if (!publishedContext) throw new ReportError("Contexto da análise não encontrado.", 404);

    const pointsResult = publishedContext.collectionOrderId
      ? await client.query<FrozenSamplePoint>(
          `SELECT sp.id::text, sp.code,
                  ST_Y(sp.position)::float8 AS latitude, ST_X(sp.position)::float8 AS longitude,
                  CASE WHEN sp.observed_position IS NULL THEN NULL ELSE ST_Y(sp.observed_position)::float8 END AS "observedLatitude",
                  CASE WHEN sp.observed_position IS NULL THEN NULL ELSE ST_X(sp.observed_position)::float8 END AS "observedLongitude",
                  sp.accuracy_m::float8 AS "accuracyM",
                  sp.depth_from_cm::float8 AS "depthFromCm", sp.depth_to_cm::float8 AS "depthToCm",
                  sp.collected_at::text AS "collectedAt", sp.gps_source AS "gpsSource"
           FROM sample_points sp
           WHERE sp.tenant_id=$1::uuid AND sp.collection_order_id=$2::uuid
           ORDER BY sp.sequence NULLS LAST, sp.code`,
          [input.tenantId, publishedContext.collectionOrderId],
        )
      : { rows: [] as FrozenSamplePoint[] };

    const ndviResult = await client.query<FrozenNdviSnapshot>(
      `SELECT id::text,
              captured_at::text AS "capturedAt",
              created_at::text AS "createdAt",
              raster_archived_at::text AS "rasterArchivedAt",
              source,
              cloud_cover_pct::float8 AS "cloudCoverPct",
              pixel_count AS "pixelCount",
              mean_ndvi::float8 AS "meanNdvi",
              min_ndvi::float8 AS "minNdvi",
              max_ndvi::float8 AS "maxNdvi",
              stddev_ndvi::float8 AS "stddevNdvi",
              zone_breakdown_pct AS "zoneBreakdownPct",
              (raster_object_key IS NOT NULL) AS "rasterArchived"
       FROM field_ndvi_snapshots
       WHERE tenant_id=$1::uuid AND field_id=$2::uuid
       ORDER BY captured_at DESC
       LIMIT 1`,
      [input.tenantId, publishedContext.fieldId],
    );
    const ndviSnapshot = ndviResult.rows[0] ?? null;

    const previousReport = await getLatestDecisionPublication(client, {
      tenantId: input.tenantId,
      interpretationId: interpretation.id,
      prescriptionId: approvedPrescription.id,
    });
    if (previousReport) {
      const previousPublishedAt = new Date(previousReport.publishedAt).getTime();
      const ndviEvidenceTimes = ndviSnapshot
        ? [ndviSnapshot.createdAt, ndviSnapshot.rasterArchivedAt]
            .filter((value): value is string => Boolean(value))
            .map((value) => new Date(value).getTime())
            .filter(Number.isFinite)
        : [];
      const ndviChangedAfterPreviousReport = ndviEvidenceTimes.some((value) => value > previousPublishedAt);
      if (!ndviChangedAfterPreviousReport) {
        return { ...previousReport, alreadyCurrent: true as const };
      }
    }

    // Releitura imediatamente antes de congelar o artefato externo.
    await assertCurrentPublicationState(client, {
      tenantId: input.tenantId,
      interpretationId: interpretation.id,
      expectedPrescriptionId: approvedPrescription.id,
    });

    const brandingSnapshot = await getTenantBranding(input.tenantId);
    const publishedAt = new Date().toISOString();
    const snapshotPayload: PremiumReportSnapshotV3 = {
      reportSnapshotVersion: PREMIUM_REPORT_SNAPSHOT_VERSION,
      interpretationId: interpretation.id,
      revision: interpretation.revision,
      publishedContext,
      structuredOutput: interpretation.structuredOutput,
      brandingSnapshot,
      pointsSnapshot: pointsResult.rows,
      ndviSnapshot,
      approvedNarrative,
      approvedPrescription,
      publishedAt,
      publishedBy: input.userId,
    };
    const snapshot = JSON.stringify(snapshotPayload);
    const sha256 = createHash("sha256").update(snapshot).digest("hex");

    // Fail closed também na persistência: sem armazenamento durável não existe publicação oficial.
    const stored = await saveReportSnapshot({
      tenantId: input.tenantId,
      interpretationId: interpretation.id,
      revision: interpretation.revision,
      content: snapshot,
    });
    if (!stored?.key) throw new ReportError("Não foi possível persistir o snapshot oficial do relatório. Publicação cancelada sem criar registro incompleto.", 503);

    // O storage não participa da transação PostgreSQL. Revalidamos depois da escrita externa e antes de
    // criar `reports`; se algo mudou, o objeto fica órfão/inofensivo e nenhuma publicação oficial nasce.
    await assertCurrentPublicationState(client, {
      tenantId: input.tenantId,
      interpretationId: interpretation.id,
      expectedPrescriptionId: approvedPrescription.id,
    });

    const result = await client.query(
      `INSERT INTO reports (tenant_id, interpretation_id, prescription_generation_id, revision, storage_key, sha256, published_at, published_by)
       VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5, $6, $7::timestamptz, $8::uuid)
       RETURNING id::text, revision, storage_key AS "storageKey", published_at::text AS "publishedAt"`,
      [input.tenantId, interpretation.id, approvedPrescription.id, interpretation.revision, stored.key, sha256, publishedAt, input.userId],
    );
    const report = result.rows[0];
    await writeAudit(client, {
      tenantId: input.tenantId,
      userId: input.userId,
      action: "REPORT_PUBLISHED",
      entityType: "report",
      entityId: report.id,
      metadata: {
        interpretationId: interpretation.id,
        analysisId: interpretation.analysisId,
        reportSnapshotVersion: PREMIUM_REPORT_SNAPSHOT_VERSION,
        approvedPrescriptionId: approvedPrescription.id,
        approvedNarrativeId: approvedNarrative?.id ?? null,
        frozenPointCount: pointsResult.rows.length,
        sourceHumanVerified: initialState.sourceHumanVerified,
        sourceVerificationRequired: initialState.sourceVerificationRequired,
        republishedFromReportId: previousReport?.id ?? null,
        ndviEvidenceUpdatedAfterPreviousReport: Boolean(previousReport),
      },
    });
    return { ...report, alreadyCurrent: false as const };
  });
}
