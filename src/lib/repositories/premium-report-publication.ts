import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
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
  depthFromCm: number;
  depthToCm: number;
  collectedAt: string | null;
  gpsSource: string | null;
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
  approvedNarrative: FrozenReviewedGeneration | null;
  approvedPrescription: FrozenReviewedGeneration;
  publishedAt: string;
  publishedBy: string;
};

type CurrentPublicationState = {
  analysisId: string;
  interpretationStatus: string;
  latestInterpretationId: string | null;
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
            latest_i.id::text AS "latestInterpretationId",
            a.source_human_verified AS "sourceHumanVerified",
            t.require_source_human_verification AS "sourceVerificationRequired",
            cs.updated_at::text AS "cropSeasonUpdatedAt",
            prescription.id::text AS "prescriptionId",
            prescription.status::text AS "prescriptionStatus",
            prescription.created_at::text AS "prescriptionCreatedAt"
     FROM interpretations i
     JOIN analyses a ON a.tenant_id=i.tenant_id AND a.id=i.analysis_id
     JOIN crop_seasons cs ON cs.tenant_id=a.tenant_id AND cs.id=a.crop_season_id
     JOIN tenants t ON t.id=i.tenant_id
     LEFT JOIN LATERAL (
       SELECT li.id
       FROM interpretations li
       WHERE li.tenant_id=i.tenant_id AND li.analysis_id=i.analysis_id
       ORDER BY li.revision DESC
       LIMIT 1
     ) latest_i ON true
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
     LIMIT 1`,
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
  if (state.sourceVerificationRequired && !state.sourceHumanVerified) {
    throw new ReportError("A política desta empresa exige conferência humana do arquivo original do laudo antes da publicação.", 409);
  }
  if (!state.prescriptionId || state.prescriptionStatus !== "APPROVED") {
    throw new ReportError("A Recomendação Assistida RAIZ mais recente da mesma interpretação precisa estar aprovada antes da publicação.", 409);
  }
  if (input.expectedPrescriptionId && state.prescriptionId !== input.expectedPrescriptionId) {
    throw new ReportError("A recomendação mudou durante a publicação. Atualize a análise e tente novamente.", 409);
  }
  if (!state.prescriptionCreatedAt || new Date(state.prescriptionCreatedAt).getTime() < new Date(state.cropSeasonUpdatedAt).getTime()) {
    throw new ReportError("A recomendação aprovada foi gerada com um contexto agronômico anterior. Gere e aprove uma nova versão antes de publicar.", 409);
  }
  return state;
}

/**
 * Publicação premium da decisão agronômica. Diferente do snapshot v2, congela também a recomendação
 * APROVADA da mesma interpretação, eventual síntese aprovada, contorno do talhão e pontos de amostragem.
 * Assim, reabrir a versão oficial não precisa buscar conteúdo vivo para reconstruir o que foi entregue.
 *
 * A entrega falha fechada se a interpretação, a recomendação, o contexto da safra ou a confirmação de
 * fonte mudarem durante o processo. O snapshot no storage é imutável; se a evidência mudar exatamente
 * durante a gravação externa, o objeto eventualmente órfão não vira registro oficial em `reports`.
 */
export async function publishPremiumFieldAnalysisReport(input: { tenantId: string; userId: string; interpretationId: string }) {
  return withTenant({ tenantId: input.tenantId, userId: input.userId }, async (client) => {
    const initialState = await assertCurrentPublicationState(client, {
      tenantId: input.tenantId,
      interpretationId: input.interpretationId,
    });

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
      [input.tenantId, initialState.prescriptionId],
    );
    const approvedPrescription = prescriptionResult.rows[0] as FrozenReviewedGeneration | undefined;
    if (!approvedPrescription || approvedPrescription.status !== "APPROVED") {
      throw new ReportError("A Recomendação Assistida RAIZ atual deixou de estar aprovada durante a publicação.", 409);
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
              cs.season_label AS "seasonLabel", cs.current_crop AS "currentCrop", cs.cultivar, cs.management_system AS "managementSystem",
              cs.soil_texture AS "soilTexture", cs.yield_goal::float8 AS "yieldGoal", cs.yield_goal_unit AS "yieldGoalUnit",
              l.name AS "laboratoryName"
       FROM analyses a
       JOIN crop_seasons cs ON cs.tenant_id=a.tenant_id AND cs.id=a.crop_season_id
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
                  sp.depth_from_cm::float8 AS "depthFromCm", sp.depth_to_cm::float8 AS "depthToCm",
                  sp.collected_at::text AS "collectedAt", sp.gps_source AS "gpsSource"
           FROM sample_points sp
           WHERE sp.tenant_id=$1::uuid AND sp.collection_order_id=$2::uuid
           ORDER BY sp.sequence NULLS LAST, sp.code`,
          [input.tenantId, publishedContext.collectionOrderId],
        )
      : { rows: [] as FrozenSamplePoint[] };

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
      `INSERT INTO reports (tenant_id, interpretation_id, revision, storage_key, sha256, published_at, published_by)
       VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6::timestamptz, $7::uuid)
       RETURNING id::text, revision, storage_key AS "storageKey", published_at::text AS "publishedAt"`,
      [input.tenantId, interpretation.id, interpretation.revision, stored.key, sha256, publishedAt, input.userId],
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
      },
    });
    return report;
  });
}
