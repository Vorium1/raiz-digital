import { withTenant } from "@/lib/db";
import { writeAudit } from "@/lib/repositories/audit";

export class NdviError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
    this.name = "NdviError";
  }
}

function isForeignKeyViolation(error: unknown) {
  return Boolean(error && typeof error === "object" && "code" in error && (error as { code?: string }).code === "23503");
}

const SNAPSHOT_COLUMNS = `id::text, field_id::text AS "fieldId", captured_at::text AS "capturedAt", source,
  provider_scene_id AS "providerSceneId", cloud_cover_pct::float8 AS "cloudCoverPct", pixel_count AS "pixelCount",
  mean_ndvi::float8 AS "meanNdvi", min_ndvi::float8 AS "minNdvi", max_ndvi::float8 AS "maxNdvi",
  stddev_ndvi::float8 AS "stddevNdvi", zone_breakdown_pct AS "zoneBreakdownPct", created_at AS "createdAt"`;

export async function getFieldBoundaryGeoJson(tenantId: string, fieldId: string, userId?: string) {
  return withTenant({ tenantId, userId }, async (client) => {
    const result = await client.query<{ boundary: unknown }>(
      `SELECT ST_AsGeoJSON(boundary)::json AS boundary FROM fields WHERE tenant_id = $1::uuid AND id = $2::uuid`,
      [tenantId, fieldId],
    );
    return result.rows[0]?.boundary ?? null;
  });
}

export async function listNdviHistoryForField(tenantId: string, fieldId: string, userId?: string) {
  return withTenant({ tenantId, userId }, async (client) => {
    const result = await client.query(
      `SELECT ${SNAPSHOT_COLUMNS} FROM field_ndvi_snapshots
       WHERE tenant_id = $1::uuid AND field_id = $2::uuid ORDER BY captured_at DESC LIMIT 24`,
      [tenantId, fieldId],
    );
    return result.rows;
  });
}

export async function getLatestNdviSnapshot(tenantId: string, fieldId: string, userId?: string) {
  return withTenant({ tenantId, userId }, async (client) => {
    const result = await client.query(
      `SELECT ${SNAPSHOT_COLUMNS} FROM field_ndvi_snapshots
       WHERE tenant_id = $1::uuid AND field_id = $2::uuid ORDER BY captured_at DESC LIMIT 1`,
      [tenantId, fieldId],
    );
    return result.rows[0] ?? null;
  });
}

export async function saveNdviSnapshot(input: {
  tenantId: string;
  userId: string;
  fieldId: string;
  capturedAt: string;
  source: string;
  providerSceneId?: string | null;
  cloudCoverPct?: number | null;
  pixelCount: number;
  meanNdvi: number;
  minNdvi: number;
  maxNdvi: number;
  stddevNdvi?: number | null;
  zoneBreakdownPct: Record<string, number>;
}) {
  return withTenant({ tenantId: input.tenantId, userId: input.userId }, async (client) => {
    let result;
    try {
      result = await client.query(
        `INSERT INTO field_ndvi_snapshots
           (tenant_id, field_id, captured_at, source, provider_scene_id, cloud_cover_pct, pixel_count,
            mean_ndvi, min_ndvi, max_ndvi, stddev_ndvi, zone_breakdown_pct, requested_by)
         VALUES ($1::uuid, $2::uuid, $3::date, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, $13::uuid)
         ON CONFLICT (tenant_id, field_id, captured_at, source) DO UPDATE SET
           provider_scene_id = EXCLUDED.provider_scene_id, cloud_cover_pct = EXCLUDED.cloud_cover_pct,
           pixel_count = EXCLUDED.pixel_count, mean_ndvi = EXCLUDED.mean_ndvi, min_ndvi = EXCLUDED.min_ndvi,
           max_ndvi = EXCLUDED.max_ndvi, stddev_ndvi = EXCLUDED.stddev_ndvi, zone_breakdown_pct = EXCLUDED.zone_breakdown_pct
         RETURNING ${SNAPSHOT_COLUMNS}`,
        [
          input.tenantId, input.fieldId, input.capturedAt, input.source, input.providerSceneId ?? null,
          input.cloudCoverPct ?? null, input.pixelCount, input.meanNdvi, input.minNdvi, input.maxNdvi,
          input.stddevNdvi ?? null, JSON.stringify(input.zoneBreakdownPct), input.userId,
        ],
      );
    } catch (error) {
      if (isForeignKeyViolation(error)) throw new NdviError("Talhão não encontrado.", 404);
      throw error;
    }
    const created = result.rows[0];
    await writeAudit(client, {
      tenantId: input.tenantId, userId: input.userId, action: "FIELD_NDVI_SNAPSHOT_SAVED",
      entityType: "field_ndvi_snapshot", entityId: created.id,
      metadata: { fieldId: created.fieldId, capturedAt: created.capturedAt, meanNdvi: created.meanNdvi },
    });
    return created;
  });
}
