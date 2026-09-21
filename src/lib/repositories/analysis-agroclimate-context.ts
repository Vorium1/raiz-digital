import { withTenant } from "@/lib/db";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type AnalysisAgroclimateLocationContext = {
  analysisId: string;
  fieldId: string;
  seasonLabel: string;
  technicalRegionCode: string | null;
  state: string;
  municipality: string;
  latitude: number | null;
  longitude: number | null;
  coordinateSource:
    | "FIELD_BOUNDARY"
    | "OBSERVED_SAMPLE_POINTS"
    | "VERIFIED_IMPORTED_SAMPLE_POINTS"
    | "NONE";
};

/**
 * Localização de clima sem inventar coordenada.
 *
 * Precedência:
 * 1. ponto interno da geometria real do talhão;
 * 2. centro dos pontos observados em campo;
 * 3. centro dos pontos importados com gps_source explicitamente verificado.
 *
 * Pontos estimados/gerados não entram como fallback meteorológico.
 */
export async function getAnalysisAgroclimateLocationContext(input: {
  tenantId: string;
  userId: string;
  analysisId: string;
}): Promise<AnalysisAgroclimateLocationContext | null> {
  if (!UUID_RE.test(input.analysisId)) return null;
  return withTenant({ tenantId: input.tenantId, userId: input.userId }, async (client) => {
    const result = await client.query(
      `SELECT
         a.id::text AS "analysisId",
         f.id::text AS "fieldId",
         cs.season_label AS "seasonLabel",
         cs.technical_region_code AS "technicalRegionCode",
         p.state,
         p.municipality,
         CASE
           WHEN f.boundary IS NOT NULL THEN ST_Y(ST_PointOnSurface(f.boundary))::float8
           WHEN sample_geo.observed_point IS NOT NULL THEN ST_Y(sample_geo.observed_point)::float8
           WHEN sample_geo.verified_imported_point IS NOT NULL THEN ST_Y(sample_geo.verified_imported_point)::float8
           ELSE NULL
         END AS latitude,
         CASE
           WHEN f.boundary IS NOT NULL THEN ST_X(ST_PointOnSurface(f.boundary))::float8
           WHEN sample_geo.observed_point IS NOT NULL THEN ST_X(sample_geo.observed_point)::float8
           WHEN sample_geo.verified_imported_point IS NOT NULL THEN ST_X(sample_geo.verified_imported_point)::float8
           ELSE NULL
         END AS longitude,
         CASE
           WHEN f.boundary IS NOT NULL THEN 'FIELD_BOUNDARY'
           WHEN sample_geo.observed_point IS NOT NULL THEN 'OBSERVED_SAMPLE_POINTS'
           WHEN sample_geo.verified_imported_point IS NOT NULL THEN 'VERIFIED_IMPORTED_SAMPLE_POINTS'
           ELSE 'NONE'
         END AS "coordinateSource"
       FROM analyses a
       JOIN crop_seasons cs
         ON cs.tenant_id = a.tenant_id AND cs.id = a.crop_season_id
       JOIN fields f
         ON f.tenant_id = cs.tenant_id AND f.id = cs.field_id
       JOIN properties p
         ON p.tenant_id = f.tenant_id AND p.id = f.property_id
       LEFT JOIN LATERAL (
         SELECT
           ST_Centroid(ST_Collect(sp.observed_position))
             FILTER (WHERE sp.observed_position IS NOT NULL) AS observed_point,
           ST_Centroid(ST_Collect(sp.position))
             FILTER (
               WHERE sp.observed_position IS NULL
                 AND upper(trim(coalesce(sp.gps_source, ''))) IN (
                   'SHAPEFILE_REAL_GPS_LONLAT',
                   'SHAPEFILE_REAL_EPSG4326'
                 )
             ) AS verified_imported_point
         FROM collection_orders co
         JOIN sample_points sp
           ON sp.tenant_id = co.tenant_id AND sp.collection_order_id = co.id
         WHERE co.tenant_id = a.tenant_id
           AND co.crop_season_id = cs.id
       ) sample_geo ON true
       WHERE a.tenant_id = $1::uuid AND a.id = $2::uuid
       LIMIT 1`,
      [input.tenantId, input.analysisId],
    );
    return result.rows[0] ?? null;
  });
}
