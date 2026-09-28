import { withTenant } from "@/lib/db";

/**
 * Read model do Talhão 360°.
 *
 * A versão anterior executava nove consultas SQL sequenciais dentro da mesma transação tenant-scoped.
 * Em Vercel/Neon a latência de rede entre app e banco multiplicava esse custo em toda abertura de talhão.
 * O read model abaixo preserva exatamente as mesmas fontes/ordenações, mas agrega tudo em uma única
 * consulta SQL. Nenhuma média/interpolação agronômica nova é criada.
 */
export async function getFieldOverview(tenantId: string, fieldId: string, userId?: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(fieldId)) return null;

  return withTenant({ tenantId, userId }, async (client) => {
    const result = await client.query(
      `WITH field_row AS (
         SELECT f.id::text AS id,
                f.name,
                f.area_ha::float8 AS "areaHa",
                ST_AsGeoJSON(f.boundary)::json AS boundary,
                p.id::text AS "propertyId",
                p.name AS "propertyName",
                p.municipality,
                p.state,
                c.id::text AS "clientId",
                c.name AS "clientName"
         FROM fields f
         JOIN properties p ON p.tenant_id=f.tenant_id AND p.id=f.property_id
         JOIN clients c ON c.tenant_id=p.tenant_id AND c.id=p.client_id
         WHERE f.tenant_id=$1::uuid AND f.id=$2::uuid
       )
       SELECT
         row_to_json(fr) AS field,

         coalesce((
           SELECT json_agg(row_to_json(s) ORDER BY s."createdAt" DESC)
           FROM (
             SELECT cs.id::text AS id,
                    cs.season_label AS "seasonLabel",
                    cs.current_crop AS "currentCrop",
                    cs.next_crop AS "nextCrop",
                    cs.cultivar,
                    cs.next_cultivar AS "nextCultivar",
                    cs.yield_goal::float8 AS "yieldGoal",
                    cs.yield_goal_unit AS "yieldGoalUnit",
                    cs.created_at::text AS "createdAt"
             FROM crop_seasons cs
             WHERE cs.tenant_id=$1::uuid AND cs.field_id=$2::uuid
           ) s
         ), '[]'::json) AS seasons,

         coalesce((
           SELECT json_agg(row_to_json(o) ORDER BY o."createdAt" DESC)
           FROM (
             SELECT co.id::text AS id,
                    co.code,
                    co.status,
                    co.planned_at::text AS "plannedAt",
                    co.created_at::text AS "createdAt",
                    co.crop_season_id::text AS "cropSeasonId",
                    co.grid_area_ha::float8 AS "gridAreaHa",
                    co.depth_from_cm::float8 AS "depthFromCm",
                    co.depth_to_cm::float8 AS "depthToCm",
                    count(sp.*)::int AS "plannedPoints",
                    count(sp.*) FILTER (WHERE sp.collected_at IS NOT NULL)::int AS "collectedPoints"
             FROM collection_orders co
             LEFT JOIN sample_points sp
               ON sp.tenant_id=co.tenant_id AND sp.collection_order_id=co.id
             WHERE co.tenant_id=$1::uuid
               AND co.crop_season_id IN (
                 SELECT id FROM crop_seasons
                 WHERE tenant_id=$1::uuid AND field_id=$2::uuid
               )
             GROUP BY co.id
           ) o
         ), '[]'::json) AS orders,

         coalesce((
           SELECT json_agg(row_to_json(a) ORDER BY a."createdAt" DESC)
           FROM (
             SELECT an.id::text AS id,
                    an.code,
                    an.status,
                    an.confidence_score::float8 AS "confidenceScore",
                    an.confidence_level AS "confidenceLevel",
                    an.created_at::text AS "createdAt",
                    an.updated_at::text AS "updatedAt",
                    an.crop_season_id::text AS "cropSeasonId",
                    li.status AS "latestInterpretationStatus",
                    li.not_interpretable_reason AS "notInterpretableReason",
                    li.reviewed_at::text AS "reviewedAt",
                    li.approved_at::text AS "approvedAt",
                    li.created_at::text AS "interpretedAt",
                    li.id::text AS "latestInterpretationId"
             FROM analyses an
             LEFT JOIN LATERAL (
               SELECT i.id, i.status, i.not_interpretable_reason, i.reviewed_at, i.approved_at, i.created_at
               FROM interpretations i
               WHERE i.tenant_id=an.tenant_id AND i.analysis_id=an.id
               ORDER BY i.revision DESC
               LIMIT 1
             ) li ON true
             WHERE an.tenant_id=$1::uuid
               AND an.crop_season_id IN (
                 SELECT id FROM crop_seasons
                 WHERE tenant_id=$1::uuid AND field_id=$2::uuid
               )
           ) a
         ), '[]'::json) AS analyses,

         coalesce((
           SELECT json_agg(row_to_json(y) ORDER BY y."createdAt" DESC)
           FROM (
             SELECT fy.id::text AS id,
                    fy.season_label AS "seasonLabel",
                    fy.crop,
                    fy.cultivar,
                    fy.yield_value::float8 AS "yieldValue",
                    fy.yield_unit AS "yieldUnit",
                    fy.source,
                    fy.created_at::text AS "createdAt"
             FROM field_yield_history fy
             WHERE fy.tenant_id=$1::uuid AND fy.field_id=$2::uuid
           ) y
         ), '[]'::json) AS "yieldHistory",

         coalesce((
           SELECT json_agg(row_to_json(n) ORDER BY n."capturedAt" DESC)
           FROM (
             SELECT nd.id::text AS id,
                    nd.captured_at::text AS "capturedAt",
                    nd.source,
                    nd.cloud_cover_pct::float8 AS "cloudCoverPct",
                    nd.pixel_count AS "pixelCount",
                    nd.mean_ndvi::float8 AS "meanNdvi",
                    nd.min_ndvi::float8 AS "minNdvi",
                    nd.max_ndvi::float8 AS "maxNdvi",
                    nd.zone_breakdown_pct AS "zoneBreakdownPct",
                    nd.created_at::text AS "createdAt"
             FROM field_ndvi_snapshots nd
             WHERE nd.tenant_id=$1::uuid AND nd.field_id=$2::uuid
           ) n
         ), '[]'::json) AS "ndviSnapshots",

         coalesce((
           SELECT json_agg(row_to_json(pt) ORDER BY coalesce(pt.sequence,2147483647), pt.code)
           FROM (
             SELECT sp.id::text AS id,
                    sp.code,
                    sp.sequence,
                    ST_Y(sp.position)::float8 AS latitude,
                    ST_X(sp.position)::float8 AS longitude,
                    CASE WHEN sp.observed_position IS NULL THEN NULL ELSE ST_Y(sp.observed_position)::float8 END AS "observedLatitude",
                    CASE WHEN sp.observed_position IS NULL THEN NULL ELSE ST_X(sp.observed_position)::float8 END AS "observedLongitude",
                    CASE WHEN jsonb_typeof(sp.source_payload->'plannedLatitude')='number'
                         THEN (sp.source_payload->>'plannedLatitude')::float8 ELSE NULL END AS "plannedLatitude",
                    CASE WHEN jsonb_typeof(sp.source_payload->'plannedLongitude')='number'
                         THEN (sp.source_payload->>'plannedLongitude')::float8 ELSE NULL END AS "plannedLongitude",
                    sp.collected_at::text AS "collectedAt",
                    sp.depth_from_cm::float8 AS "depthFromCm",
                    sp.depth_to_cm::float8 AS "depthToCm",
                    sp.subsample_count AS "subsampleCount",
                    sp.accuracy_m::float8 AS "accuracyM",
                    sp.gps_source AS "gpsSource",
                    sp.notes,
                    (
                      SELECT count(*)::int
                      FROM lab_results lr
                      JOIN lab_samples ls ON ls.tenant_id=lr.tenant_id AND ls.id=lr.lab_sample_id
                      WHERE ls.tenant_id=sp.tenant_id AND ls.sample_point_id=sp.id
                    ) AS "labResultCount"
             FROM sample_points sp
             WHERE sp.tenant_id=$1::uuid
               AND sp.collection_order_id=(
                 SELECT co2.id
                 FROM collection_orders co2
                 JOIN crop_seasons cs2
                   ON cs2.tenant_id=co2.tenant_id AND cs2.id=co2.crop_season_id
                 WHERE co2.tenant_id=$1::uuid AND cs2.field_id=$2::uuid
                 ORDER BY cs2.created_at DESC, co2.created_at DESC
                 LIMIT 1
               )
           ) pt
         ), '[]'::json) AS "collectionPoints",

         (
           SELECT json_build_object(
             'total', count(*)::int,
             'browserGpsCount', count(*) FILTER (WHERE sp.observed_position IS NOT NULL)::int,
             'shapefileRealCount', count(*) FILTER (
               WHERE upper(trim(coalesce(sp.gps_source,''))) IN ('SHAPEFILE_REAL_GPS_LONLAT','SHAPEFILE_REAL_EPSG4326')
             )::int,
             'estimatedCount', count(*) FILTER (
               WHERE sp.observed_position IS NULL
                 AND upper(trim(coalesce(sp.gps_source,''))) NOT IN ('SHAPEFILE_REAL_GPS_LONLAT','SHAPEFILE_REAL_EPSG4326')
             )::int,
             'verifiedCount', count(*) FILTER (
               WHERE sp.observed_position IS NOT NULL
                  OR upper(trim(coalesce(sp.gps_source,''))) IN ('SHAPEFILE_REAL_GPS_LONLAT','SHAPEFILE_REAL_EPSG4326')
             )::int,
             'confirmedCount', count(*) FILTER (
               WHERE sp.observed_position IS NOT NULL
                  OR upper(trim(coalesce(sp.gps_source,''))) IN ('SHAPEFILE_REAL_GPS_LONLAT','SHAPEFILE_REAL_EPSG4326')
             )::int
           )
           FROM sample_points sp
           JOIN collection_orders co
             ON co.tenant_id=sp.tenant_id AND co.id=sp.collection_order_id
           WHERE sp.tenant_id=$1::uuid
             AND co.crop_season_id IN (
               SELECT id FROM crop_seasons
               WHERE tenant_id=$1::uuid AND field_id=$2::uuid
             )
             AND sp.collected_at IS NOT NULL
         ) AS "gpsQuality",

         coalesce((
           SELECT json_agg(row_to_json(r) ORDER BY r."publishedAt" DESC)
           FROM (
             SELECT rep.id::text AS id,
                    rep.revision,
                    rep.published_at::text AS "publishedAt",
                    i.analysis_id::text AS "analysisId",
                    an.code AS "analysisCode",
                    an.crop_season_id::text AS "cropSeasonId"
             FROM reports rep
             JOIN interpretations i
               ON i.tenant_id=rep.tenant_id AND i.id=rep.interpretation_id
             JOIN analyses an
               ON an.tenant_id=i.tenant_id AND an.id=i.analysis_id
             WHERE rep.tenant_id=$1::uuid
               AND an.crop_season_id IN (
                 SELECT id FROM crop_seasons
                 WHERE tenant_id=$1::uuid AND field_id=$2::uuid
               )
           ) r
         ), '[]'::json) AS reports
       FROM field_row fr`,
      [tenantId, fieldId],
    );

    const row = result.rows[0];
    if (!row?.field) return null;
    return {
      field: row.field,
      seasons: row.seasons ?? [],
      orders: row.orders ?? [],
      analyses: row.analyses ?? [],
      yieldHistory: row.yieldHistory ?? [],
      ndviSnapshots: row.ndviSnapshots ?? [],
      collectionPoints: row.collectionPoints ?? [],
      gpsQuality: row.gpsQuality ?? {
        total: 0,
        verifiedCount: 0,
        confirmedCount: 0,
        browserGpsCount: 0,
        shapefileRealCount: 0,
        estimatedCount: 0,
      },
      reports: row.reports ?? [],
    };
  });
}

export type FieldOverview = NonNullable<Awaited<ReturnType<typeof getFieldOverview>>>;

/**
 * Fast path da abertura do Talhão 360°: somente dados usados antes de abrir "Detalhes técnicos".
 * Mantém uma única consulta SQL e deixa históricos extensos para uma requisição secundária.
 */
export async function getFieldOverviewCore(tenantId: string, fieldId: string, userId?: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(fieldId)) return null;

  return withTenant({ tenantId, userId }, async (client) => {
    const result = await client.query(
      `WITH field_row AS (
         SELECT f.id::text AS id,
                f.name,
                f.area_ha::float8 AS "areaHa",
                ST_AsGeoJSON(f.boundary)::json AS boundary,
                p.id::text AS "propertyId",
                p.name AS "propertyName",
                p.municipality,
                p.state,
                c.id::text AS "clientId",
                c.name AS "clientName"
         FROM fields f
         JOIN properties p ON p.tenant_id=f.tenant_id AND p.id=f.property_id
         JOIN clients c ON c.tenant_id=p.tenant_id AND c.id=p.client_id
         WHERE f.tenant_id=$1::uuid AND f.id=$2::uuid
       )
       SELECT
         row_to_json(fr) AS field,
         coalesce((
           SELECT json_agg(row_to_json(s) ORDER BY s."createdAt" DESC)
           FROM (
             SELECT cs.id::text AS id,
                    cs.season_label AS "seasonLabel",
                    cs.current_crop AS "currentCrop",
                    cs.next_crop AS "nextCrop",
                    cs.cultivar,
                    cs.next_cultivar AS "nextCultivar",
                    cs.yield_goal::float8 AS "yieldGoal",
                    cs.yield_goal_unit AS "yieldGoalUnit",
                    cs.created_at::text AS "createdAt"
             FROM crop_seasons cs
             WHERE cs.tenant_id=$1::uuid AND cs.field_id=$2::uuid
           ) s
         ), '[]'::json) AS seasons,
         coalesce((
           SELECT json_agg(row_to_json(a) ORDER BY a."createdAt" DESC)
           FROM (
             SELECT an.id::text AS id,
                    an.code,
                    an.status,
                    an.confidence_score::float8 AS "confidenceScore",
                    an.confidence_level AS "confidenceLevel",
                    an.created_at::text AS "createdAt",
                    an.updated_at::text AS "updatedAt",
                    an.crop_season_id::text AS "cropSeasonId",
                    li.status AS "latestInterpretationStatus",
                    li.not_interpretable_reason AS "notInterpretableReason",
                    li.reviewed_at::text AS "reviewedAt",
                    li.approved_at::text AS "approvedAt",
                    li.created_at::text AS "interpretedAt",
                    li.id::text AS "latestInterpretationId"
             FROM analyses an
             LEFT JOIN LATERAL (
               SELECT i.id, i.status, i.not_interpretable_reason, i.reviewed_at, i.approved_at, i.created_at
               FROM interpretations i
               WHERE i.tenant_id=an.tenant_id AND i.analysis_id=an.id
               ORDER BY i.revision DESC
               LIMIT 1
             ) li ON true
             WHERE an.tenant_id=$1::uuid
               AND an.crop_season_id IN (
                 SELECT id FROM crop_seasons
                 WHERE tenant_id=$1::uuid AND field_id=$2::uuid
               )
           ) a
         ), '[]'::json) AS analyses,
         coalesce((
           SELECT json_agg(row_to_json(pt) ORDER BY coalesce(pt.sequence,2147483647), pt.code)
           FROM (
             SELECT sp.id::text AS id,
                    sp.code,
                    sp.sequence,
                    ST_Y(sp.position)::float8 AS latitude,
                    ST_X(sp.position)::float8 AS longitude,
                    CASE WHEN sp.observed_position IS NULL THEN NULL ELSE ST_Y(sp.observed_position)::float8 END AS "observedLatitude",
                    CASE WHEN sp.observed_position IS NULL THEN NULL ELSE ST_X(sp.observed_position)::float8 END AS "observedLongitude",
                    CASE WHEN jsonb_typeof(sp.source_payload->'plannedLatitude')='number'
                         THEN (sp.source_payload->>'plannedLatitude')::float8 ELSE NULL END AS "plannedLatitude",
                    CASE WHEN jsonb_typeof(sp.source_payload->'plannedLongitude')='number'
                         THEN (sp.source_payload->>'plannedLongitude')::float8 ELSE NULL END AS "plannedLongitude",
                    sp.collected_at::text AS "collectedAt",
                    sp.depth_from_cm::float8 AS "depthFromCm",
                    sp.depth_to_cm::float8 AS "depthToCm",
                    sp.subsample_count AS "subsampleCount",
                    sp.accuracy_m::float8 AS "accuracyM",
                    sp.gps_source AS "gpsSource",
                    sp.notes,
                    (
                      SELECT count(*)::int
                      FROM lab_results lr
                      JOIN lab_samples ls ON ls.tenant_id=lr.tenant_id AND ls.id=lr.lab_sample_id
                      WHERE ls.tenant_id=sp.tenant_id AND ls.sample_point_id=sp.id
                    ) AS "labResultCount"
             FROM sample_points sp
             WHERE sp.tenant_id=$1::uuid
               AND sp.collection_order_id=(
                 SELECT co2.id
                 FROM collection_orders co2
                 JOIN crop_seasons cs2
                   ON cs2.tenant_id=co2.tenant_id AND cs2.id=co2.crop_season_id
                 WHERE co2.tenant_id=$1::uuid AND cs2.field_id=$2::uuid
                 ORDER BY cs2.created_at DESC, co2.created_at DESC
                 LIMIT 1
               )
           ) pt
         ), '[]'::json) AS "collectionPoints",
         coalesce((
           SELECT json_agg(row_to_json(r) ORDER BY r."publishedAt" DESC)
           FROM (
             SELECT rep.id::text AS id,
                    rep.revision,
                    rep.published_at::text AS "publishedAt",
                    i.analysis_id::text AS "analysisId",
                    an.code AS "analysisCode",
                    an.crop_season_id::text AS "cropSeasonId"
             FROM reports rep
             JOIN interpretations i
               ON i.tenant_id=rep.tenant_id AND i.id=rep.interpretation_id
             JOIN analyses an
               ON an.tenant_id=i.tenant_id AND an.id=i.analysis_id
             WHERE rep.tenant_id=$1::uuid
               AND an.crop_season_id IN (
                 SELECT id FROM crop_seasons
                 WHERE tenant_id=$1::uuid AND field_id=$2::uuid
               )
           ) r
         ), '[]'::json) AS reports
       FROM field_row fr`,
      [tenantId, fieldId],
    );
    const row = result.rows[0];
    if (!row?.field) return null;
    return {
      field: row.field,
      seasons: row.seasons ?? [],
      analyses: row.analyses ?? [],
      collectionPoints: row.collectionPoints ?? [],
      reports: row.reports ?? [],
    };
  });
}

export async function getFieldOverviewTechnicalDetails(tenantId: string, fieldId: string, userId?: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(fieldId)) return null;

  return withTenant({ tenantId, userId }, async (client) => {
    const result = await client.query(
      `SELECT
         coalesce((
           SELECT json_agg(row_to_json(o) ORDER BY o."createdAt" DESC)
           FROM (
             SELECT co.id::text AS id,
                    co.code,
                    co.status,
                    co.planned_at::text AS "plannedAt",
                    co.created_at::text AS "createdAt",
                    co.crop_season_id::text AS "cropSeasonId",
                    co.grid_area_ha::float8 AS "gridAreaHa",
                    co.depth_from_cm::float8 AS "depthFromCm",
                    co.depth_to_cm::float8 AS "depthToCm",
                    count(sp.*)::int AS "plannedPoints",
                    count(sp.*) FILTER (WHERE sp.collected_at IS NOT NULL)::int AS "collectedPoints"
             FROM collection_orders co
             LEFT JOIN sample_points sp
               ON sp.tenant_id=co.tenant_id AND sp.collection_order_id=co.id
             WHERE co.tenant_id=$1::uuid
               AND co.crop_season_id IN (
                 SELECT id FROM crop_seasons
                 WHERE tenant_id=$1::uuid AND field_id=$2::uuid
               )
             GROUP BY co.id
           ) o
         ), '[]'::json) AS orders,
         coalesce((
           SELECT json_agg(row_to_json(y) ORDER BY y."createdAt" DESC)
           FROM (
             SELECT fy.id::text AS id,
                    fy.season_label AS "seasonLabel",
                    fy.crop,
                    fy.cultivar,
                    fy.yield_value::float8 AS "yieldValue",
                    fy.yield_unit AS "yieldUnit",
                    fy.source,
                    fy.created_at::text AS "createdAt"
             FROM field_yield_history fy
             WHERE fy.tenant_id=$1::uuid AND fy.field_id=$2::uuid
           ) y
         ), '[]'::json) AS "yieldHistory",
         coalesce((
           SELECT json_agg(row_to_json(n) ORDER BY n."capturedAt" DESC)
           FROM (
             SELECT nd.id::text AS id,
                    nd.captured_at::text AS "capturedAt",
                    nd.source,
                    nd.cloud_cover_pct::float8 AS "cloudCoverPct",
                    nd.pixel_count AS "pixelCount",
                    nd.mean_ndvi::float8 AS "meanNdvi",
                    nd.min_ndvi::float8 AS "minNdvi",
                    nd.max_ndvi::float8 AS "maxNdvi",
                    nd.zone_breakdown_pct AS "zoneBreakdownPct",
                    nd.created_at::text AS "createdAt"
             FROM field_ndvi_snapshots nd
             WHERE nd.tenant_id=$1::uuid AND nd.field_id=$2::uuid
           ) n
         ), '[]'::json) AS "ndviSnapshots",
         (
           SELECT json_build_object(
             'total', count(*)::int,
             'browserGpsCount', count(*) FILTER (WHERE sp.observed_position IS NOT NULL)::int,
             'shapefileRealCount', count(*) FILTER (
               WHERE upper(trim(coalesce(sp.gps_source,''))) IN ('SHAPEFILE_REAL_GPS_LONLAT','SHAPEFILE_REAL_EPSG4326')
             )::int,
             'estimatedCount', count(*) FILTER (
               WHERE sp.observed_position IS NULL
                 AND upper(trim(coalesce(sp.gps_source,''))) NOT IN ('SHAPEFILE_REAL_GPS_LONLAT','SHAPEFILE_REAL_EPSG4326')
             )::int,
             'verifiedCount', count(*) FILTER (
               WHERE sp.observed_position IS NOT NULL
                  OR upper(trim(coalesce(sp.gps_source,''))) IN ('SHAPEFILE_REAL_GPS_LONLAT','SHAPEFILE_REAL_EPSG4326')
             )::int,
             'confirmedCount', count(*) FILTER (
               WHERE sp.observed_position IS NOT NULL
                  OR upper(trim(coalesce(sp.gps_source,''))) IN ('SHAPEFILE_REAL_GPS_LONLAT','SHAPEFILE_REAL_EPSG4326')
             )::int
           )
           FROM sample_points sp
           JOIN collection_orders co
             ON co.tenant_id=sp.tenant_id AND co.id=sp.collection_order_id
           WHERE sp.tenant_id=$1::uuid
             AND co.crop_season_id IN (
               SELECT id FROM crop_seasons
               WHERE tenant_id=$1::uuid AND field_id=$2::uuid
             )
             AND sp.collected_at IS NOT NULL
         ) AS "gpsQuality"
       FROM fields target_field
       WHERE target_field.tenant_id=$1::uuid AND target_field.id=$2::uuid`,
      [tenantId, fieldId],
    );

    const row = result.rows[0];
    if (!row) return null;
    return {
      orders: row.orders ?? [],
      yieldHistory: row.yieldHistory ?? [],
      ndviSnapshots: row.ndviSnapshots ?? [],
      gpsQuality: row.gpsQuality ?? {
        total: 0,
        verifiedCount: 0,
        confirmedCount: 0,
        browserGpsCount: 0,
        shapefileRealCount: 0,
        estimatedCount: 0,
      },
    };
  });
}

export type FieldOverviewCore = NonNullable<Awaited<ReturnType<typeof getFieldOverviewCore>>>;
export type FieldOverviewTechnicalDetails = NonNullable<Awaited<ReturnType<typeof getFieldOverviewTechnicalDetails>>>;

