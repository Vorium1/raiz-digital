import pg from "pg";
import {
  ACCEPTED_REAL_GPS_SOURCES,
  evaluatePersistedSpatialProvenance,
} from "../src/domain/spatial-provenance-audit.ts";

/**
 * Auditoria SOMENTE LEITURA da geometria Cabeda já persistida em um banco autorizado.
 *
 * Objetivo: provar se Área 01/02 estão realmente usando contorno/pontos importados do pacote real,
 * sem precisar reabrir os GeoJSON privados e sem imprimir latitude/longitude do cliente no terminal.
 *
 * Exemplo em homologação:
 *   CABEDA_AUDIT_AREA=01 \
 *   CABEDA_TENANT_ID=<tenant> \
 *   CABEDA_ACTOR_USER_ID=<usuario-autorizado> \
 *   DATABASE_URL=<homologacao> \
 *   npm run cabeda:audit-geo
 *
 * Este script NÃO faz UPDATE/INSERT/DELETE. A transação é READ ONLY e sempre termina em ROLLBACK.
 */

const AREA_CONFIG = {
  "01": { fieldName: "Área 01", orderCode: "CO-CABEDA-01", expectedPoints: 8, expectedAreaHa: 4.32 },
  "02": { fieldName: "Área 02", orderCode: "CO-CABEDA-02", expectedPoints: 4, expectedAreaHa: 2.13 },
};

const areaCode = process.env.CABEDA_AUDIT_AREA?.trim() || "01";
const config = AREA_CONFIG[areaCode];
if (!config) throw new Error("CABEDA_AUDIT_AREA deve ser 01 ou 02. Área 03 não possui pacote espacial real homologado.");

const databaseUrl = process.env.DATABASE_URL?.trim();
const tenantId = process.env.CABEDA_TENANT_ID?.trim();
const actorUserId = process.env.CABEDA_ACTOR_USER_ID?.trim();
const clientName = process.env.CABEDA_AUDIT_CLIENT_NAME?.trim() || "Rafael Cabeda";
const areaTolerancePct = Number(process.env.CABEDA_AREA_TOLERANCE_PCT ?? "5");

if (!databaseUrl) throw new Error("DATABASE_URL é obrigatório.");
if (!Number.isFinite(areaTolerancePct) || areaTolerancePct <= 0 || areaTolerancePct > 100) {
  throw new Error("CABEDA_AREA_TOLERANCE_PCT inválido.");
}

const { Client } = pg;
const client = new Client({
  connectionString: databaseUrl,
  ssl: process.env.DATABASE_SSL === "require" ? { rejectUnauthorized: false } : undefined,
});

function asNumber(value) {
  if (value == null) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function privacySafeResult(audit, raw) {
  return {
    area: areaCode,
    field: config.fieldName,
    collectionOrder: config.orderCode,
    readyForReliableSpatialEvidence: audit.ready,
    blockers: audit.blockers,
    boundary: {
      exists: raw.boundary.exists,
      valid: raw.boundary.valid,
      srid: raw.boundary.srid,
      expectedAreaHa: config.expectedAreaHa,
      measuredAreaHa: raw.boundary.areaHa == null ? null : Number(raw.boundary.areaHa.toFixed(3)),
      differencePct: audit.areaDifferencePct == null ? null : Number(audit.areaDifferencePct.toFixed(2)),
    },
    points: {
      expected: config.expectedPoints,
      persisted: raw.points.count,
      uniqueCodes: raw.points.distinctCodeCount,
      positioned: raw.points.positionedCount,
      srid4326: raw.points.srid4326Count,
      acceptedRealGpsSource: raw.points.acceptedGpsSourceCount,
      spatiallyCoherent: raw.points.spatiallyCoherentCount,
      observedPositionCount: raw.points.observedPositionCount,
      observedOutsideBoundaryCount: raw.points.observedOutsideBoundaryCount,
      gpsSources: raw.points.gpsSources,
    },
    auditTrail: {
      auditedRealPoints: raw.audit.auditedRealPointCount,
      boundaryImportEvents: raw.audit.validBoundaryImportEvents,
    },
    note: audit.ready
      ? raw.points.observedOutsideBoundaryCount > 0
        ? "A posição-base auditada atende ao gate, mas existem observed_position legados fora do contorno. Eles não podem substituir a geometria real importada no mapa sem uma coleta posterior explicitamente registrada."
        : "Proveniência geométrica persistida atende ao gate de evidência real. Isso NÃO libera taxa variável sozinho; suporte amostral e política espacial continuam separados."
      : "Proveniência persistida não atende ao gate. Taxa variável deve permanecer bloqueada.",
  };
}

await client.connect();
try {
  await client.query("BEGIN TRANSACTION READ ONLY");

  let resolvedTenantId = tenantId;
  if (!resolvedTenantId) {
    const tenantCandidates = await client.query(
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
    if (tenantCandidates.rows.length === 0) {
      throw new Error(`Nenhum tenant contém o conjunto Cabeda esperado para ${config.fieldName}/${config.orderCode}.`);
    }
    if (tenantCandidates.rows.length > 1) {
      throw new Error(`Mais de um tenant contém o conjunto Cabeda esperado; informe CABEDA_TENANT_ID explicitamente.`);
    }
    resolvedTenantId = tenantCandidates.rows[0].id;
  }

  await client.query("SELECT set_config('app.tenant_id', $1, true)", [resolvedTenantId]);
  if (actorUserId) await client.query("SELECT set_config('app.user_id', $1, true)", [actorUserId]);

  const fields = await client.query(
    `SELECT f.id::text,
            f.boundary IS NOT NULL AS "boundaryExists",
            CASE WHEN f.boundary IS NULL THEN false ELSE ST_IsValid(f.boundary) END AS "boundaryValid",
            CASE WHEN f.boundary IS NULL THEN null ELSE ST_SRID(f.boundary) END AS "boundarySrid",
            CASE WHEN f.boundary IS NULL THEN null ELSE ST_Area(f.boundary::geography)/10000.0 END AS "boundaryAreaHa"
     FROM fields f
     JOIN properties p ON p.tenant_id=f.tenant_id AND p.id=f.property_id
     JOIN clients c ON c.tenant_id=p.tenant_id AND c.id=p.client_id
     WHERE f.tenant_id=$1::uuid AND c.name=$2 AND f.name=$3
     ORDER BY f.created_at DESC
     LIMIT 2`,
    [resolvedTenantId, clientName, config.fieldName],
  );
  if (fields.rows.length === 0) throw new Error(`Talhão ${config.fieldName} de ${clientName} não encontrado no tenant informado.`);
  if (fields.rows.length > 1) throw new Error(`Existem múltiplos talhões ${config.fieldName} para ${clientName}; a auditoria não escolhe automaticamente um alvo ambíguo.`);
  const field = fields.rows[0];

  const orders = await client.query(
    `SELECT co.id::text
     FROM collection_orders co
     JOIN crop_seasons cs ON cs.tenant_id=co.tenant_id AND cs.id=co.crop_season_id
     WHERE co.tenant_id=$1::uuid AND cs.field_id=$2::uuid AND co.code=$3
     ORDER BY co.created_at DESC
     LIMIT 2`,
    [resolvedTenantId, field.id, config.orderCode],
  );
  if (orders.rows.length === 0) throw new Error(`Ordem ${config.orderCode} não encontrada para ${config.fieldName}.`);
  if (orders.rows.length > 1) throw new Error(`Há mais de uma ordem ${config.orderCode}; a auditoria não escolhe automaticamente uma ordem ambígua.`);
  const orderId = orders.rows[0].id;

  const pointStats = await client.query(
    `SELECT COUNT(*)::int AS count,
            COUNT(DISTINCT sp.code)::int AS "distinctCodeCount",
            COUNT(*) FILTER (WHERE sp.position IS NOT NULL)::int AS "positionedCount",
            COUNT(*) FILTER (WHERE sp.position IS NOT NULL AND ST_SRID(sp.position)=4326)::int AS "srid4326Count",
            COUNT(*) FILTER (WHERE sp.gps_source = ANY($4::text[]))::int AS "acceptedGpsSourceCount",
            COUNT(*) FILTER (
              WHERE sp.position IS NOT NULL
                AND f.boundary IS NOT NULL
                AND (
                  ST_Covers(f.boundary, sp.position)
                  OR ST_DWithin(f.boundary::geography, sp.position::geography, 5)
                )
            )::int AS "spatiallyCoherentCount",
            COUNT(*) FILTER (WHERE sp.observed_position IS NOT NULL)::int AS "observedPositionCount",
            COUNT(*) FILTER (
              WHERE sp.observed_position IS NOT NULL
                AND f.boundary IS NOT NULL
                AND NOT (
                  ST_Covers(f.boundary, sp.observed_position)
                  OR ST_DWithin(f.boundary::geography, sp.observed_position::geography, 5)
                )
            )::int AS "observedOutsideBoundaryCount",
            COALESCE(array_agg(DISTINCT coalesce(sp.gps_source,'NULL')), ARRAY[]::text[]) AS "gpsSources"
     FROM sample_points sp
     JOIN fields f ON f.tenant_id=sp.tenant_id AND f.id=$2::uuid
     WHERE sp.tenant_id=$1::uuid AND sp.collection_order_id=$3::uuid`,
    [resolvedTenantId, field.id, orderId, [...ACCEPTED_REAL_GPS_SOURCES]],
  );
  const points = pointStats.rows[0];

  const auditStats = await client.query(
    `SELECT
       COUNT(DISTINCT ae.entity_id) FILTER (
         WHERE ae.action='SAMPLE_POINT_REAL_GEOMETRY_IMPORTED'
           AND ae.entity_type='sample_point'
           AND ae.metadata->>'sourceLayer'='amostrasreal'
           AND ae.metadata->>'targetSrid'='4326'
           AND coalesce(ae.metadata->>'reprojectionApplied','false')='false'
           AND ae.metadata->>'sourceCrs' IN ('EPSG:4326','GEOGRAPHIC_LONLAT_GPS_DATUM_UNDECLARED')
       )::int AS "auditedRealPointCount",
       COUNT(*) FILTER (
         WHERE ae.action='FIELD_REAL_BOUNDARY_IMPORTED'
           AND ae.entity_type='field'
           AND ae.entity_id=$2::uuid
           AND ae.metadata->>'sourceLayer'='contorno'
           AND ae.metadata->>'targetSrid'='4326'
           AND coalesce(ae.metadata->>'reprojectionApplied','false')='false'
           AND ae.metadata->>'sourceCrs' IN ('EPSG:4326','GEOGRAPHIC_LONLAT_GPS_DATUM_UNDECLARED')
       )::int AS "validBoundaryImportEvents"
     FROM audit_events ae
     WHERE ae.tenant_id=$1::uuid
       AND (
         ae.entity_id=$2::uuid
         OR ae.entity_id IN (
           SELECT sp.id FROM sample_points sp
           WHERE sp.tenant_id=$1::uuid AND sp.collection_order_id=$3::uuid
         )
       )`,
    [resolvedTenantId, field.id, orderId],
  );
  const auditRow = auditStats.rows[0];

  const evidence = {
    expectedPointCount: config.expectedPoints,
    expectedAreaHa: config.expectedAreaHa,
    areaTolerancePct,
    boundary: {
      exists: Boolean(field.boundaryExists),
      valid: Boolean(field.boundaryValid),
      srid: asNumber(field.boundarySrid),
      areaHa: asNumber(field.boundaryAreaHa),
    },
    points: {
      count: Number(points.count),
      distinctCodeCount: Number(points.distinctCodeCount),
      positionedCount: Number(points.positionedCount),
      srid4326Count: Number(points.srid4326Count),
      acceptedGpsSourceCount: Number(points.acceptedGpsSourceCount),
      spatiallyCoherentCount: Number(points.spatiallyCoherentCount),
      observedPositionCount: Number(points.observedPositionCount),
      observedOutsideBoundaryCount: Number(points.observedOutsideBoundaryCount),
      gpsSources: points.gpsSources ?? [],
    },
    audit: {
      auditedRealPointCount: Number(auditRow.auditedRealPointCount),
      validBoundaryImportEvents: Number(auditRow.validBoundaryImportEvents),
    },
  };

  const audit = evaluatePersistedSpatialProvenance(evidence);
  console.log(JSON.stringify(privacySafeResult(audit, evidence), null, 2));
  if (!audit.ready) process.exitCode = 2;
} finally {
  await client.query("ROLLBACK").catch(() => {});
  await client.end();
}
