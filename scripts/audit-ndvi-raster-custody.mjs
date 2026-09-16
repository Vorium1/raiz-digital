import pg from "pg";
import {
  NDVI_RASTER_ALGORITHM_VERSION,
  readNdviRasterArtifact,
} from "../src/lib/ndvi-raster-storage.ts";
import { COPERNICUS_NDVI_MOSAICKING_ORDER } from "../src/lib/satellite/copernicus-ndvi-provider.ts";

/**
 * Auditoria SOMENTE LEITURA da cadeia de custódia NDVI em um ambiente autorizado.
 *
 * Prova, sem reconsultar o Copernicus, que:
 * - migration 037 está aplicada;
 * - o snapshot aponta para um objeto S3 durável;
 * - metadados espaciais/algoritmo estão completos;
 * - o objeto pode ser recuperado;
 * - bytes e SHA-256 conferem com o PostgreSQL.
 *
 * Não imprime bbox/coordenadas do talhão e não executa INSERT/UPDATE/DELETE.
 *
 * Exemplo:
 *   HOMOLOGATION_DATABASE_URL=<url> \
 *   NDVI_AUDIT_TENANT_ID=<tenant-uuid> \
 *   NDVI_AUDIT_FIELD_ID=<field-uuid> \
 *   NDVI_AUDIT_DATE=2026-09-10 \
 *   STORAGE_PROVIDER=s3 \
 *   S3_ENDPOINT=<...> S3_BUCKET=<...> S3_ACCESS_KEY=<...> S3_SECRET_KEY=<...> \
 *   npm run ndvi:audit-raster
 */

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const REQUIRED_COLUMNS = [
  "raster_object_key",
  "raster_sha256",
  "raster_bytes",
  "raster_bbox",
  "raster_width",
  "raster_height",
  "raster_algorithm",
  "raster_mosaicking_order",
  "raster_archived_at",
];

const databaseUrl = process.env.HOMOLOGATION_DATABASE_URL?.trim();
const tenantId = process.env.NDVI_AUDIT_TENANT_ID?.trim();
const fieldId = process.env.NDVI_AUDIT_FIELD_ID?.trim();
const actorUserId = process.env.NDVI_AUDIT_ACTOR_USER_ID?.trim();
const requestedDate = process.env.NDVI_AUDIT_DATE?.trim() || null;
const provider = (process.env.STORAGE_PROVIDER ?? "").trim().toLowerCase();

if (!databaseUrl) throw new Error("HOMOLOGATION_DATABASE_URL é obrigatório; esta auditoria não escolhe banco implicitamente.");
if (!tenantId) throw new Error("NDVI_AUDIT_TENANT_ID é obrigatório.");
if (!fieldId) throw new Error("NDVI_AUDIT_FIELD_ID é obrigatório.");
if (requestedDate && !DATE_RE.test(requestedDate)) throw new Error("NDVI_AUDIT_DATE deve usar YYYY-MM-DD.");
if (provider !== "s3") throw new Error("A prova de homologação exige STORAGE_PROVIDER=s3; storage local não comprova persistência durável.");

const { Client } = pg;
const client = new Client({
  connectionString: databaseUrl,
  ssl: process.env.DATABASE_SSL === "require" ? { rejectUnauthorized: false } : undefined,
});

function bboxIsValid(value) {
  if (!Array.isArray(value) || value.length !== 4 || value.some((item) => typeof item !== "number" || !Number.isFinite(item))) return false;
  const [minLon, minLat, maxLon, maxLat] = value;
  return minLon < maxLon && minLat < maxLat;
}

await client.connect();
let transactionOpen = false;
try {
  await client.query("BEGIN TRANSACTION READ ONLY");
  transactionOpen = true;
  await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);
  if (actorUserId) await client.query("SELECT set_config('app.user_id', $1, true)", [actorUserId]);

  const columnResult = await client.query(
    `SELECT column_name
     FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'field_ndvi_snapshots'
       AND column_name = ANY($1::text[])`,
    [REQUIRED_COLUMNS],
  );
  const presentColumns = new Set(columnResult.rows.map((row) => row.column_name));
  const missingColumns = REQUIRED_COLUMNS.filter((column) => !presentColumns.has(column));
  if (missingColumns.length) {
    throw new Error(`Migration 037 não está comprovadamente aplicada; colunas ausentes: ${missingColumns.join(", ")}.`);
  }

  const fieldResult = await client.query(
    `SELECT id::text
     FROM fields
     WHERE tenant_id = $1::uuid AND id = $2::uuid
     LIMIT 1`,
    [tenantId, fieldId],
  );
  if (!fieldResult.rows[0]) throw new Error("Talhão não encontrado no tenant informado; a auditoria não procura outro alvo automaticamente.");

  const snapshotResult = await client.query(
    `SELECT id::text AS id,
            captured_at::text AS "capturedAt",
            source,
            provider_scene_id AS "providerSceneId",
            raster_object_key AS "rasterObjectKey",
            raster_sha256 AS "rasterSha256",
            raster_bytes AS "rasterBytes",
            raster_bbox AS "rasterBbox",
            raster_width AS "rasterWidth",
            raster_height AS "rasterHeight",
            raster_algorithm AS "rasterAlgorithm",
            raster_mosaicking_order AS "rasterMosaickingOrder",
            raster_archived_at::text AS "rasterArchivedAt"
     FROM field_ndvi_snapshots
     WHERE tenant_id = $1::uuid
       AND field_id = $2::uuid
       AND source = 'SENTINEL_2'
       AND ($3::date IS NULL OR captured_at = $3::date)
     ORDER BY captured_at DESC
     LIMIT 2`,
    [tenantId, fieldId, requestedDate],
  );

  if (snapshotResult.rows.length === 0) {
    throw new Error(requestedDate
      ? `Nenhum snapshot Sentinel-2 encontrado para ${requestedDate}.`
      : "Nenhum snapshot Sentinel-2 encontrado para o talhão informado.");
  }
  if (requestedDate && snapshotResult.rows.length > 1) {
    throw new Error("Mais de um snapshot Sentinel-2 foi encontrado para a mesma data; o alvo está ambíguo.");
  }

  const snapshot = snapshotResult.rows[0];
  const blockers = [];
  if (!snapshot.rasterObjectKey?.startsWith("s3:v1:")) blockers.push("RASTER_NOT_DURABLE_S3");
  if (!/^[a-f0-9]{64}$/.test(snapshot.rasterSha256 ?? "")) blockers.push("RASTER_SHA256_MISSING_OR_INVALID");
  if (!Number.isSafeInteger(Number(snapshot.rasterBytes)) || Number(snapshot.rasterBytes) <= 0) blockers.push("RASTER_BYTES_INVALID");
  if (!bboxIsValid(snapshot.rasterBbox)) blockers.push("RASTER_BBOX_INVALID");
  if (!Number.isSafeInteger(Number(snapshot.rasterWidth)) || Number(snapshot.rasterWidth) <= 0) blockers.push("RASTER_WIDTH_INVALID");
  if (!Number.isSafeInteger(Number(snapshot.rasterHeight)) || Number(snapshot.rasterHeight) <= 0) blockers.push("RASTER_HEIGHT_INVALID");
  if (snapshot.rasterAlgorithm !== NDVI_RASTER_ALGORITHM_VERSION) blockers.push("RASTER_ALGORITHM_UNEXPECTED");
  if (snapshot.rasterMosaickingOrder !== COPERNICUS_NDVI_MOSAICKING_ORDER) blockers.push("RASTER_MOSAICKING_UNEXPECTED");
  if (!snapshot.rasterArchivedAt) blockers.push("RASTER_ARCHIVED_AT_MISSING");

  if (blockers.length) {
    console.log(JSON.stringify({
      readyForImmutableRasterEvidence: false,
      capturedAt: snapshot.capturedAt,
      blockers,
      note: "Metadados persistidos ainda não atendem ao gate de custódia; nenhum objeto foi aceito como evidência.",
    }, null, 2));
    process.exitCode = 2;
  } else {
    const bytes = await readNdviRasterArtifact({
      tenantId,
      fieldId,
      key: snapshot.rasterObjectKey,
      sha256: snapshot.rasterSha256,
      bytes: Number(snapshot.rasterBytes),
    });

    console.log(JSON.stringify({
      readyForImmutableRasterEvidence: true,
      capturedAt: snapshot.capturedAt,
      source: snapshot.source,
      providerSceneIdPresent: Boolean(snapshot.providerSceneId),
      storage: "S3",
      sha256: snapshot.rasterSha256,
      bytes: bytes.length,
      dimensions: `${snapshot.rasterWidth}x${snapshot.rasterHeight}`,
      bboxValid: true,
      algorithm: snapshot.rasterAlgorithm,
      mosaickingOrder: snapshot.rasterMosaickingOrder,
      archivedAtPresent: true,
      objectIntegrityVerified: true,
      note: "Objeto recuperado do storage durável e validado por SHA-256/bytes contra o snapshot. Coordenadas do talhão não foram impressas.",
    }, null, 2));
  }
} finally {
  if (transactionOpen) await client.query("ROLLBACK").catch(() => {});
  await client.end().catch(() => {});
}
