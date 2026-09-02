import { createHash } from "node:crypto";
import { withTenant } from "@/lib/db";
import { writeAudit } from "@/lib/repositories/audit";
import { saveReportSnapshot } from "@/lib/storage";

export class ReportError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
    this.name = "ReportError";
  }
}

/** Relatório de análise por talhão: fecha o elo interpretação -> relatório da rastreabilidade. */
export async function getFieldAnalysisReportData(tenantId: string, analysisId: string, userId?: string) {
  return withTenant({ tenantId, userId }, async (client) => {
    const analysisResult = await client.query(
      `SELECT a.id::text, a.code, a.status::text, a.confidence_score::float8 AS "confidenceScore", a.confidence_level AS "confidenceLevel",
              a.created_at::text AS "createdAt", a.updated_at::text AS "updatedAt", a.collection_order_id::text AS "collectionOrderId",
              c.name AS "clientName", p.name AS "propertyName", p.municipality, p.state,
              f.id::text AS "fieldId", f.name AS "fieldName", f.area_ha::float8 AS "areaHa", ST_AsGeoJSON(f.boundary)::json AS "fieldBoundary",
              cs.season_label AS "seasonLabel", cs.current_crop AS "currentCrop", cs.cultivar, cs.management_system AS "managementSystem",
              cs.soil_texture AS "soilTexture", cs.yield_goal::float8 AS "yieldGoal", cs.yield_goal_unit AS "yieldGoalUnit",
              l.name AS "laboratoryName"
       FROM analyses a
       JOIN crop_seasons cs ON cs.tenant_id = a.tenant_id AND cs.id = a.crop_season_id
       JOIN fields f ON f.tenant_id = cs.tenant_id AND f.id = cs.field_id
       JOIN properties p ON p.tenant_id = f.tenant_id AND p.id = f.property_id
       JOIN clients c ON c.tenant_id = p.tenant_id AND c.id = p.client_id
       LEFT JOIN laboratories l ON l.id = a.laboratory_id
       WHERE a.tenant_id = $1::uuid AND a.id = $2::uuid`,
      [tenantId, analysisId],
    );
    const analysis = analysisResult.rows[0];
    if (!analysis) return null;

    const pointsResult = await client.query(
      `SELECT sp.id::text, sp.code, ST_Y(sp.position)::float8 AS latitude, ST_X(sp.position)::float8 AS longitude,
              sp.depth_from_cm::float8 AS "depthFromCm", sp.depth_to_cm::float8 AS "depthToCm", sp.collected_at::text AS "collectedAt"
       FROM sample_points sp WHERE sp.tenant_id = $1::uuid AND sp.collection_order_id = $2::uuid ORDER BY sp.sequence NULLS LAST, sp.code`,
      [tenantId, analysis.collectionOrderId],
    );

    const resultsResult = await client.query(
      `SELECT ls.laboratory_code AS "sampleCode", lr.parameter_code AS "parameterCode", lr.numeric_value::float8 AS value,
              lr.unit, lr.analytical_method AS method
       FROM lab_samples ls JOIN lab_results lr ON lr.tenant_id = ls.tenant_id AND lr.lab_sample_id = ls.id
       WHERE ls.tenant_id = $1::uuid AND ls.analysis_id = $2::uuid ORDER BY ls.laboratory_code, lr.parameter_code`,
      [tenantId, analysisId],
    );

    const interpretationResult = await client.query(
      `SELECT i.id::text, i.revision, i.status, i.structured_output AS "structuredOutput", i.not_interpretable_reason AS "notInterpretableReason",
              i.created_at::text AS "createdAt", i.reviewed_at::text AS "reviewedAt", i.approved_at::text AS "approvedAt",
              reviewer.name AS "reviewedByName", approver.name AS "approvedByName", cp.name AS "cropProfileName"
       FROM interpretations i
       LEFT JOIN users reviewer ON reviewer.id = i.reviewed_by
       LEFT JOIN users approver ON approver.id = i.approved_by
       LEFT JOIN crop_profiles cp ON cp.id = i.crop_profile_id
       WHERE i.tenant_id = $1::uuid AND i.analysis_id = $2::uuid
       ORDER BY i.revision DESC LIMIT 1`,
      [tenantId, analysisId],
    );

    return {
      analysis,
      points: pointsResult.rows,
      results: resultsResult.rows,
      interpretation: interpretationResult.rows[0] ?? null,
    };
  });
}

export async function getCollectionReportData(tenantId: string, collectionOrderId: string, userId?: string) {
  return withTenant({ tenantId, userId }, async (client) => {
    const orderResult = await client.query(
      `SELECT co.id::text, co.code, co.status, co.grid_area_ha::float8 AS "gridAreaHa", co.depth_from_cm::float8 AS "depthFromCm",
              co.depth_to_cm::float8 AS "depthToCm", co.planned_at::text AS "plannedAt", co.created_at::text AS "createdAt",
              assignee.name AS "assignedToName",
              c.name AS "clientName", p.name AS "propertyName", f.name AS "fieldName", f.area_ha::float8 AS "areaHa",
              ST_AsGeoJSON(f.boundary)::json AS "fieldBoundary", cs.season_label AS "seasonLabel", cs.current_crop AS "currentCrop"
       FROM collection_orders co
       JOIN crop_seasons cs ON cs.tenant_id = co.tenant_id AND cs.id = co.crop_season_id
       JOIN fields f ON f.tenant_id = cs.tenant_id AND f.id = cs.field_id
       JOIN properties p ON p.tenant_id = f.tenant_id AND p.id = f.property_id
       JOIN clients c ON c.tenant_id = p.tenant_id AND c.id = p.client_id
       LEFT JOIN users assignee ON assignee.id = co.assigned_to
       WHERE co.tenant_id = $1::uuid AND co.id = $2::uuid`,
      [tenantId, collectionOrderId],
    );
    const order = orderResult.rows[0];
    if (!order) return null;

    const pointsResult = await client.query(
      `SELECT sp.id::text, sp.code, ST_Y(sp.position)::float8 AS latitude, ST_X(sp.position)::float8 AS longitude,
              sp.depth_from_cm::float8 AS "depthFromCm", sp.depth_to_cm::float8 AS "depthToCm", sp.collected_at::text AS "collectedAt",
              sp.gps_source AS "gpsSource", collector.name AS "collectedByName", sp.notes
       FROM sample_points sp LEFT JOIN users collector ON collector.id = sp.collected_by
       WHERE sp.tenant_id = $1::uuid AND sp.collection_order_id = $2::uuid ORDER BY sp.sequence NULLS LAST, sp.code`,
      [tenantId, collectionOrderId],
    );

    return { order, points: pointsResult.rows };
  });
}

export async function getHistoricalEvolutionReportData(tenantId: string, fieldId: string, userId?: string) {
  return withTenant({ tenantId, userId }, async (client) => {
    const fieldResult = await client.query(
      `SELECT f.id::text, f.name AS "fieldName", f.area_ha::float8 AS "areaHa", c.name AS "clientName", p.name AS "propertyName"
       FROM fields f JOIN properties p ON p.tenant_id = f.tenant_id AND p.id = f.property_id
       JOIN clients c ON c.tenant_id = p.tenant_id AND c.id = p.client_id
       WHERE f.tenant_id = $1::uuid AND f.id = $2::uuid`,
      [tenantId, fieldId],
    );
    const field = fieldResult.rows[0];
    if (!field) return null;

    const seasonsResult = await client.query(
      `SELECT id::text, season_label AS "seasonLabel", current_crop AS "currentCrop" FROM crop_seasons
       WHERE tenant_id = $1::uuid AND field_id = $2::uuid ORDER BY created_at`,
      [tenantId, fieldId],
    );

    const analysesResult = await client.query(
      `SELECT a.id::text, a.code, a.created_at::text AS "createdAt", cs.season_label AS "seasonLabel",
              i.structured_output AS "structuredOutput", i.status AS "interpretationStatus"
       FROM analyses a
       JOIN crop_seasons cs ON cs.tenant_id = a.tenant_id AND cs.id = a.crop_season_id
       LEFT JOIN LATERAL (
         SELECT structured_output, status FROM interpretations
         WHERE tenant_id = a.tenant_id AND analysis_id = a.id ORDER BY revision DESC LIMIT 1
       ) i ON true
       WHERE a.tenant_id = $1::uuid AND cs.field_id = $2::uuid
       ORDER BY a.created_at`,
      [tenantId, fieldId],
    );

    return { field, seasons: seasonsResult.rows, analyses: analysesResult.rows };
  });
}

export async function getPropertyExecutiveReportData(tenantId: string, propertyId: string, userId?: string) {
  return withTenant({ tenantId, userId }, async (client) => {
    const propertyResult = await client.query(
      `SELECT p.id::text, p.name, p.municipality, p.state, c.name AS "clientName"
       FROM properties p JOIN clients c ON c.tenant_id = p.tenant_id AND c.id = p.client_id
       WHERE p.tenant_id = $1::uuid AND p.id = $2::uuid`,
      [tenantId, propertyId],
    );
    const property = propertyResult.rows[0];
    if (!property) return null;

    const fieldsResult = await client.query(
      `SELECT f.id::text, f.name, f.area_ha::float8 AS "areaHa",
              (SELECT count(*)::int FROM crop_seasons cs WHERE cs.tenant_id = f.tenant_id AND cs.field_id = f.id) AS "seasonCount",
              (SELECT count(*)::int FROM sample_points sp
                 JOIN collection_orders co ON co.tenant_id = sp.tenant_id AND co.id = sp.collection_order_id
                 JOIN crop_seasons cs ON cs.tenant_id = co.tenant_id AND cs.id = co.crop_season_id
                 WHERE cs.field_id = f.id) AS "totalPoints",
              (SELECT count(*)::int FROM sample_points sp
                 JOIN collection_orders co ON co.tenant_id = sp.tenant_id AND co.id = sp.collection_order_id
                 JOIN crop_seasons cs ON cs.tenant_id = co.tenant_id AND cs.id = co.crop_season_id
                 WHERE cs.field_id = f.id AND sp.collected_at IS NOT NULL) AS "collectedPoints"
       FROM fields f WHERE f.tenant_id = $1::uuid AND f.property_id = $2::uuid ORDER BY f.name`,
      [tenantId, propertyId],
    );

    const analysesResult = await client.query(
      `SELECT count(*)::int AS total,
              count(*) FILTER (WHERE a.status = 'AWAITING_REVIEW')::int AS "awaitingReview",
              count(*) FILTER (WHERE a.status = 'APPROVED')::int AS approved,
              count(*) FILTER (WHERE a.status = 'INCONSISTENT')::int AS inconsistent,
              avg(a.confidence_score)::float8 AS "avgConfidence"
       FROM analyses a
       JOIN crop_seasons cs ON cs.tenant_id = a.tenant_id AND cs.id = a.crop_season_id
       JOIN fields f ON f.tenant_id = cs.tenant_id AND f.id = cs.field_id
       WHERE f.tenant_id = $1::uuid AND f.property_id = $2::uuid`,
      [tenantId, propertyId],
    );

    return { property, fields: fieldsResult.rows, analysesSummary: analysesResult.rows[0] };
  });
}

/** Fecha o elo mapa -> relatório: publica um relatório real a partir de uma interpretação já aprovada. */
export async function publishFieldAnalysisReport(input: { tenantId: string; userId: string; interpretationId: string }) {
  return withTenant({ tenantId: input.tenantId, userId: input.userId }, async (client) => {
    const interpretationResult = await client.query(
      `SELECT i.id::text, i.analysis_id::text AS "analysisId", i.revision, i.status, i.structured_output AS "structuredOutput"
       FROM interpretations i WHERE i.tenant_id = $1::uuid AND i.id = $2::uuid`,
      [input.tenantId, input.interpretationId],
    );
    const interpretation = interpretationResult.rows[0];
    if (!interpretation) throw new ReportError("Interpretação não encontrada.", 404);
    if (interpretation.status !== "APPROVED") throw new ReportError("Só é possível publicar um relatório de uma interpretação já aprovada por um agrônomo responsável.", 409);

    const snapshot = JSON.stringify({ interpretationId: interpretation.id, revision: interpretation.revision, structuredOutput: interpretation.structuredOutput, publishedAt: new Date().toISOString() });
    const sha256 = createHash("sha256").update(snapshot).digest("hex");
    const stored = await saveReportSnapshot({ tenantId: input.tenantId, interpretationId: interpretation.id, revision: interpretation.revision, content: snapshot });
    const storageKey = stored?.key ?? `reports/${input.tenantId}/${interpretation.id}/rev-${interpretation.revision}`;

    const result = await client.query(
      `INSERT INTO reports (tenant_id, interpretation_id, revision, storage_key, sha256, published_at, published_by)
       VALUES ($1::uuid, $2::uuid, $3, $4, $5, now(), $6::uuid)
       RETURNING id::text, revision, storage_key AS "storageKey", published_at::text AS "publishedAt"`,
      [input.tenantId, interpretation.id, interpretation.revision, storageKey, sha256, input.userId],
    );
    const report = result.rows[0];
    await writeAudit(client, { tenantId: input.tenantId, userId: input.userId, action: "REPORT_PUBLISHED", entityType: "report", entityId: report.id, metadata: { interpretationId: interpretation.id, analysisId: interpretation.analysisId } });
    return report;
  });
}

export async function listPublishedReports(tenantId: string, userId?: string) {
  return withTenant({ tenantId, userId }, async (client) => {
    const result = await client.query(
      `SELECT r.id::text, r.revision, r.published_at::text AS "publishedAt", r.sha256,
              a.id::text AS "analysisId", a.code AS "analysisCode",
              c.name AS "clientName", p.name AS "propertyName", f.name AS "fieldName", cs.season_label AS "seasonLabel",
              publisher.name AS "publishedByName"
       FROM reports r
       JOIN interpretations i ON i.tenant_id = r.tenant_id AND i.id = r.interpretation_id
       JOIN analyses a ON a.tenant_id = i.tenant_id AND a.id = i.analysis_id
       JOIN crop_seasons cs ON cs.tenant_id = a.tenant_id AND cs.id = a.crop_season_id
       JOIN fields f ON f.tenant_id = cs.tenant_id AND f.id = cs.field_id
       JOIN properties p ON p.tenant_id = f.tenant_id AND p.id = f.property_id
       JOIN clients c ON c.tenant_id = p.tenant_id AND c.id = p.client_id
       LEFT JOIN users publisher ON publisher.id = r.published_by
       WHERE r.tenant_id = $1::uuid
       ORDER BY r.published_at DESC`,
      [tenantId],
    );
    return result.rows;
  });
}
