import { getPool } from "../src/lib/db.ts";
import { computeZoneBreakdownPct } from "../src/domain/ndvi-engine.ts";
import {
  NDVI_RASTER_ALGORITHM_VERSION,
  readNdviRasterArtifact,
  saveRequiredNdviRasterArtifact,
} from "../src/lib/ndvi-raster-storage.ts";
import {
  getFieldBoundaryGeoJson,
  getLatestNdviSnapshot,
  saveNdviSnapshot,
} from "../src/lib/repositories/ndvi.ts";
import { EARTH_SEARCH_NDVI_MOSAICKING_ORDER, earthSearchNdviProvider } from "../src/lib/satellite/earth-search-ndvi-provider.ts";

const expectedGuard = "PR88_CABEDA_OFFICIAL_RESULT";
const analysisCodes = ["AN-CABEDA-02", "AN-CABEDA-03"];
const HISTORY_LOOKBACK_DAYS = 120;
const MAX_CLOUD_COVER_PCT = 70;

function requireEnv(name, value) {
  if (!value) throw new Error(`${name} não configurado no environment de homologação.`);
}

async function resolveContexts() {
  const client = await getPool().connect();
  try {
    const guard = await client.query(
      `SELECT
         EXISTS (
           SELECT 1 FROM information_schema.columns
           WHERE table_schema='public' AND table_name='field_ndvi_snapshots' AND column_name='raster_object_key'
         ) AS has_037,
         EXISTS (
           SELECT 1 FROM homologation_write_guard WHERE guard_key = $1
         ) AS has_guard`,
      [expectedGuard],
    );
    if (!guard.rows[0]?.has_037 || !guard.rows[0]?.has_guard) {
      throw new Error("WRITE_GUARD_REFUSED: banco não é a homologação isolada preparada para o PR #88.");
    }

    const result = await client.query(
      `SELECT a.code,
              a.tenant_id::text AS "tenantId",
              a.created_by::text AS "userId",
              f.id::text AS "fieldId",
              f.name AS "fieldName",
              ST_IsValid(f.boundary) AS "boundaryValid",
              ST_IsEmpty(f.boundary) AS "boundaryEmpty"
       FROM analyses a
       JOIN crop_seasons cs ON cs.tenant_id=a.tenant_id AND cs.id=a.crop_season_id
       JOIN fields f ON f.tenant_id=cs.tenant_id AND f.id=cs.field_id
       WHERE a.code = ANY($1::text[])
       ORDER BY a.code`,
      [analysisCodes],
    );
    if (result.rows.length !== analysisCodes.length) {
      throw new Error(`WRITE_GUARD_REFUSED: esperado ${analysisCodes.length} contextos Cabeda, encontrados ${result.rows.length}.`);
    }
    for (const row of result.rows) {
      if (!row.tenantId || !row.userId || !row.fieldId) {
        throw new Error(`WRITE_GUARD_REFUSED: contexto incompleto para ${row.code ?? "análise desconhecida"}.`);
      }
      if (!row.boundaryValid || row.boundaryEmpty) {
        throw new Error(`NDVI_BLOCKED: limite geográfico inválido ou vazio para ${row.code}.`);
      }
    }
    return result.rows;
  } finally {
    client.release();
  }
}

async function archiveContext(context) {
  const boundary = await getFieldBoundaryGeoJson(context.tenantId, context.fieldId, context.userId);
  if (!boundary) throw new Error(`NDVI_BLOCKED: geometria não carregada para ${context.code}.`);

  const current = await getLatestNdviSnapshot(context.tenantId, context.fieldId, context.userId);
  if (
    current?.rasterObjectKey
    && current?.rasterSha256
    && current?.rasterBytes
    && current?.rasterWidth
    && current?.rasterHeight
  ) {
    const bytes = await readNdviRasterArtifact({
      tenantId: context.tenantId,
      fieldId: context.fieldId,
      key: current.rasterObjectKey,
      sha256: current.rasterSha256,
      bytes: current.rasterBytes,
    });
    return {
      status: "ALREADY_ARCHIVED",
      analysisCode: context.code,
      fieldName: context.fieldName,
      capturedAt: String(current.capturedAt).slice(0, 10),
      meanNdvi: current.meanNdvi,
      minNdvi: current.minNdvi,
      maxNdvi: current.maxNdvi,
      stddevNdvi: current.stddevNdvi,
      pixelCount: current.pixelCount,
      rasterBytes: bytes.length,
      rasterWidth: current.rasterWidth,
      rasterHeight: current.rasterHeight,
      storage: String(current.rasterObjectKey).startsWith("inline-ndvi:v1:") ? "inline-ndvi:v1" : "other",
      sha256Prefix: String(current.rasterSha256).slice(0, 16),
      integrityVerified: true,
    };
  }

  let scene;
  let capturedAt;
  let sourceStats;
  if (current) {
    capturedAt = String(current.capturedAt).slice(0, 10);
    sourceStats = {
      providerSceneId: current.providerSceneId ?? null,
      cloudCoverPct: current.cloudCoverPct ?? null,
      pixelCount: current.pixelCount,
      meanNdvi: current.meanNdvi,
      minNdvi: current.minNdvi,
      maxNdvi: current.maxNdvi,
      stddevNdvi: current.stddevNdvi ?? null,
      zoneBreakdownPct: current.zoneBreakdownPct ?? {},
    };
  } else {
    const toDate = new Date();
    const fromDate = new Date(toDate);
    fromDate.setUTCDate(fromDate.getUTCDate() - HISTORY_LOOKBACK_DAYS);
    const scenes = await earthSearchNdviProvider.fetchFieldNdviSeries({
      fieldBoundaryGeoJson: boundary,
      fromDate: fromDate.toISOString().slice(0, 10),
      toDate: toDate.toISOString().slice(0, 10),
      maxCloudCoverPct: MAX_CLOUD_COVER_PCT,
    });
    scene = scenes.at(-1);
    if (!scene) {
      throw new Error(`NDVI_BLOCKED: nenhuma cena Sentinel-2 válida nos últimos ${HISTORY_LOOKBACK_DAYS} dias para ${context.code}.`);
    }
    capturedAt = scene.capturedAt;
    sourceStats = {
      providerSceneId: scene.sceneId ?? null,
      cloudCoverPct: scene.cloudCoverPct ?? null,
      pixelCount: scene.pixelCount,
      meanNdvi: scene.meanNdvi,
      minNdvi: scene.minNdvi,
      maxNdvi: scene.maxNdvi,
      stddevNdvi: scene.stddevNdvi ?? null,
      zoneBreakdownPct: computeZoneBreakdownPct(scene.histogram),
    };
  }

  const raster = await earthSearchNdviProvider.fetchFieldNdviMap({
    fieldBoundaryGeoJson: boundary,
    capturedAt,
    maxCloudCoverPct: MAX_CLOUD_COVER_PCT,
  });
  const buffer = Buffer.from(raster.bytes);

  const stored = await saveRequiredNdviRasterArtifact({
    tenantId: context.tenantId,
    fieldId: context.fieldId,
    capturedAt,
    bytes: buffer,
  });

  const persisted = await saveNdviSnapshot({
    tenantId: context.tenantId,
    userId: context.userId,
    fieldId: context.fieldId,
    capturedAt,
    source: "SENTINEL_2",
    providerSceneId: sourceStats.providerSceneId,
    cloudCoverPct: sourceStats.cloudCoverPct,
    pixelCount: sourceStats.pixelCount,
    meanNdvi: sourceStats.meanNdvi,
    minNdvi: sourceStats.minNdvi,
    maxNdvi: sourceStats.maxNdvi,
    stddevNdvi: sourceStats.stddevNdvi,
    zoneBreakdownPct: sourceStats.zoneBreakdownPct,
    rasterArtifact: {
      key: stored.key,
      sha256: stored.sha256,
      bytes: stored.bytes,
      bbox: raster.bbox,
      width: raster.width,
      height: raster.height,
      algorithm: NDVI_RASTER_ALGORITHM_VERSION,
      mosaickingOrder: EARTH_SEARCH_NDVI_MOSAICKING_ORDER,
    },
  });

  const verified = await readNdviRasterArtifact({
    tenantId: context.tenantId,
    fieldId: context.fieldId,
    key: persisted.rasterObjectKey,
    sha256: persisted.rasterSha256,
    bytes: persisted.rasterBytes,
  });

  const signature = [...verified.subarray(0, 8)];
  const pngSignature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (signature.some((value, index) => value !== pngSignature[index])) {
    throw new Error(`NDVI_INTEGRITY_FAILED: artefato persistido de ${context.code} não é PNG válido.`);
  }

  return {
    status: "ARCHIVED",
    analysisCode: context.code,
    fieldName: context.fieldName,
    capturedAt,
    meanNdvi: persisted.meanNdvi,
    minNdvi: persisted.minNdvi,
    maxNdvi: persisted.maxNdvi,
    stddevNdvi: persisted.stddevNdvi,
    pixelCount: persisted.pixelCount,
    rasterBytes: persisted.rasterBytes,
    rasterWidth: persisted.rasterWidth,
    rasterHeight: persisted.rasterHeight,
    storage: String(persisted.rasterObjectKey).startsWith("inline-ndvi:v1:") ? "inline-ndvi:v1" : "other",
    sha256Prefix: String(persisted.rasterSha256).slice(0, 16),
    integrityVerified: true,
  };
}

async function main() {
  requireEnv("DATABASE_URL/APP_DATABASE_URL", (process.env.APP_DATABASE_URL ?? process.env.DATABASE_URL)?.trim() ?? "");
  const contexts = await resolveContexts();
  const results = [];
  for (const context of contexts) {
    results.push(await archiveContext(context));
  }
  console.log(JSON.stringify({ environment: "isolated-homologation", results }, null, 2));
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(async () => {
    await getPool().end().catch(() => {});
  });
