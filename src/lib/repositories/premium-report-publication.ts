import { createHash } from "node:crypto";
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

/**
 * Publicação premium da decisão agronômica. Diferente do snapshot v2, congela também a recomendação
 * APROVADA da mesma interpretação, eventual síntese aprovada, contorno do talhão e pontos de amostragem.
 * Assim, reabrir a versão oficial não precisa buscar conteúdo vivo para reconstruir o que foi entregue.
 */
export async function publishPremiumFieldAnalysisReport(input: { tenantId: string; userId: string; interpretationId: string }) {
  return withTenant({ tenantId: input.tenantId, userId: input.userId }, async (client) => {
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
    if (interpretation.status !== "APPROVED") {
      throw new ReportError("Só é possível publicar uma decisão com interpretação aprovada pelo responsável técnico.", 409);
    }

    const prescriptionResult = await client.query(
      `SELECT g.id::text, g.status::text, g.response_payload AS "responsePayload",
              g.reviewed_at::text AS "reviewedAt", reviewer.name AS "reviewedByName",
              g.prompt_version AS "promptVersion", g.provider, g.model
       FROM ai_generations g
       LEFT JOIN users reviewer ON reviewer.id=g.reviewed_by
       WHERE g.tenant_id=$1::uuid
         AND g.analysis_id=$2::uuid
         AND g.interpretation_id=$3::uuid
         AND g.kind='AGRONOMIC_PRESCRIPTION'
         AND g.status='APPROVED'
       ORDER BY g.reviewed_at DESC NULLS LAST, g.created_at DESC
       LIMIT 1`,
      [input.tenantId, interpretation.analysisId, interpretation.id],
    );
    const approvedPrescription = prescriptionResult.rows[0] as FrozenReviewedGeneration | undefined;
    if (!approvedPrescription) {
      throw new ReportError("A Recomendação Assistida RAIZ da mesma interpretação precisa estar aprovada antes da publicação.", 409);
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
      },
    });
    return report;
  });
}
