import assert from "node:assert/strict";
import { getPool } from "../src/lib/db.ts";
import {
  NDVI_RASTER_ALGORITHM_VERSION,
  readNdviRasterArtifact,
} from "../src/lib/ndvi-raster-storage.ts";
import { EARTH_SEARCH_NDVI_MOSAICKING_ORDER } from "../src/lib/satellite/earth-search-ndvi-provider.ts";

const expectedGuard = "PR88_CABEDA_OFFICIAL_RESULT";
const analysisCodes = ["AN-CABEDA-01", "AN-CABEDA-02", "AN-CABEDA-03"];
const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];

function requireEnv(name, value) {
  if (!value) throw new Error(`${name} não configurado no environment de homologação.`);
}

function bboxIsValid(value) {
  return Array.isArray(value)
    && value.length === 4
    && value.every((item) => typeof item === "number" && Number.isFinite(item))
    && value[0] < value[2]
    && value[1] < value[3];
}

function storageKind(key) {
  if (typeof key !== "string") return null;
  if (key.startsWith("inline-ndvi:v1:")) return "INLINE_NEON";
  if (key.startsWith("s3:v1:")) return "S3";
  return null;
}

function hasPngSignature(bytes) {
  return bytes.length >= PNG_SIGNATURE.length
    && PNG_SIGNATURE.every((expected, index) => bytes[index] === expected);
}

async function main() {
  requireEnv(
    "DATABASE_URL/APP_DATABASE_URL",
    (process.env.APP_DATABASE_URL ?? process.env.DATABASE_URL)?.trim() ?? "",
  );

  const client = await getPool().connect();
  let transactionOpen = false;
  try {
    await client.query("BEGIN READ ONLY");
    transactionOpen = true;

    const guard = await client.query(
      `SELECT
         EXISTS (
           SELECT 1 FROM homologation_write_guard WHERE guard_key = $1
         ) AS has_guard,
         EXISTS (
           SELECT 1
           FROM information_schema.columns
           WHERE table_schema='public'
             AND table_name='field_ndvi_snapshots'
             AND column_name='raster_object_key'
         ) AS has_037,
         COALESCE((
           SELECT pg_get_triggerdef(t.oid)
           FROM pg_trigger t
           JOIN pg_class c ON c.oid=t.tgrelid
           JOIN pg_namespace n ON n.oid=c.relnamespace
           WHERE n.nspname='public'
             AND c.relname='field_ndvi_snapshots'
             AND t.tgname='field_ndvi_snapshots_protect_archived'
             AND NOT t.tgisinternal
           LIMIT 1
         ), '') AS trigger_definition,
         has_table_privilege('raiz_app', 'public.field_ndvi_snapshots', 'DELETE') AS runtime_delete_allowed`,
      [expectedGuard],
    );

    const guardState = guard.rows[0];
    assert.equal(guardState?.has_guard, true, "Banco não possui o sentinela isolado do PR #88.");
    assert.equal(guardState?.has_037, true, "Migration 037 não está comprovadamente aplicada.");
    const triggerDefinition = String(guardState?.trigger_definition ?? "");
    assert.match(triggerDefinition, /BEFORE/i);
    assert.match(triggerDefinition, /UPDATE/i);
    assert.match(triggerDefinition, /DELETE/i);
    assert.match(triggerDefinition, /protect_archived_ndvi_snapshot/i);
    assert.equal(guardState?.runtime_delete_allowed, false, "raiz_app não pode possuir DELETE sobre snapshots NDVI.");

    const query = await client.query(
      `SELECT
         a.code,
         a.tenant_id::text AS "tenantId",
         f.id::text AS "fieldId",
         f.name AS "fieldName",
         n.captured_at::text AS "capturedAt",
         n.source,
         n.provider_scene_id AS "providerSceneId",
         n.raster_object_key AS "rasterObjectKey",
         n.raster_sha256 AS "rasterSha256",
         n.raster_bytes AS "rasterBytes",
         n.raster_bbox AS "rasterBbox",
         n.raster_width AS "rasterWidth",
         n.raster_height AS "rasterHeight",
         n.raster_algorithm AS "rasterAlgorithm",
         n.raster_mosaicking_order AS "rasterMosaickingOrder",
         n.raster_archived_at::text AS "rasterArchivedAt"
       FROM analyses a
       JOIN crop_seasons cs
         ON cs.tenant_id=a.tenant_id
        AND cs.id=a.crop_season_id
       JOIN fields f
         ON f.tenant_id=cs.tenant_id
        AND f.id=cs.field_id
       LEFT JOIN LATERAL (
         SELECT *
         FROM field_ndvi_snapshots n
         WHERE n.tenant_id=a.tenant_id
           AND n.field_id=f.id
           AND n.raster_algorithm = $2::text
         ORDER BY n.captured_at DESC, n.created_at DESC
         LIMIT 1
       ) n ON true
       WHERE a.code = ANY($1::text[])
       ORDER BY a.code`,
      [analysisCodes, NDVI_RASTER_ALGORITHM_VERSION],
    );

    assert.equal(query.rows.length, analysisCodes.length, "Homologação precisa conter exatamente as três análises Cabeda canônicas.");
    const tenantIds = [...new Set(query.rows.map((row) => row.tenantId))];
    assert.equal(tenantIds.length, 1, "As três análises Cabeda precisam pertencer ao mesmo tenant.");
    await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenantIds[0]]);

    const results = [];
    for (const row of query.rows) {
      assert.ok(row.rasterObjectKey, `${row.code}: raster não arquivado.`);
      assert.match(String(row.rasterSha256 ?? ""), /^[a-f0-9]{64}$/);
      assert.ok(Number.isSafeInteger(Number(row.rasterBytes)) && Number(row.rasterBytes) > 0, `${row.code}: raster_bytes inválido.`);
      assert.ok(bboxIsValid(row.rasterBbox), `${row.code}: bbox do raster inválido.`);
      assert.ok(Number.isSafeInteger(Number(row.rasterWidth)) && Number(row.rasterWidth) > 0, `${row.code}: largura inválida.`);
      assert.ok(Number.isSafeInteger(Number(row.rasterHeight)) && Number(row.rasterHeight) > 0, `${row.code}: altura inválida.`);
      assert.equal(row.rasterAlgorithm, NDVI_RASTER_ALGORITHM_VERSION, `${row.code}: algoritmo NDVI inesperado.`);
      assert.equal(row.rasterMosaickingOrder, EARTH_SEARCH_NDVI_MOSAICKING_ORDER, `${row.code}: mosaicking incompatível com Earth Search.`);
      assert.ok(row.rasterArchivedAt, `${row.code}: raster_archived_at ausente.`);

      const storage = storageKind(row.rasterObjectKey);
      assert.ok(storage, `${row.code}: storage do raster não é durável/suportado.`);

      const bytes = await readNdviRasterArtifact({
        tenantId: row.tenantId,
        fieldId: row.fieldId,
        key: row.rasterObjectKey,
        sha256: row.rasterSha256,
        bytes: Number(row.rasterBytes),
      });
      assert.equal(hasPngSignature(bytes), true, `${row.code}: artefato recuperado não é PNG válido.`);

      results.push({
        code: row.code,
        fieldName: row.fieldName,
        capturedAt: String(row.capturedAt).slice(0, 10),
        storage,
        rasterBytes: bytes.length,
        rasterWidth: Number(row.rasterWidth),
        rasterHeight: Number(row.rasterHeight),
        algorithm: row.rasterAlgorithm,
        mosaickingOrder: row.rasterMosaickingOrder,
        providerSceneIdPresent: Boolean(row.providerSceneId),
        objectIntegrityVerified: true,
        pngSignatureVerified: true,
        databaseImmutabilityVerified: true,
        runtimeDeletePrivilegeRevoked: true,
      });
    }

    await client.query("ROLLBACK");
    transactionOpen = false;

    console.log(JSON.stringify({
      environment: "isolated-homologation-read-only",
      mode: "BEGIN READ ONLY + ROLLBACK",
      provider: "Earth Search / Sentinel-2 L2A",
      results,
    }, null, 2));
  } finally {
    if (transactionOpen) await client.query("ROLLBACK").catch(() => {});
    client.release();
    await getPool().end().catch(() => {});
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
