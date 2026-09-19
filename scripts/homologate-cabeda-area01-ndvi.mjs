import { getPool } from "../src/lib/db.ts";
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
const analysisCode = "AN-CABEDA-01";

function requireEnv(name, value) {
  if (!value) throw new Error(`${name} não configurado no environment de homologação.`);
}

async function resolveContext() {
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
      `SELECT a.tenant_id::text AS "tenantId",
              a.created_by::text AS "userId",
              f.id::text AS "fieldId",
              f.name AS "fieldName",
              ST_IsValid(f.boundary) AS "boundaryValid",
              ST_IsEmpty(f.boundary) AS "boundaryEmpty"
       FROM analyses a
       JOIN crop_seasons cs ON cs.tenant_id=a.tenant_id AND cs.id=a.crop_season_id
       JOIN fields f ON f.tenant_id=cs.tenant_id AND f.id=cs.field_id
       WHERE a.code=$1
       LIMIT 1`,
      [analysisCode],
    );
    const row = result.rows[0];
    if (!row?.tenantId || !row?.userId || !row?.fieldId) {
      throw new Error("WRITE_GUARD_REFUSED: contexto Cabeda Área 01 não encontrado.");
    }
    if (!row.boundaryValid || row.boundaryEmpty) {
      throw new Error("NDVI_BLOCKED: limite geográfico da Área 01 é inválido ou vazio.");
    }
    return row;
  } finally {
    client.release();
  }
}

async function main() {
  requireEnv("DATABASE_URL/APP_DATABASE_URL", (process.env.APP_DATABASE_URL ?? process.env.DATABASE_URL)?.trim() ?? "");
  const context = await resolveContext();

  const boundary = await getFieldBoundaryGeoJson(context.tenantId, context.fieldId, context.userId);
  if (!boundary) throw new Error("NDVI_BLOCKED: geometria da Área 01 não foi carregada.");

  const current = await getLatestNdviSnapshot(context.tenantId, context.fieldId, context.userId);
  if (!current) {
    throw new Error("NDVI_BLOCKED: Área 01 não possui snapshot estatístico legado para promoção segura.");
  }

  if (
    current.rasterObjectKey
    && current.rasterSha256
    && current.rasterBytes
    && current.rasterWidth
    && current.rasterHeight
  ) {
    const bytes = await readNdviRasterArtifact({
      tenantId: context.tenantId,
      fieldId: context.fieldId,
      key: current.rasterObjectKey,
      sha256: current.rasterSha256,
      bytes: current.rasterBytes,
    });
    console.log(JSON.stringify({
      status: "ALREADY_ARCHIVED",
      analysisCode,
      fieldName: context.fieldName,
      capturedAt: String(current.capturedAt).slice(0, 10),
      meanNdvi: current.meanNdvi,
      pixelCount: current.pixelCount,
      rasterBytes: bytes.length,
      rasterWidth: current.rasterWidth,
      rasterHeight: current.rasterHeight,
      storage: current.rasterObjectKey.startsWith("inline-ndvi:v1:") ? "inline-ndvi:v1" : "other",
      sha256Prefix: String(current.rasterSha256).slice(0, 16),
    }, null, 2));
    return;
  }

  const capturedAt = String(current.capturedAt).slice(0, 10);
  const raster = await earthSearchNdviProvider.fetchFieldNdviMap({
    fieldBoundaryGeoJson: boundary,
    capturedAt,
    maxCloudCoverPct: 70,
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
    source: current.source ?? "SENTINEL_2",
    providerSceneId: current.providerSceneId ?? null,
    cloudCoverPct: current.cloudCoverPct ?? null,
    pixelCount: current.pixelCount,
    meanNdvi: current.meanNdvi,
    minNdvi: current.minNdvi,
    maxNdvi: current.maxNdvi,
    stddevNdvi: current.stddevNdvi ?? null,
    zoneBreakdownPct: current.zoneBreakdownPct ?? {},
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
    throw new Error("NDVI_INTEGRITY_FAILED: artefato persistido não possui assinatura PNG válida.");
  }

  console.log(JSON.stringify({
    status: "ARCHIVED",
    analysisCode,
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
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(async () => {
    await getPool().end().catch(() => {});
  });
