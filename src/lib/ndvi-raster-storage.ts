import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { getS3Object, putS3Object } from "./s3-object-storage.ts";

const S3_OBJECT_PREFIX = "s3:v1:";
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Versão explícita da visualização categórica NDVI persistida. Se as faixas/cores/evalscript mudarem,
 * deve nascer outra versão em vez de reinterpretar silenciosamente um artefato histórico existente.
 */
export const NDVI_RASTER_ALGORITHM_VERSION = "RAIZ_NDVI_CATEGORICAL_V1" as const;

export type StoredNdviRasterArtifact = {
  key: string;
  sha256: string;
  bytes: number;
};

export class NdviRasterPersistenceError extends Error {
  constructor(message = "Persistência durável do raster NDVI indisponível. Configure STORAGE_PROVIDER=s3 no runtime hospedado antes de arquivar uma aquisição.") {
    super(message);
    this.name = "NdviRasterPersistenceError";
  }
}

function localStorageRoot() {
  return process.env.LOCAL_STORAGE_ROOT?.trim() || path.join(process.cwd(), "storage");
}

function configuredProvider() {
  return (process.env.STORAGE_PROVIDER ?? "local").trim().toLowerCase();
}

function safeSegment(value: string, label: string) {
  const normalized = value.trim();
  if (!normalized || normalized.includes("/") || normalized.includes("\\") || normalized.includes("..")) {
    throw new NdviRasterPersistenceError(`${label} inválido para a cadeia de custódia do raster NDVI.`);
  }
  return normalized;
}

export function ndviRasterSha256(bytes: Buffer | Uint8Array) {
  return createHash("sha256").update(bytes).digest("hex");
}

export function ndviRasterObjectKey(input: {
  tenantId: string;
  fieldId: string;
  capturedAt: string;
  sha256: string;
}) {
  const tenantId = safeSegment(input.tenantId, "Tenant");
  const fieldId = safeSegment(input.fieldId, "Talhão");
  if (!DATE_RE.test(input.capturedAt)) throw new NdviRasterPersistenceError("Data inválida para arquivamento do raster NDVI.");
  if (!/^[a-f0-9]{64}$/i.test(input.sha256)) throw new NdviRasterPersistenceError("SHA-256 inválido para arquivamento do raster NDVI.");
  return `ndvi/${tenantId}/${fieldId}/${input.capturedAt}/${input.sha256.toLowerCase()}.png`;
}

export function ndviRasterKeyBelongsToField(key: string, tenantId: string, fieldId: string) {
  const rawKey = key.startsWith(S3_OBJECT_PREFIX) ? key.slice(S3_OBJECT_PREFIX.length) : key;
  const tenant = safeSegment(tenantId, "Tenant");
  const field = safeSegment(fieldId, "Talhão");
  return rawKey.startsWith(`ndvi/${tenant}/${field}/`) && !rawKey.includes("../") && !rawKey.includes("..\\");
}

export function verifyNdviRasterIntegrity(
  bytes: Buffer | Uint8Array,
  expected: { sha256: string; bytes: number },
) {
  if (!Number.isSafeInteger(expected.bytes) || expected.bytes <= 0) {
    throw new NdviRasterPersistenceError("Metadado de tamanho do raster NDVI é inválido.");
  }
  if (!/^[a-f0-9]{64}$/i.test(expected.sha256)) {
    throw new NdviRasterPersistenceError("Metadado SHA-256 do raster NDVI é inválido.");
  }
  if (bytes.byteLength !== expected.bytes || ndviRasterSha256(bytes) !== expected.sha256.toLowerCase()) {
    throw new NdviRasterPersistenceError("Integridade do raster NDVI arquivado não confere com o snapshot persistido.");
  }
  return true;
}

/**
 * Persiste o PNG antes de permitir que o snapshot estatístico seja considerado auditável. A chave é
 * content-addressed; repetir exatamente o mesmo raster é idempotente, e bytes diferentes nunca
 * sobrescrevem o mesmo artefato histórico.
 */
export async function saveRequiredNdviRasterArtifact(input: {
  tenantId: string;
  fieldId: string;
  capturedAt: string;
  bytes: Buffer;
}): Promise<StoredNdviRasterArtifact> {
  if (!input.bytes.length) throw new NdviRasterPersistenceError("Raster NDVI vazio não pode ser arquivado.");
  const digest = ndviRasterSha256(input.bytes);
  const objectKey = ndviRasterObjectKey({
    tenantId: input.tenantId,
    fieldId: input.fieldId,
    capturedAt: input.capturedAt,
    sha256: digest,
  });
  const provider = configuredProvider();

  if (provider === "s3") {
    await putS3Object({ key: objectKey, body: input.bytes, contentType: "image/png" });
    return { key: `${S3_OBJECT_PREFIX}${objectKey}`, sha256: digest, bytes: input.bytes.length };
  }

  if (provider === "local") {
    if (process.env.VERCEL) throw new NdviRasterPersistenceError();
    const fullPath = path.join(localStorageRoot(), objectKey);
    await mkdir(path.dirname(fullPath), { recursive: true });
    await writeFile(fullPath, input.bytes);
    return { key: objectKey, sha256: digest, bytes: input.bytes.length };
  }

  throw new NdviRasterPersistenceError(`STORAGE_PROVIDER "${provider}" não oferece armazenamento durável para raster NDVI.`);
}

/** Lê somente o artefato já arquivado; nunca reconsulta o Copernicus como fallback histórico. */
export async function readNdviRasterArtifact(input: {
  tenantId: string;
  fieldId: string;
  key: string;
  sha256: string;
  bytes: number;
}) {
  if (!ndviRasterKeyBelongsToField(input.key, input.tenantId, input.fieldId)) {
    throw new NdviRasterPersistenceError("Raster NDVI não pertence ao tenant/talhão ativo.");
  }

  let buffer: Buffer;
  if (input.key.startsWith(S3_OBJECT_PREFIX)) {
    buffer = await getS3Object({ key: input.key.slice(S3_OBJECT_PREFIX.length) });
  } else {
    const fullPath = path.join(localStorageRoot(), input.key);
    buffer = await readFile(fullPath);
  }

  verifyNdviRasterIntegrity(buffer, { sha256: input.sha256, bytes: input.bytes });
  return buffer;
}
