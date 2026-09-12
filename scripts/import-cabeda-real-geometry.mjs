import fs from "node:fs/promises";
import pg from "pg";

/**
 * Importação SEGURA da geometria real Cabeda 01/02 depois da conversão dos shapefiles para GeoJSON.
 *
 * Os pacotes originais `CABEDA 01.rar` e `CABEDA 02.rar` não trazem `.prj`. Por isso este script NUNCA
 * tenta adivinhar CRS e NUNCA lê coordenada projetada como se fosse latitude/longitude. Primeiro o CRS de
 * origem precisa ser confirmado e a conversão para EPSG:4326 precisa ser feita por ferramenta GIS.
 *
 * Exemplo (somente depois de confirmar o CRS de origem):
 *   CABEDA_GEO_AREA=01 \
 *   CABEDA_BOUNDARY_GEOJSON=/caminho/area01-contorno-4326.geojson \
 *   CABEDA_POINTS_GEOJSON=/caminho/area01-amostrasreal-4326.geojson \
 *   CABEDA_POINT_CODE_PROPERTY=CODIGO \
 *   CABEDA_SOURCE_CRS_CONFIRMED=EPSG:4326 \
 *   node scripts/import-cabeda-real-geometry.mjs
 *
 * O padrão é DRY-RUN (ROLLBACK). Para gravar no banco:
 *   CABEDA_GEO_APPLY=true ...
 *
 * Nunca usar este script para Área 03 sem um pacote espacial próprio da Área 03.
 */

const AREA_CONFIG = {
  "01": { fieldName: "Área 01", orderCode: "CO-CABEDA-01", expectedPoints: 8, expectedAreaHa: 4.32, sourcePackage: "CABEDA 01" },
  "02": { fieldName: "Área 02", orderCode: "CO-CABEDA-02", expectedPoints: 4, expectedAreaHa: 2.13, sourcePackage: "CABEDA 02" },
};

const areaCode = process.env.CABEDA_GEO_AREA?.trim();
const config = areaCode ? AREA_CONFIG[areaCode] : undefined;
if (!config) throw new Error("CABEDA_GEO_AREA deve ser 01 ou 02.");
if (process.env.CABEDA_SOURCE_CRS_CONFIRMED?.trim().toUpperCase() !== "EPSG:4326") {
  throw new Error("CRS não confirmado. Converta a fonte real para EPSG:4326 e defina CABEDA_SOURCE_CRS_CONFIRMED=EPSG:4326. Nunca adivinhe o CRS.");
}

const boundaryPath = process.env.CABEDA_BOUNDARY_GEOJSON?.trim();
const pointsPath = process.env.CABEDA_POINTS_GEOJSON?.trim();
const codeProperty = process.env.CABEDA_POINT_CODE_PROPERTY?.trim();
if (!boundaryPath || !pointsPath || !codeProperty) {
  throw new Error("Informe CABEDA_BOUNDARY_GEOJSON, CABEDA_POINTS_GEOJSON e CABEDA_POINT_CODE_PROPERTY.");
}

const apply = process.env.CABEDA_GEO_APPLY === "true";
const tolerancePct = Number(process.env.CABEDA_AREA_TOLERANCE_PCT ?? "25");
if (!Number.isFinite(tolerancePct) || tolerancePct <= 0 || tolerancePct > 100) throw new Error("CABEDA_AREA_TOLERANCE_PCT inválido.");

const TENANT_ID = process.env.CABEDA_TENANT_ID?.trim() || "dc3854e1-8721-4041-ba9c-1e8c1657202f";
const ACTOR_USER_ID = process.env.CABEDA_ACTOR_USER_ID?.trim() || "049d3717-84f9-42fc-97d7-aacc22304f5b";

function readGeometry(document, kind) {
  if (document?.type === "Feature") return document.geometry;
  if (document?.type === "FeatureCollection") {
    if (kind === "boundary") {
      if (document.features.length !== 1) throw new Error(`GeoJSON de contorno deve ter exatamente 1 feature; recebeu ${document.features.length}.`);
      return document.features[0]?.geometry;
    }
    return null;
  }
  if (document?.type && document.coordinates) return document;
  throw new Error(`GeoJSON ${kind} inválido.`);
}

function normalizePointCode(raw) {
  const text = String(raw ?? "").trim();
  if (!text) throw new Error(`Feature de ponto sem propriedade ${codeProperty}.`);
  const numeric = text.match(/(\d+)$/)?.[1];
  return numeric ? numeric.padStart(2, "0") : text;
}

const boundaryDoc = JSON.parse(await fs.readFile(boundaryPath, "utf8"));
const pointsDoc = JSON.parse(await fs.readFile(pointsPath, "utf8"));
const boundaryGeometry = readGeometry(boundaryDoc, "boundary");
if (!boundaryGeometry || !["Polygon", "MultiPolygon"].includes(boundaryGeometry.type)) throw new Error("Contorno precisa ser Polygon ou MultiPolygon.");
if (pointsDoc?.type !== "FeatureCollection") throw new Error("Pontos precisam ser um FeatureCollection.");
if (pointsDoc.features.length !== config.expectedPoints) {
  throw new Error(`${config.sourcePackage}: esperava ${config.expectedPoints} pontos reais, recebeu ${pointsDoc.features.length}.`);
}

const points = pointsDoc.features.map((feature, index) => {
  if (feature?.geometry?.type !== "Point") throw new Error(`Feature ${index + 1} não é Point.`);
  return { code: normalizePointCode(feature.properties?.[codeProperty]), geometry: feature.geometry, properties: feature.properties ?? {} };
});
const duplicated = points.map((p) => p.code).filter((code, index, all) => all.indexOf(code) !== index);
if (duplicated.length) throw new Error(`Códigos de ponto duplicados no GeoJSON: ${[...new Set(duplicated)].join(", ")}.`);

const { Client } = pg;
const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: process.env.DATABASE_SSL === "require" ? { rejectUnauthorized: false } : undefined });
await client.connect();

try {
  await client.query("BEGIN");
  await client.query("SELECT set_config('app.tenant_id', $1, true)", [TENANT_ID]);
  await client.query("SELECT set_config('app.user_id', $1, true)", [ACTOR_USER_ID]);

  const boundaryJson = JSON.stringify(boundaryGeometry);
  const geometryCheck = await client.query(
    `WITH g AS (
       SELECT ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON($1),4326))::geometry(MultiPolygon,4326) AS geom
     )
     SELECT ST_IsValid(geom) AS valid,
            ST_IsEmpty(geom) AS empty,
            ST_Area(geom::geography)/10000.0 AS "areaHa",
            ST_XMin(ST_Extent(geom)) AS xmin, ST_XMax(ST_Extent(geom)) AS xmax,
            ST_YMin(ST_Extent(geom)) AS ymin, ST_YMax(ST_Extent(geom)) AS ymax
     FROM g GROUP BY geom`,
    [boundaryJson],
  );
  const geo = geometryCheck.rows[0];
  if (!geo?.valid || geo?.empty) throw new Error("Contorno real inválido/vazio após leitura em EPSG:4326.");
  const areaHa = Number(geo.areaHa);
  const areaDiffPct = Math.abs(areaHa - config.expectedAreaHa) / config.expectedAreaHa * 100;
  if (areaDiffPct > tolerancePct) {
    throw new Error(`Área geométrica ${areaHa.toFixed(3)} ha diverge ${areaDiffPct.toFixed(1)}% da área cadastrada ${config.expectedAreaHa} ha (limite ${tolerancePct}%). Revisão humana necessária.`);
  }
  // Guarda simples contra eixo trocado/CRS errado: o dado confirmado como 4326 precisa cair no sul do Brasil.
  if (Number(geo.xmin) < -60 || Number(geo.xmax) > -45 || Number(geo.ymin) < -35 || Number(geo.ymax) > -20) {
    throw new Error(`Contorno fora da janela geográfica esperada para RS/SC (${geo.xmin},${geo.ymin})-(${geo.xmax},${geo.ymax}). Verifique CRS/eixos.`);
  }

  const fieldResult = await client.query(
    `SELECT f.id::text, f.name, f.area_ha::float8 AS "areaHa", ST_AsText(f.boundary) AS "beforeBoundary"
     FROM fields f
     JOIN properties p ON p.tenant_id=f.tenant_id AND p.id=f.property_id
     JOIN clients c ON c.tenant_id=p.tenant_id AND c.id=p.client_id
     WHERE f.tenant_id=$1::uuid AND c.name='Rafael Cabeda' AND f.name=$2
     ORDER BY f.created_at DESC LIMIT 1`,
    [TENANT_ID, config.fieldName],
  );
  const field = fieldResult.rows[0];
  if (!field) throw new Error(`Talhão ${config.fieldName} de Rafael Cabeda não encontrado.`);

  const orderResult = await client.query(
    `SELECT co.id::text FROM collection_orders co
     JOIN crop_seasons cs ON cs.tenant_id=co.tenant_id AND cs.id=co.crop_season_id
     WHERE co.tenant_id=$1::uuid AND cs.field_id=$2::uuid AND co.code=$3 LIMIT 1`,
    [TENANT_ID, field.id, config.orderCode],
  );
  const orderId = orderResult.rows[0]?.id;
  if (!orderId) throw new Error(`Ordem ${config.orderCode} não encontrada para ${config.fieldName}.`);

  const currentPoints = await client.query(
    `SELECT id::text, code, ST_AsText(position) AS "beforePosition", gps_source AS "gpsSource"
     FROM sample_points WHERE tenant_id=$1::uuid AND collection_order_id=$2::uuid ORDER BY code`,
    [TENANT_ID, orderId],
  );
  if (currentPoints.rowCount !== config.expectedPoints) {
    throw new Error(`Banco possui ${currentPoints.rowCount} pontos na ordem; esperado ${config.expectedPoints}. Nenhuma gravação feita.`);
  }
  const currentByCode = new Map(currentPoints.rows.map((row) => [row.code, row]));
  for (const point of points) if (!currentByCode.has(point.code)) throw new Error(`Ponto real ${point.code} não existe na ordem ${config.orderCode}.`);

  for (const point of points) {
    const check = await client.query(
      `WITH b AS (SELECT ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON($1),4326)) AS geom),
            p AS (SELECT ST_SetSRID(ST_GeomFromGeoJSON($2),4326) AS geom)
       SELECT ST_Covers(b.geom,p.geom) AS covered,
              ST_Distance(b.geom::geography,p.geom::geography) AS "distanceMeters",
              ST_X(p.geom) AS lon, ST_Y(p.geom) AS lat
       FROM b,p`,
      [boundaryJson, JSON.stringify(point.geometry)],
    );
    const spatial = check.rows[0];
    if (!spatial.covered && Number(spatial.distanceMeters) > 5) {
      throw new Error(`Ponto ${point.code} está ${Number(spatial.distanceMeters).toFixed(1)} m fora do contorno real (>5 m). Revisão necessária.`);
    }
    point.lon = Number(spatial.lon);
    point.lat = Number(spatial.lat);
    point.covered = Boolean(spatial.covered);
    point.distanceMeters = Number(spatial.distanceMeters);
  }

  console.table(points.map((p) => ({ area: areaCode, ponto: p.code, lat: p.lat, lon: p.lon, dentro: p.covered, distancia_m: p.distanceMeters.toFixed(2) })));
  console.log(`Área geométrica: ${areaHa.toFixed(3)} ha | cadastrada: ${config.expectedAreaHa.toFixed(3)} ha | diferença: ${areaDiffPct.toFixed(1)}%`);

  if (apply) {
    await client.query(
      `UPDATE fields SET boundary=ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON($3),4326))::geometry(MultiPolygon,4326)
       WHERE tenant_id=$1::uuid AND id=$2::uuid`,
      [TENANT_ID, field.id, boundaryJson],
    );

    for (const point of points) {
      const existing = currentByCode.get(point.code);
      const afterWkt = `POINT(${point.lon} ${point.lat})`;
      await client.query(
        `UPDATE sample_points
         SET position=ST_SetSRID(ST_GeomFromGeoJSON($4),4326)::geometry(Point,4326),
             gps_source='SHAPEFILE_REAL_CONFIRMADO',
             notes=concat_ws(E'\n', nullif(notes,''), $5)
         WHERE tenant_id=$1::uuid AND collection_order_id=$2::uuid AND code=$3`,
        [TENANT_ID, orderId, point.code, JSON.stringify(point.geometry), `[RAIZ 2026-09-12] Geometria real importada de ${config.sourcePackage}/amostrasreal; CRS convertido e confirmado em EPSG:4326.`],
      );
      await client.query(
        `INSERT INTO audit_events (tenant_id,actor_user_id,actor_type,action,entity_type,entity_id,before_data,after_data,metadata)
         VALUES ($1::uuid,$2::uuid,'USER','SAMPLE_POINT_REAL_GEOMETRY_IMPORTED','sample_point',$3::uuid,$4::jsonb,$5::jsonb,$6::jsonb)`,
        [TENANT_ID, ACTOR_USER_ID, existing.id,
          JSON.stringify({ positionWkt: existing.beforePosition, gpsSource: existing.gpsSource }),
          JSON.stringify({ positionWkt: afterWkt, gpsSource: "SHAPEFILE_REAL_CONFIRMADO" }),
          JSON.stringify({ sourcePackage: config.sourcePackage, sourceLayer: "amostrasreal", crs: "EPSG:4326", codeProperty })],
      );
    }

    await client.query(
      `INSERT INTO audit_events (tenant_id,actor_user_id,actor_type,action,entity_type,entity_id,before_data,after_data,metadata)
       VALUES ($1::uuid,$2::uuid,'USER','FIELD_REAL_BOUNDARY_IMPORTED','field',$3::uuid,$4::jsonb,$5::jsonb,$6::jsonb)`,
      [TENANT_ID, ACTOR_USER_ID, field.id,
        JSON.stringify({ boundaryWkt: field.beforeBoundary, areaHaRegistered: field.areaHa }),
        JSON.stringify({ geometryAreaHa: areaHa }),
        JSON.stringify({ sourcePackage: config.sourcePackage, sourceLayer: "contorno", crs: "EPSG:4326", expectedAreaHa: config.expectedAreaHa, differencePct: areaDiffPct })],
    );

    await client.query("COMMIT");
    console.log(`APLICADO — ${config.fieldName}: contorno e ${points.length} pontos reais atualizados com auditoria.`);
  } else {
    await client.query("ROLLBACK");
    console.log("DRY-RUN OK — todas as validações passaram; nenhuma alteração gravada. Use CABEDA_GEO_APPLY=true somente após revisão da tabela acima.");
  }
} catch (error) {
  await client.query("ROLLBACK").catch(() => {});
  throw error;
} finally {
  await client.end();
}
