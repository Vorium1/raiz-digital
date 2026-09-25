import pg from "pg";

/**
 * Auditoria READ-ONLY da cadeia de custódia das coordenadas Cabeda.
 *
 * Prova sem imprimir latitude/longitude:
 * 1) posição atual do ponto ainda coincide com o after_data do evento
 *    SAMPLE_POINT_REAL_GEOMETRY_IMPORTED;
 * 2) o evento declara sourceLayer=amostrasreal e targetSrid=4326;
 * 3) ST_X/ST_Y remontam exatamente a mesma geometria;
 * 4) todos os pontos permanecem dentro do contorno persistido;
 * 5) mede apenas a distância entre observed_position legado e position real,
 *    sem expor as coordenadas.
 */

const AREA_CONFIG = {
  "01": { fieldName: "Área 01", orderCode: "CO-CABEDA-01", expectedPoints: 8 },
  "02": { fieldName: "Área 02", orderCode: "CO-CABEDA-02", expectedPoints: 4 },
};

const areaCode = process.env.CABEDA_AUDIT_AREA?.trim() || "01";
const config = AREA_CONFIG[areaCode];
if (!config) throw new Error("CABEDA_AUDIT_AREA deve ser 01 ou 02.");

const databaseUrl = process.env.DATABASE_URL?.trim();
const explicitTenantId = process.env.CABEDA_TENANT_ID?.trim();
const clientName = process.env.CABEDA_AUDIT_CLIENT_NAME?.trim() || "Rafael Cabeda";
if (!databaseUrl) throw new Error("DATABASE_URL é obrigatório.");

const { Client } = pg;
const client = new Client({
  connectionString: databaseUrl,
  ssl: process.env.DATABASE_SSL === "require" ? { rejectUnauthorized: false } : undefined,
});

function max(values) {
  const finite = values.filter((value) => Number.isFinite(value));
  return finite.length ? Math.max(...finite) : null;
}
function mean(values) {
  const finite = values.filter((value) => Number.isFinite(value));
  return finite.length ? finite.reduce((sum, value) => sum + value, 0) / finite.length : null;
}
function roundMm(value) {
  return value == null ? null : Number(value.toFixed(3));
}

await client.connect();
try {
  await client.query("BEGIN TRANSACTION READ ONLY");

  let tenantId = explicitTenantId;
  if (!tenantId) {
    const candidates = await client.query(
      `SELECT DISTINCT c.tenant_id::text AS id
       FROM clients c
       JOIN properties p ON p.tenant_id=c.tenant_id AND p.client_id=c.id
       JOIN fields f ON f.tenant_id=p.tenant_id AND f.property_id=p.id
       JOIN crop_seasons cs ON cs.tenant_id=f.tenant_id AND cs.field_id=f.id
       JOIN collection_orders co ON co.tenant_id=cs.tenant_id AND co.crop_season_id=cs.id
       WHERE c.name=$1 AND f.name=$2 AND co.code=$3
       LIMIT 2`,
      [clientName, config.fieldName, config.orderCode],
    );
    if (candidates.rows.length !== 1) {
      throw new Error(
        candidates.rows.length === 0
          ? "Conjunto Cabeda não encontrado."
          : "Conjunto Cabeda ambíguo; informe CABEDA_TENANT_ID explicitamente.",
      );
    }
    tenantId = candidates.rows[0].id;
  }

  await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);

  const result = await client.query(
    `SELECT
       sp.code,
       sp.gps_source AS "gpsSource",
       ST_SRID(sp.position)::int AS "positionSrid",
       ST_Covers(f.boundary, sp.position) AS "insideBoundary",
       CASE WHEN import_audit.id IS NULL THEN NULL ELSE
         ST_Distance(
           sp.position::geography,
           ST_SetSRID(ST_GeomFromText(import_audit.after_data->>'positionWkt'),4326)::geography
         )::float8
       END AS "driftFromImportMeters",
       ST_Distance(
         sp.position::geography,
         ST_SetSRID(ST_MakePoint(ST_X(sp.position), ST_Y(sp.position)),4326)::geography
       )::float8 AS "axisRoundTripMeters",
       CASE WHEN sp.observed_position IS NULL THEN NULL ELSE
         ST_Distance(sp.position::geography, sp.observed_position::geography)::float8
       END AS "observedVsImportedMeters",
       import_audit.id IS NOT NULL AS "hasImportAudit",
       import_audit.metadata->>'sourceLayer' AS "sourceLayer",
       import_audit.metadata->>'sourceCrs' AS "sourceCrs",
       import_audit.metadata->>'sourceDatum' AS "sourceDatum",
       import_audit.metadata->>'targetSrid' AS "targetSrid",
       coalesce(import_audit.metadata->>'reprojectionApplied','false') AS "reprojectionApplied"
     FROM sample_points sp
     JOIN collection_orders co ON co.tenant_id=sp.tenant_id AND co.id=sp.collection_order_id
     JOIN crop_seasons cs ON cs.tenant_id=co.tenant_id AND cs.id=co.crop_season_id
     JOIN fields f ON f.tenant_id=cs.tenant_id AND f.id=cs.field_id
     JOIN properties p ON p.tenant_id=f.tenant_id AND p.id=f.property_id
     JOIN clients c ON c.tenant_id=p.tenant_id AND c.id=p.client_id
     LEFT JOIN LATERAL (
       SELECT ae.id, ae.after_data, ae.metadata
       FROM audit_events ae
       WHERE ae.tenant_id=sp.tenant_id
         AND ae.entity_type='sample_point'
         AND ae.entity_id=sp.id
         AND ae.action='SAMPLE_POINT_REAL_GEOMETRY_IMPORTED'
       ORDER BY ae.created_at DESC
       LIMIT 1
     ) import_audit ON true
     WHERE sp.tenant_id=$1::uuid
       AND c.name=$2
       AND f.name=$3
       AND co.code=$4
     ORDER BY sp.code`,
    [tenantId, clientName, config.fieldName, config.orderCode],
  );

  const rows = result.rows;
  const blockers = [];
  if (rows.length !== config.expectedPoints) blockers.push(`POINT_COUNT_${rows.length}_EXPECTED_${config.expectedPoints}`);

  for (const row of rows) {
    if (!row.hasImportAudit) blockers.push(`MISSING_IMPORT_AUDIT_${row.code}`);
    if (row.sourceLayer !== "amostrasreal") blockers.push(`WRONG_SOURCE_LAYER_${row.code}`);
    if (row.targetSrid !== "4326" || Number(row.positionSrid) !== 4326) blockers.push(`WRONG_SRID_${row.code}`);
    if (String(row.reprojectionApplied) !== "false") blockers.push(`UNEXPECTED_REPROJECTION_${row.code}`);
    if (!row.insideBoundary) blockers.push(`OUTSIDE_BOUNDARY_${row.code}`);
    if (row.driftFromImportMeters == null || Number(row.driftFromImportMeters) > 0.001) blockers.push(`DRIFT_FROM_IMPORT_${row.code}`);
    if (Number(row.axisRoundTripMeters) > 0.001) blockers.push(`AXIS_ROUNDTRIP_DRIFT_${row.code}`);
    if (!["SHAPEFILE_REAL_GPS_LONLAT","SHAPEFILE_REAL_EPSG4326"].includes(String(row.gpsSource))) blockers.push(`UNTRUSTED_GPS_SOURCE_${row.code}`);
  }

  const drift = rows.map((row) => Number(row.driftFromImportMeters));
  const roundTrip = rows.map((row) => Number(row.axisRoundTripMeters));
  const observedDelta = rows
    .filter((row) => row.observedVsImportedMeters != null)
    .map((row) => Number(row.observedVsImportedMeters));

  const summary = {
    status: blockers.length ? "FAIL" : "PASS",
    area: areaCode,
    field: config.fieldName,
    order: config.orderCode,
    expectedPoints: config.expectedPoints,
    persistedPoints: rows.length,
    pointsWithImportAudit: rows.filter((row) => row.hasImportAudit).length,
    pointsInsideBoundary: rows.filter((row) => row.insideBoundary).length,
    pointsSrid4326: rows.filter((row) => Number(row.positionSrid) === 4326).length,
    sourceLayerAmostrasreal: rows.filter((row) => row.sourceLayer === "amostrasreal").length,
    noNumericReprojection: rows.filter((row) => String(row.reprojectionApplied) === "false").length,
    maxDriftFromImportMeters: roundMm(max(drift)),
    maxAxisRoundTripMeters: roundMm(max(roundTrip)),
    observedPositionCount: observedDelta.length,
    meanObservedVsImportedMeters: roundMm(mean(observedDelta)),
    maxObservedVsImportedMeters: roundMm(max(observedDelta)),
    blockers,
    privacy: "Nenhuma coordenada/UUID é impressa por esta auditoria.",
  };

  console.log(JSON.stringify(summary, null, 2));
  if (blockers.length) process.exitCode = 2;
} finally {
  await client.query("ROLLBACK").catch(() => {});
  await client.end();
}
