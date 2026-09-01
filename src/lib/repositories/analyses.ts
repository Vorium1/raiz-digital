import { randomBytes } from "node:crypto";
import { withTenant } from "@/lib/db";
import { writeAudit } from "@/lib/repositories/audit";

function analysisCode() {
  const year = new Date().getFullYear();
  return `AN-${year}-${randomBytes(3).toString("hex").toUpperCase()}`;
}

export async function listAnalyses(tenantId: string, userId?: string) {
  return withTenant({ tenantId, userId }, async (client) => {
    const result = await client.query(
      `SELECT a.id::text, a.code, a.status::text, a.confidence_score::float8 AS "confidenceScore",
              a.created_at::text AS "createdAt", a.updated_at::text AS "updatedAt",
              c.name AS "clientName", p.name AS "propertyName", f.name AS "fieldName", f.area_ha::float8 AS "areaHa",
              cs.season_label AS "seasonLabel", cs.current_crop AS "currentCrop", cs.next_crop AS "nextCrop"
       FROM analyses a
       JOIN crop_seasons cs ON cs.tenant_id = a.tenant_id AND cs.id = a.crop_season_id
       JOIN fields f ON f.tenant_id = cs.tenant_id AND f.id = cs.field_id
       JOIN properties p ON p.tenant_id = f.tenant_id AND p.id = f.property_id
       JOIN clients c ON c.tenant_id = p.tenant_id AND c.id = p.client_id
       ORDER BY a.updated_at DESC
       LIMIT 200`,
    );
    return result.rows;
  });
}

export async function createAnalysis(input: {
  tenantId: string;
  userId: string;
  cropSeasonId: string;
  collectionOrderId?: string | null;
  laboratoryId?: string | null;
  sourceType?: "INTEGRATION" | "CSV" | "XLSX" | "PDF_OCR" | "MANUAL" | null;
}) {
  return withTenant({ tenantId: input.tenantId, userId: input.userId }, async (client) => {
    const code = analysisCode();
    const result = await client.query(
      `INSERT INTO analyses
       (tenant_id, crop_season_id, collection_order_id, laboratory_id, code, source_type, created_by)
       VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5, $6, $7::uuid)
       RETURNING id::text, code, status::text, created_at::text AS "createdAt"`,
      [input.tenantId, input.cropSeasonId, input.collectionOrderId ?? null, input.laboratoryId ?? null, code, input.sourceType ?? null, input.userId],
    );
    const created = result.rows[0];
    await writeAudit(client, {
      tenantId: input.tenantId,
      userId: input.userId,
      action: "ANALYSIS_CREATED",
      entityType: "analysis",
      entityId: created.id,
      metadata: { code },
    });
    return created;
  });
}

export async function getAnalysisById(tenantId: string, analysisId: string, userId?: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(analysisId)) return null;
  return withTenant({ tenantId, userId }, async (client) => {
    const result = await client.query(
      `SELECT a.id::text, a.code, a.status::text, a.source_type AS "sourceType",
              a.confidence_score::float8 AS "confidenceScore", a.confidence_level AS "confidenceLevel",
              a.created_at::text AS "createdAt", a.updated_at::text AS "updatedAt",
              c.name AS "clientName", p.name AS "propertyName", p.municipality, p.state,
              f.name AS "fieldName", f.area_ha::float8 AS "areaHa",
              cs.season_label AS "seasonLabel", cs.current_crop AS "currentCrop", cs.next_crop AS "nextCrop",
              cs.yield_goal::float8 AS "yieldGoal", cs.yield_goal_unit AS "yieldGoalUnit",
              co.code AS "collectionCode", l.name AS "laboratoryName",
              (SELECT count(*)::int FROM analysis_imports ai WHERE ai.tenant_id = a.tenant_id AND ai.analysis_id = a.id) AS "importCount",
              (SELECT count(*)::int FROM lab_samples ls WHERE ls.tenant_id = a.tenant_id AND ls.analysis_id = a.id) AS "labSampleCount",
              (SELECT count(*)::int FROM interpretations i WHERE i.tenant_id = a.tenant_id AND i.analysis_id = a.id) AS "interpretationCount"
       FROM analyses a
       JOIN crop_seasons cs ON cs.tenant_id = a.tenant_id AND cs.id = a.crop_season_id
       JOIN fields f ON f.tenant_id = cs.tenant_id AND f.id = cs.field_id
       JOIN properties p ON p.tenant_id = f.tenant_id AND p.id = f.property_id
       JOIN clients c ON c.tenant_id = p.tenant_id AND c.id = p.client_id
       LEFT JOIN collection_orders co ON co.tenant_id = a.tenant_id AND co.id = a.collection_order_id
       LEFT JOIN laboratories l ON l.id = a.laboratory_id
       WHERE a.id = $1::uuid
       LIMIT 1`,
      [analysisId],
    );
    return result.rows[0] ?? null;
  });
}
