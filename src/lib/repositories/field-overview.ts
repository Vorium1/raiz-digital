import { withTenant } from "@/lib/db";

/**
 * Dado real consolidado de UM talhão, pra Talhão 360° (RAIZ 2.0, Fase 1, Etapa 5). Reaproveita as MESMAS
 * tabelas e colunas já usadas em `getAnalysisById`, `getCollectionReportData` e no próprio motor -- nenhum
 * dado novo, nenhuma agregação inventada. Cada seção da página lê uma fatia daqui:
 * VISÃO GERAL (field+seasons+gpsQuality), EVIDÊNCIAS (orders+ndviSnapshots), DECISÕES (analyses),
 * LINHA DO TEMPO (todas as datas reais, montadas na própria página/componente).
 */
export async function getFieldOverview(tenantId: string, fieldId: string, userId?: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(fieldId)) return null;
  return withTenant({ tenantId, userId }, async (client) => {
    const fieldResult = await client.query(
      `SELECT f.id::text, f.name, f.area_ha::float8 AS "areaHa", ST_AsGeoJSON(f.boundary)::json AS boundary,
              p.id::text AS "propertyId", p.name AS "propertyName", p.municipality, p.state,
              c.id::text AS "clientId", c.name AS "clientName"
       FROM fields f
       JOIN properties p ON p.tenant_id = f.tenant_id AND p.id = f.property_id
       JOIN clients c ON c.tenant_id = p.tenant_id AND c.id = p.client_id
       WHERE f.tenant_id = $1::uuid AND f.id = $2::uuid`,
      [tenantId, fieldId],
    );
    const field = fieldResult.rows[0];
    if (!field) return null;

    const seasonsResult = await client.query(
      `SELECT id::text, season_label AS "seasonLabel", current_crop AS "currentCrop", next_crop AS "nextCrop",
              cultivar, next_cultivar AS "nextCultivar", yield_goal::float8 AS "yieldGoal", yield_goal_unit AS "yieldGoalUnit",
              created_at::text AS "createdAt"
       FROM crop_seasons WHERE tenant_id = $1::uuid AND field_id = $2::uuid ORDER BY created_at DESC`,
      [tenantId, fieldId],
    );

    const ordersResult = await client.query(
      `SELECT co.id::text, co.code, co.status, co.planned_at::text AS "plannedAt", co.created_at::text AS "createdAt",
              co.crop_season_id::text AS "cropSeasonId", co.grid_area_ha::float8 AS "gridAreaHa",
              co.depth_from_cm::float8 AS "depthFromCm", co.depth_to_cm::float8 AS "depthToCm",
              count(sp.*)::int AS "plannedPoints", count(sp.*) FILTER (WHERE sp.collected_at IS NOT NULL)::int AS "collectedPoints"
       FROM collection_orders co
       LEFT JOIN sample_points sp ON sp.tenant_id = co.tenant_id AND sp.collection_order_id = co.id
       WHERE co.tenant_id = $1::uuid AND co.crop_season_id IN (SELECT id FROM crop_seasons WHERE tenant_id = $1::uuid AND field_id = $2::uuid)
       GROUP BY co.id ORDER BY co.created_at DESC`,
      [tenantId, fieldId],
    );

    const analysesResult = await client.query(
      `SELECT a.id::text, a.code, a.status, a.confidence_score::float8 AS "confidenceScore", a.confidence_level AS "confidenceLevel",
              a.created_at::text AS "createdAt", a.updated_at::text AS "updatedAt", a.crop_season_id::text AS "cropSeasonId",
              li.status AS "latestInterpretationStatus", li.not_interpretable_reason AS "notInterpretableReason",
              li.reviewed_at::text AS "reviewedAt", li.approved_at::text AS "approvedAt", li.created_at::text AS "interpretedAt",
              li.id::text AS "latestInterpretationId"
       FROM analyses a
       LEFT JOIN LATERAL (
         SELECT id, status, not_interpretable_reason, reviewed_at, approved_at, created_at FROM interpretations
         WHERE interpretations.tenant_id = a.tenant_id AND interpretations.analysis_id = a.id ORDER BY revision DESC LIMIT 1
       ) li ON true
       WHERE a.tenant_id = $1::uuid AND a.crop_season_id IN (SELECT id FROM crop_seasons WHERE tenant_id = $1::uuid AND field_id = $2::uuid)
       ORDER BY a.created_at DESC`,
      [tenantId, fieldId],
    );

    const yieldResult = await client.query(
      `SELECT id::text, season_label AS "seasonLabel", crop, cultivar, yield_value::float8 AS "yieldValue", yield_unit AS "yieldUnit", source, created_at::text AS "createdAt"
       FROM field_yield_history WHERE tenant_id = $1::uuid AND field_id = $2::uuid ORDER BY created_at DESC`,
      [tenantId, fieldId],
    );

    const ndviResult = await client.query(
      `SELECT id::text, captured_at::text AS "capturedAt", source, cloud_cover_pct::float8 AS "cloudCoverPct",
              pixel_count AS "pixelCount", mean_ndvi::float8 AS "meanNdvi", min_ndvi::float8 AS "minNdvi", max_ndvi::float8 AS "maxNdvi",
              zone_breakdown_pct AS "zoneBreakdownPct", created_at::text AS "createdAt"
       FROM field_ndvi_snapshots WHERE tenant_id = $1::uuid AND field_id = $2::uuid ORDER BY captured_at DESC`,
      [tenantId, fieldId],
    );

    /**
     * Qualidade/origem espacial do talhão.
     *
     * Antes esta métrica só reconhecia `BROWSER_GPS`, então um ponto real importado de shapefile/GPS
     * auditado apareceria como 0% confirmado no Talhão 360° — exatamente o oposto do dado real. A métrica
     * agora separa as origens em vez de usar um LIKE único:
     * - observed_position: captura observada em campo; prevalece sobre qualquer rótulo de origem;
     * - SHAPEFILE_REAL_GPS_LONLAT / SHAPEFILE_REAL_EPSG4326: únicas fontes importadas aceitas como
     *   coordenada real auditada quando não existe observed_position;
     * - qualquer outro rótulo, inclusive prefixo/sufixo parecido, continua não verificado.
     *
     * `verifiedCount` significa origem espacial rastreável, não “precisão centimétrica”. `confirmedCount`
     * é mantido como alias de compatibilidade para componentes antigos e tem exatamente o mesmo valor.
     */
    const pointsResult = await client.query(
      `WITH latest_season AS (
         SELECT id
         FROM crop_seasons
         WHERE tenant_id = $1::uuid AND field_id = $2::uuid
         ORDER BY created_at DESC
         LIMIT 1
       ),
       latest_order AS (
         SELECT id
         FROM collection_orders
         WHERE tenant_id = $1::uuid AND crop_season_id = (SELECT id FROM latest_season)
         ORDER BY created_at DESC
         LIMIT 1
       )
       SELECT sp.id::text,
              sp.code,
              sp.sequence,
              ST_Y(sp.position)::float8 AS latitude,
              ST_X(sp.position)::float8 AS longitude,
              CASE WHEN sp.observed_position IS NULL THEN NULL ELSE ST_Y(sp.observed_position)::float8 END AS "observedLatitude",
              CASE WHEN sp.observed_position IS NULL THEN NULL ELSE ST_X(sp.observed_position)::float8 END AS "observedLongitude",
              CASE WHEN coalesce(sp.source_payload->>'plannedLatitude','') ~ '^-?[0-9]+([.][0-9]+)?
              sp.depth_from_cm::float8 AS "depthFromCm",
              sp.depth_to_cm::float8 AS "depthToCm",
              sp.subsample_count AS "subsampleCount",
              sp.accuracy_m::float8 AS "accuracyM",
              sp.gps_source AS "gpsSource",
              sp.notes,
              (
                SELECT count(*)::int
                FROM lab_results lr
                JOIN lab_samples ls ON ls.tenant_id = lr.tenant_id AND ls.id = lr.lab_sample_id
                WHERE ls.tenant_id = sp.tenant_id AND ls.sample_point_id = sp.id
              ) AS "labResultCount"
       FROM sample_points sp
       WHERE sp.tenant_id = $1::uuid
         AND sp.collection_order_id = (SELECT id FROM latest_order)
       ORDER BY coalesce(sp.sequence, 2147483647), sp.code`,
      [tenantId, fieldId],
    );

    const gpsQualityResult = await client.query(
      `SELECT count(*)::int AS total,
              count(*) FILTER (WHERE sp.observed_position IS NOT NULL)::int AS "browserGpsCount",
              count(*) FILTER (
                WHERE upper(trim(coalesce(sp.gps_source, ''))) IN ('SHAPEFILE_REAL_GPS_LONLAT', 'SHAPEFILE_REAL_EPSG4326')
              )::int AS "shapefileRealCount",
              count(*) FILTER (
                WHERE sp.observed_position IS NULL
                  AND upper(trim(coalesce(sp.gps_source, ''))) NOT IN ('SHAPEFILE_REAL_GPS_LONLAT', 'SHAPEFILE_REAL_EPSG4326')
              )::int AS "estimatedCount",
              count(*) FILTER (
                WHERE sp.observed_position IS NOT NULL
                   OR upper(trim(coalesce(sp.gps_source, ''))) IN ('SHAPEFILE_REAL_GPS_LONLAT', 'SHAPEFILE_REAL_EPSG4326')
              )::int AS "verifiedCount",
              count(*) FILTER (
                WHERE sp.observed_position IS NOT NULL
                   OR upper(trim(coalesce(sp.gps_source, ''))) IN ('SHAPEFILE_REAL_GPS_LONLAT', 'SHAPEFILE_REAL_EPSG4326')
              )::int AS "confirmedCount"
       FROM sample_points sp
       JOIN collection_orders co ON co.tenant_id = sp.tenant_id AND co.id = sp.collection_order_id
       WHERE sp.tenant_id = $1::uuid AND co.crop_season_id IN (SELECT id FROM crop_seasons WHERE tenant_id = $1::uuid AND field_id = $2::uuid)
         AND sp.collected_at IS NOT NULL`,
      [tenantId, fieldId],
    );

    const reportsResult = await client.query(
      `SELECT r.id::text, r.revision, r.published_at::text AS "publishedAt", i.analysis_id::text AS "analysisId", a.code AS "analysisCode", a.crop_season_id::text AS "cropSeasonId"
       FROM reports r
       JOIN interpretations i ON i.tenant_id = r.tenant_id AND i.id = r.interpretation_id
       JOIN analyses a ON a.tenant_id = i.tenant_id AND a.id = i.analysis_id
       WHERE r.tenant_id = $1::uuid AND a.crop_season_id IN (SELECT id FROM crop_seasons WHERE tenant_id = $1::uuid AND field_id = $2::uuid)
       ORDER BY r.published_at DESC`,
      [tenantId, fieldId],
    );

    return {
      field,
      seasons: seasonsResult.rows,
      orders: ordersResult.rows,
      analyses: analysesResult.rows,
      yieldHistory: yieldResult.rows,
      ndviSnapshots: ndviResult.rows,
      collectionPoints: pointsResult.rows,
      gpsQuality: gpsQualityResult.rows[0] as {
        total: number;
        verifiedCount: number;
        confirmedCount: number;
        browserGpsCount: number;
        shapefileRealCount: number;
        estimatedCount: number;
      },
      reports: reportsResult.rows,
    };
  });
}

export type FieldOverview = NonNullable<Awaited<ReturnType<typeof getFieldOverview>>>;

                   THEN (sp.source_payload->>'plannedLatitude')::float8 ELSE NULL END AS "plannedLatitude",
              CASE WHEN coalesce(sp.source_payload->>'plannedLongitude','') ~ '^-?[0-9]+([.][0-9]+)?
              sp.depth_from_cm::float8 AS "depthFromCm",
              sp.depth_to_cm::float8 AS "depthToCm",
              sp.subsample_count AS "subsampleCount",
              sp.accuracy_m::float8 AS "accuracyM",
              sp.gps_source AS "gpsSource",
              sp.notes,
              (
                SELECT count(*)::int
                FROM lab_results lr
                JOIN lab_samples ls ON ls.tenant_id = lr.tenant_id AND ls.id = lr.lab_sample_id
                WHERE ls.tenant_id = sp.tenant_id AND ls.sample_point_id = sp.id
              ) AS "labResultCount"
       FROM sample_points sp
       WHERE sp.tenant_id = $1::uuid
         AND sp.collection_order_id = (SELECT id FROM latest_order)
       ORDER BY coalesce(sp.sequence, 2147483647), sp.code`,
      [tenantId, fieldId],
    );

    const gpsQualityResult = await client.query(
      `SELECT count(*)::int AS total,
              count(*) FILTER (WHERE sp.observed_position IS NOT NULL)::int AS "browserGpsCount",
              count(*) FILTER (
                WHERE upper(trim(coalesce(sp.gps_source, ''))) IN ('SHAPEFILE_REAL_GPS_LONLAT', 'SHAPEFILE_REAL_EPSG4326')
              )::int AS "shapefileRealCount",
              count(*) FILTER (
                WHERE sp.observed_position IS NULL
                  AND upper(trim(coalesce(sp.gps_source, ''))) NOT IN ('SHAPEFILE_REAL_GPS_LONLAT', 'SHAPEFILE_REAL_EPSG4326')
              )::int AS "estimatedCount",
              count(*) FILTER (
                WHERE sp.observed_position IS NOT NULL
                   OR upper(trim(coalesce(sp.gps_source, ''))) IN ('SHAPEFILE_REAL_GPS_LONLAT', 'SHAPEFILE_REAL_EPSG4326')
              )::int AS "verifiedCount",
              count(*) FILTER (
                WHERE sp.observed_position IS NOT NULL
                   OR upper(trim(coalesce(sp.gps_source, ''))) IN ('SHAPEFILE_REAL_GPS_LONLAT', 'SHAPEFILE_REAL_EPSG4326')
              )::int AS "confirmedCount"
       FROM sample_points sp
       JOIN collection_orders co ON co.tenant_id = sp.tenant_id AND co.id = sp.collection_order_id
       WHERE sp.tenant_id = $1::uuid AND co.crop_season_id IN (SELECT id FROM crop_seasons WHERE tenant_id = $1::uuid AND field_id = $2::uuid)
         AND sp.collected_at IS NOT NULL`,
      [tenantId, fieldId],
    );

    const reportsResult = await client.query(
      `SELECT r.id::text, r.revision, r.published_at::text AS "publishedAt", i.analysis_id::text AS "analysisId", a.code AS "analysisCode", a.crop_season_id::text AS "cropSeasonId"
       FROM reports r
       JOIN interpretations i ON i.tenant_id = r.tenant_id AND i.id = r.interpretation_id
       JOIN analyses a ON a.tenant_id = i.tenant_id AND a.id = i.analysis_id
       WHERE r.tenant_id = $1::uuid AND a.crop_season_id IN (SELECT id FROM crop_seasons WHERE tenant_id = $1::uuid AND field_id = $2::uuid)
       ORDER BY r.published_at DESC`,
      [tenantId, fieldId],
    );

    return {
      field,
      seasons: seasonsResult.rows,
      orders: ordersResult.rows,
      analyses: analysesResult.rows,
      yieldHistory: yieldResult.rows,
      ndviSnapshots: ndviResult.rows,
      collectionPoints: pointsResult.rows,
      gpsQuality: gpsQualityResult.rows[0] as {
        total: number;
        verifiedCount: number;
        confirmedCount: number;
        browserGpsCount: number;
        shapefileRealCount: number;
        estimatedCount: number;
      },
      reports: reportsResult.rows,
    };
  });
}

export type FieldOverview = NonNullable<Awaited<ReturnType<typeof getFieldOverview>>>;

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
                JOIN lab_samples ls ON ls.tenant_id = lr.tenant_id AND ls.id = lr.lab_sample_id
                WHERE ls.tenant_id = sp.tenant_id AND ls.sample_point_id = sp.id
              ) AS "labResultCount"
       FROM sample_points sp
       WHERE sp.tenant_id = $1::uuid
         AND sp.collection_order_id = (SELECT id FROM latest_order)
       ORDER BY coalesce(sp.sequence, 2147483647), sp.code`,
      [tenantId, fieldId],
    );

    const gpsQualityResult = await client.query(
      `SELECT count(*)::int AS total,
              count(*) FILTER (WHERE sp.observed_position IS NOT NULL)::int AS "browserGpsCount",
              count(*) FILTER (
                WHERE upper(trim(coalesce(sp.gps_source, ''))) IN ('SHAPEFILE_REAL_GPS_LONLAT', 'SHAPEFILE_REAL_EPSG4326')
              )::int AS "shapefileRealCount",
              count(*) FILTER (
                WHERE sp.observed_position IS NULL
                  AND upper(trim(coalesce(sp.gps_source, ''))) NOT IN ('SHAPEFILE_REAL_GPS_LONLAT', 'SHAPEFILE_REAL_EPSG4326')
              )::int AS "estimatedCount",
              count(*) FILTER (
                WHERE sp.observed_position IS NOT NULL
                   OR upper(trim(coalesce(sp.gps_source, ''))) IN ('SHAPEFILE_REAL_GPS_LONLAT', 'SHAPEFILE_REAL_EPSG4326')
              )::int AS "verifiedCount",
              count(*) FILTER (
                WHERE sp.observed_position IS NOT NULL
                   OR upper(trim(coalesce(sp.gps_source, ''))) IN ('SHAPEFILE_REAL_GPS_LONLAT', 'SHAPEFILE_REAL_EPSG4326')
              )::int AS "confirmedCount"
       FROM sample_points sp
       JOIN collection_orders co ON co.tenant_id = sp.tenant_id AND co.id = sp.collection_order_id
       WHERE sp.tenant_id = $1::uuid AND co.crop_season_id IN (SELECT id FROM crop_seasons WHERE tenant_id = $1::uuid AND field_id = $2::uuid)
         AND sp.collected_at IS NOT NULL`,
      [tenantId, fieldId],
    );

    const reportsResult = await client.query(
      `SELECT r.id::text, r.revision, r.published_at::text AS "publishedAt", i.analysis_id::text AS "analysisId", a.code AS "analysisCode", a.crop_season_id::text AS "cropSeasonId"
       FROM reports r
       JOIN interpretations i ON i.tenant_id = r.tenant_id AND i.id = r.interpretation_id
       JOIN analyses a ON a.tenant_id = i.tenant_id AND a.id = i.analysis_id
       WHERE r.tenant_id = $1::uuid AND a.crop_season_id IN (SELECT id FROM crop_seasons WHERE tenant_id = $1::uuid AND field_id = $2::uuid)
       ORDER BY r.published_at DESC`,
      [tenantId, fieldId],
    );

    return {
      field,
      seasons: seasonsResult.rows,
      orders: ordersResult.rows,
      analyses: analysesResult.rows,
      yieldHistory: yieldResult.rows,
      ndviSnapshots: ndviResult.rows,
      collectionPoints: pointsResult.rows,
      gpsQuality: gpsQualityResult.rows[0] as {
        total: number;
        verifiedCount: number;
        confirmedCount: number;
        browserGpsCount: number;
        shapefileRealCount: number;
        estimatedCount: number;
      },
      reports: reportsResult.rows,
    };
  });
}

export type FieldOverview = NonNullable<Awaited<ReturnType<typeof getFieldOverview>>>;
