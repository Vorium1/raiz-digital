import pg from "pg";
import { auditEarthSearchReflectanceQuality } from "../src/lib/satellite/earth-search-ndvi-provider.ts";

const EXPECTED_GUARD = "PR88_CABEDA_OFFICIAL_RESULT";
const TARGET_FIELDS = ["Área 01", "Área 02", "Área 03"];

async function main() {
  const databaseUrl = (process.env.APP_DATABASE_URL ?? process.env.DATABASE_URL)?.trim();
  if (!databaseUrl) throw new Error("READ_ONLY_AUDIT_REFUSED: URL da homologação ausente.");

  const pool = new pg.Pool({
    connectionString: databaseUrl,
    max: 1,
    ssl: process.env.DATABASE_SSL === "require" ? { rejectUnauthorized: false } : undefined,
  });
  const client = await pool.connect();
  try {
    const guard = await client.query(
      `SELECT EXISTS (
         SELECT 1 FROM homologation_write_guard WHERE guard_key = $1
       ) AS ok`,
      [EXPECTED_GUARD],
    );
    if (!guard.rows[0]?.ok) {
      throw new Error("READ_ONLY_AUDIT_REFUSED: banco não é a homologação isolada esperada.");
    }

    const fields = await client.query(
      `WITH current_valid AS (
         SELECT f.id,
                f.tenant_id,
                f.name,
                ST_AsGeoJSON(f.boundary)::json AS boundary,
                n.captured_at,
                ROW_NUMBER() OVER (PARTITION BY f.id ORDER BY n.captured_at DESC) AS rn
         FROM fields f
         JOIN field_ndvi_snapshots n
           ON n.tenant_id=f.tenant_id
          AND n.field_id=f.id
         WHERE f.name = ANY($1::text[])
           AND n.raster_bbox IS NOT NULL
           AND (n.raster_bbox->>0)::float8 <= ST_XMin(f.boundary) + 1e-6
           AND (n.raster_bbox->>1)::float8 <= ST_YMin(f.boundary) + 1e-6
           AND (n.raster_bbox->>2)::float8 >= ST_XMax(f.boundary) - 1e-6
           AND (n.raster_bbox->>3)::float8 >= ST_YMax(f.boundary) - 1e-6
       )
       SELECT name, boundary, captured_at::text AS captured_at
       FROM current_valid
       WHERE rn=1
       ORDER BY name`,
      [TARGET_FIELDS],
    );

    if (fields.rows.length !== TARGET_FIELDS.length) {
      throw new Error(`READ_ONLY_AUDIT_INCOMPLETE: esperados ${TARGET_FIELDS.length} talhões, encontrados ${fields.rows.length}.`);
    }

    const results = [];
    for (const row of fields.rows) {
      const audits = await auditEarthSearchReflectanceQuality({
        fieldBoundaryGeoJson: row.boundary,
        fromDate: row.captured_at,
        toDate: row.captured_at,
        maxCloudCoverPct: 70,
      });
      const scene = audits.find((item) => item.capturedAt === row.captured_at) ?? audits.at(-1) ?? null;
      if (!scene) {
        results.push({ fieldName: row.name, capturedAt: row.captured_at, status: "NO_SCENE" });
        continue;
      }

      results.push({
        fieldName: row.name,
        capturedAt: scene.capturedAt,
        sceneId: scene.sceneId,
        declaredCloudCoverPct: Number(scene.declaredCloudCoverPct.toFixed(2)),
        insidePixels: scene.insidePixels,
        validSclPixels: scene.validSclPixels,
        usablePairs: scene.usablePairs,
        negativeRedPixels: scene.negativeRedPixels,
        negativeNirPixels: scene.negativeNirPixels,
        nonPositiveDenominatorPixels: scene.nonPositiveDenominatorPixels,
        rawNdviOverOnePixels: scene.rawNdviOverOnePixels,
        rawNdviUnderMinusOnePixels: scene.rawNdviUnderMinusOnePixels,
        rawNdviWithinRangePixels: scene.rawNdviWithinRangePixels,
        rawNdviMin: scene.rawNdviMin == null ? null : Number(scene.rawNdviMin.toFixed(6)),
        rawNdviMax: scene.rawNdviMax == null ? null : Number(scene.rawNdviMax.toFixed(6)),
        rawNdviMean: scene.rawNdviMean == null ? null : Number(scene.rawNdviMean.toFixed(6)),
        redScale: scene.redScale,
        redOffset: scene.redOffset,
        nirScale: scene.nirScale,
        nirOffset: scene.nirOffset,
        rawRedMin: scene.rawRedMin,
        rawRedMax: scene.rawRedMax,
        rawNirMin: scene.rawNirMin,
        rawNirMax: scene.rawNirMax,
        physicalRedMin: scene.physicalRedMin == null ? null : Number(scene.physicalRedMin.toFixed(6)),
        physicalRedMax: scene.physicalRedMax == null ? null : Number(scene.physicalRedMax.toFixed(6)),
        physicalNirMin: scene.physicalNirMin == null ? null : Number(scene.physicalNirMin.toFixed(6)),
        physicalNirMax: scene.physicalNirMax == null ? null : Number(scene.physicalNirMax.toFixed(6)),
      });
    }

    console.log(JSON.stringify({
      environment: "isolated-homologation",
      mode: "READ_ONLY",
      coordinatesLogged: false,
      results,
    }, null, 2));
  } finally {
    client.release();
    await pool.end().catch(() => {});
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
