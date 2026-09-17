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
  stddev_ndvi::float8 AS "stddevNdvi", zone_breakdown_pct AS "zoneBreakdownPct",
  raster_object_key AS "rasterObjectKey", raster_sha256 AS "rasterSha256", raster_bytes AS "rasterBytes",
  raster_bbox AS "rasterBbox", raster_width AS "rasterWidth", raster_height AS "rasterHeight",
  raster_algorithm AS "rasterAlgorithm", raster_mosaicking_order AS "rasterMosaickingOrder",
  raster_archived_at AS "rasterArchivedAt", created_at AS "createdAt"`;

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

export async function getNdviSnapshotForDate(input: {
  tenantId: string;
  fieldId: string;
  capturedAt: string;
  userId?: string;
  source?: string;
}) {
  return withTenant({ tenantId: input.tenantId, userId: input.userId }, async (client) => {
    const result = await client.query(
      `SELECT ${SNAPSHOT_COLUMNS} FROM field_ndvi_snapshots
       WHERE tenant_id = $1::uuid AND field_id = $2::uuid AND captured_at = $3::date AND source = $4
       LIMIT 1`,
      [input.tenantId, input.fieldId, input.capturedAt, input.source ?? "SENTINEL_2"],
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
  rasterArtifact: {
    key: string;
    sha256: string;
    bytes: number;
    bbox: [number, number, number, number];
    width: number;
    height: number;
    algorithm: string;
    mosaickingOrder: string;
  };
}) {
  return withTenant({ tenantId: input.tenantId, userId: input.userId }, async (client) => {
    let result;
    try {
      result = await client.query(
        `INSERT INTO field_ndvi_snapshots
           (tenant_id, field_id, captured_at, source, provider_scene_id, cloud_cover_pct, pixel_count,
            mean_ndvi, min_ndvi, max_ndvi, stddev_ndvi, zone_breakdown_pct, requested_by,
            raster_object_key, raster_sha256, raster_bytes, raster_bbox, raster_width, raster_height,
            raster_algorithm, raster_mosaicking_order, raster_archived_at)
         VALUES ($1::uuid, $2::uuid, $3::date, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, $13::uuid,
                 $14, $15, $16, $17::jsonb, $18, $19, $20, $21, now())
         ON CONFLICT (tenant_id, field_id, captured_at, source) DO UPDATE SET
           provider_scene_id = EXCLUDED.provider_scene_id, cloud_cover_pct = EXCLUDED.cloud_cover_pct,
           pixel_count = EXCLUDED.pixel_count, mean_ndvi = EXCLUDED.mean_ndvi, min_ndvi = EXCLUDED.min_ndvi,
           max_ndvi = EXCLUDED.max_ndvi, stddev_ndvi = EXCLUDED.stddev_ndvi, zone_breakdown_pct = EXCLUDED.zone_breakdown_pct,
           raster_object_key = EXCLUDED.raster_object_key, raster_sha256 = EXCLUDED.raster_sha256,
           raster_bytes = EXCLUDED.raster_bytes, raster_bbox = EXCLUDED.raster_bbox,
           raster_width = EXCLUDED.raster_width, raster_height = EXCLUDED.raster_height,
           raster_algorithm = EXCLUDED.raster_algorithm, raster_mosaicking_order = EXCLUDED.raster_mosaicking_order,
           raster_archived_at = now()
         WHERE field_ndvi_snapshots.raster_object_key IS NULL
         RETURNING ${SNAPSHOT_COLUMNS}`,
        [
          input.tenantId, input.fieldId, input.capturedAt, input.source, input.providerSceneId ?? null,
          input.cloudCoverPct ?? null, input.pixelCount, input.meanNdvi, input.minNdvi, input.maxNdvi,
          input.stddevNdvi ?? null, JSON.stringify(input.zoneBreakdownPct), input.userId,
          input.rasterArtifact.key, input.rasterArtifact.sha256.toLowerCase(), input.rasterArtifact.bytes,
          JSON.stringify(input.rasterArtifact.bbox), input.rasterArtifact.width, input.rasterArtifact.height,
          input.rasterArtifact.algorithm, input.rasterArtifact.mosaickingOrder,
        ],
      );
    } catch (error) {
      if (isForeignKeyViolation(error)) throw new NdviError("Talhão não encontrado.", 404);
      throw error;
    }

    const artifactWrittenNow = result.rows.length > 0;
    let persisted = result.rows[0];
    if (!persisted) {
      const existing = await client.query(
        `SELECT ${SNAPSHOT_COLUMNS} FROM field_ndvi_snapshots
         WHERE tenant_id = $1::uuid AND field_id = $2::uuid AND captured_at = $3::date AND source = $4
         LIMIT 1`,
        [input.tenantId, input.fieldId, input.capturedAt, input.source],
      );
      persisted = existing.rows[0];
    }
    if (!persisted) throw new NdviError("Não foi possível confirmar o snapshot NDVI após a persistência.", 500);

    await writeAudit(client, {
      tenantId: input.tenantId, userId: input.userId, action: "FIELD_NDVI_SNAPSHOT_SAVED",
      entityType: "field_ndvi_snapshot", entityId: persisted.id,
      metadata: {
        fieldId: persisted.fieldId,
        capturedAt: persisted.capturedAt,
        meanNdvi: persisted.meanNdvi,
        rasterSha256: persisted.rasterSha256,
        rasterArtifactWrittenNow: artifactWrittenNow,
      },
    });
    return persisted;
  });
}
