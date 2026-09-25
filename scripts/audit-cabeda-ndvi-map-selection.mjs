import pg from "pg";

/**
 * Auditoria read-only do seletor automático Solo × NDVI.
 *
 * Replica a regra usada por getLatestFieldSoilMapContext (ordem mais recente do talhão
 * que possui resultado laboratorial) e mede coerência espacial sem imprimir coordenadas,
 * UUIDs ou secrets.
 */

const databaseUrl = process.env.DATABASE_URL?.trim();
const clientName = process.env.CABEDA_AUDIT_CLIENT_NAME?.trim() || "Rafael Cabeda";
if (!databaseUrl) throw new Error("DATABASE_URL é obrigatório.");

const { Client } = pg;
const client = new Client({
  connectionString: databaseUrl,
  ssl: process.env.DATABASE_SSL === "require" ? { rejectUnauthorized: false } : undefined,
});

await client.connect();
try {
  await client.query("BEGIN TRANSACTION READ ONLY");

  const tenantCandidates = await client.query(
    `SELECT DISTINCT c.tenant_id::text AS id
     FROM clients c
     WHERE c.name=$1
     LIMIT 2`,
    [clientName],
  );
  if (tenantCandidates.rows.length !== 1) {
    throw new Error(
      tenantCandidates.rows.length === 0
        ? "Cliente Cabeda não encontrado na homologação."
        : "Cliente Cabeda aparece em mais de um tenant; auditoria automática recusada.",
    );
  }
  const tenantId = tenantCandidates.rows[0].id;
  await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);

  const rows = await client.query(
    `WITH candidates AS (
       SELECT
         f.id AS field_id,
         f.name AS field_name,
         co.id AS order_id,
         co.code AS order_code,
         co.created_at,
         co.depth_from_cm,
         co.depth_to_cm,
         row_number() OVER (PARTITION BY f.id ORDER BY co.created_at DESC) AS selection_rank
       FROM clients c
       JOIN properties p ON p.tenant_id=c.tenant_id AND p.client_id=c.id
       JOIN fields f ON f.tenant_id=p.tenant_id AND f.property_id=p.id
       JOIN crop_seasons cs ON cs.tenant_id=f.tenant_id AND cs.field_id=f.id
       JOIN collection_orders co ON co.tenant_id=cs.tenant_id AND co.crop_season_id=cs.id
       WHERE c.tenant_id=$1::uuid
         AND c.name=$2
         AND EXISTS (
           SELECT 1
           FROM sample_points spx
           JOIN lab_samples lsx ON lsx.tenant_id=spx.tenant_id AND lsx.sample_point_id=spx.id
           JOIN lab_results lrx ON lrx.tenant_id=lsx.tenant_id AND lrx.lab_sample_id=lsx.id
           WHERE spx.tenant_id=co.tenant_id AND spx.collection_order_id=co.id
         )
     )
     SELECT
       c.field_name AS "fieldName",
       c.order_code AS "orderCode",
       c.selection_rank::int AS "selectionRank",
       c.depth_from_cm::float8 AS "depthFromCm",
       c.depth_to_cm::float8 AS "depthToCm",
       count(sp.id)::int AS "pointCount",
       count(sp.id) FILTER (
         WHERE sp.position IS NOT NULL
           AND (
             ST_Covers(f.boundary, sp.position)
             OR ST_DWithin(f.boundary::geography, sp.position::geography, 5)
           )
       )::int AS "baseInsideCount",
       count(sp.id) FILTER (
         WHERE sp.observed_position IS NOT NULL
       )::int AS "observedCount",
       count(sp.id) FILTER (
         WHERE sp.observed_position IS NOT NULL
           AND (
             ST_Covers(f.boundary, sp.observed_position)
             OR ST_DWithin(f.boundary::geography, sp.observed_position::geography, 5)
           )
       )::int AS "observedInsideCount",
       count(sp.id) FILTER (
         WHERE COALESCE(sp.observed_position, sp.position) IS NOT NULL
           AND (
             ST_Covers(f.boundary, COALESCE(sp.observed_position, sp.position))
             OR ST_DWithin(
               f.boundary::geography,
               COALESCE(sp.observed_position, sp.position)::geography,
               5
             )
           )
       )::int AS "currentUiInsideCount",
       count(sp.id) FILTER (
         WHERE EXISTS (
           SELECT 1 FROM lab_samples ls
           JOIN lab_results lr ON lr.tenant_id=ls.tenant_id AND lr.lab_sample_id=ls.id
           WHERE ls.tenant_id=sp.tenant_id AND ls.sample_point_id=sp.id
         )
       )::int AS "pointsWithLabResults",
       COALESCE(array_agg(DISTINCT COALESCE(sp.gps_source,'NULL')) FILTER (WHERE sp.id IS NOT NULL), ARRAY[]::text[]) AS "gpsSources"
     FROM candidates c
     JOIN fields f ON f.tenant_id=$1::uuid AND f.id=c.field_id
     LEFT JOIN sample_points sp ON sp.tenant_id=$1::uuid AND sp.collection_order_id=c.order_id
     GROUP BY c.field_id,c.field_name,c.order_id,c.order_code,c.created_at,c.selection_rank,c.depth_from_cm,c.depth_to_cm
     ORDER BY c.field_name,c.selection_rank`,
    [tenantId, clientName],
  );

  const results = rows.rows.map((row) => ({
    fieldName: row.fieldName,
    orderCode: row.orderCode,
    selectedByCurrentNdviFallback: Number(row.selectionRank) === 1,
    depthCm: `${Number(row.depthFromCm)}-${Number(row.depthToCm)}`,
    pointCount: Number(row.pointCount),
    pointsWithLabResults: Number(row.pointsWithLabResults),
    baseInsideCount: Number(row.baseInsideCount),
    observedCount: Number(row.observedCount),
    observedInsideCount: Number(row.observedInsideCount),
    currentUiInsideCount: Number(row.currentUiInsideCount),
    currentUiOutsideCount: Number(row.pointCount) - Number(row.currentUiInsideCount),
    gpsSources: row.gpsSources ?? [],
  }));

  const selected = results.filter((item) => item.selectedByCurrentNdviFallback);
  console.log(JSON.stringify({
    status: "READ_ONLY",
    selectorRule: "latest collection order per field with at least one lab result",
    selected,
    candidates: results,
    suspiciousSelectedOrders: selected.filter((item) => item.currentUiOutsideCount > 0),
  }, null, 2));
} finally {
  await client.query("ROLLBACK").catch(() => {});
  await client.end();
}
