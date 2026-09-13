import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { getS3Object, putS3Object } from "@/lib/s3-object-storage";

/**
 * Armazenamento da RAIZ.
 *
 * - arquivos brutos de laboratório: `local` em desenvolvimento ou `s3` em runtime comercial;
 * - snapshots publicados de relatório: `inline` no PostgreSQL/Neon (ou `local` apenas fora da Vercel).
 *
 * O provider S3 é compatível com endpoints S3-style (AWS S3, Cloudflare R2, MinIO e equivalentes) e
 * usa chaves content-addressed. Assim, o mesmo arquivo é idempotente e um arquivo diferente nunca
 * sobrescreve silenciosamente outro só porque chegou com o mesmo nome.
 */
const LOCAL_STORAGE_ROOT = process.env.LOCAL_STORAGE_ROOT?.trim() || path.join(process.cwd(), "storage");
const INLINE_REPORT_PREFIX = "inline:v1:";
const S3_RAW_PREFIX = "s3:v1:";
const RAW_SOURCE_ENVELOPE_PREFIX = "#RAIZ_SOURCE_V1 ";
const MAX_INLINE_REPORT_BYTES = 1_500_000;

export type StoredFile = { key: string; bytes: number; sha256: string };
export type RawSourceReceipt = {
  key: string;
  bytes: number;
  sha256: string;
  fileName: string;
  sourceType: "PDF_OCR";
};

function sha256(buffer: Buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function sanitizeFileName(fileName: string) {
  return fileName.replace(/[^a-zA-Z0-9_.-]/g, "_").slice(-120) || "arquivo";
}

function configuredProvider() {
  return (process.env.STORAGE_PROVIDER ?? "local").trim().toLowerCase();
}

function reportProvider() {
  const explicit = process.env.REPORT_STORAGE_PROVIDER?.trim().toLowerCase();
  if (explicit) return explicit;
  const provider = configuredProvider();
  if (provider === "local" && process.env.VERCEL) return "inline";
  return provider;
}

function rawObjectKey(input: { tenantId: string; fileName: string; sha256: string }) {
  return `imports/${input.tenantId}/sources/${input.sha256}-${sanitizeFileName(input.fileName)}`;
}

function rawKeyBelongsToTenant(key: string, tenantId: string) {
  const rawKey = key.startsWith(S3_RAW_PREFIX) ? key.slice(S3_RAW_PREFIX.length) : key;
  return rawKey.startsWith(`imports/${tenantId}/sources/`) && !rawKey.includes("../") && !rawKey.includes("..\\");
}

/**
 * Guarda os bytes originais recebidos do laboratório/usuário.
 *
 * `inline` nunca é aceito para fonte bruta. Em Vercel, `local` também não é considerado persistência e
 * devolve `null`; o preflight comercial exige `STORAGE_PROVIDER=s3`, portanto produção não pode ser
 * promovida com essa lacuna escondida.
 */
export async function saveRawImportFile(input: {
  tenantId: string;
  analysisId?: string;
  fileName: string;
  content: string;
  encoding: "utf8" | "base64";
}): Promise<StoredFile | null> {
  const provider = configuredProvider();
  if (provider === "inline") return null;
  if (provider === "local" && process.env.VERCEL) return null;

  const buffer = Buffer.from(input.content, input.encoding);
  const digest = sha256(buffer);
  const objectKey = rawObjectKey({ tenantId: input.tenantId, fileName: input.fileName, sha256: digest });

  if (provider === "s3") {
    await putS3Object({ key: objectKey, body: buffer });
    return { key: `${S3_RAW_PREFIX}${objectKey}`, bytes: buffer.length, sha256: digest };
  }

  if (provider === "local") {
    const fullPath = path.join(LOCAL_STORAGE_ROOT, objectKey);
    await mkdir(path.dirname(fullPath), { recursive: true });
    await writeFile(fullPath, buffer);
    return { key: objectKey, bytes: buffer.length, sha256: digest };
  }

  throw new Error(`STORAGE_PROVIDER "${provider}" não possui persistência de arquivo bruto implementada.`);
}

/**
 * PDF/foto passa por IA antes do commit. Para não perder a ligação com o ORIGINAL, o endpoint de extração
 * arquiva o arquivo primeiro e devolve o CSV com este envelope opaco na primeira linha. O cliente apenas
 * transporta o conteúdo; no commit o servidor remove o envelope e verifica novamente key/hash/bytes.
 */
export function wrapExtractedLabContent(csvContent: string, source: RawSourceReceipt) {
  const encoded = Buffer.from(JSON.stringify(source), "utf8").toString("base64url");
  return `${RAW_SOURCE_ENVELOPE_PREFIX}${encoded}\n${csvContent}`;
}

export function unwrapExtractedLabContent(content: string): { content: string; source: RawSourceReceipt | null } {
  if (!content.startsWith(RAW_SOURCE_ENVELOPE_PREFIX)) return { content, source: null };
  const newline = content.indexOf("\n");
  if (newline < 0) throw new Error("Envelope de proveniência do laudo está incompleto.");
  try {
    const encoded = content.slice(RAW_SOURCE_ENVELOPE_PREFIX.length, newline).trim();
    const parsed = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as Partial<RawSourceReceipt>;
    if (
      typeof parsed.key !== "string" || !parsed.key ||
      typeof parsed.fileName !== "string" || !parsed.fileName ||
      typeof parsed.sha256 !== "string" || !/^[a-f0-9]{64}$/i.test(parsed.sha256) ||
      typeof parsed.bytes !== "number" || !Number.isSafeInteger(parsed.bytes) || parsed.bytes < 0 ||
      parsed.sourceType !== "PDF_OCR"
    ) throw new Error("metadados inválidos");
    return { content: content.slice(newline + 1), source: parsed as RawSourceReceipt };
  } catch {
    throw new Error("Envelope de proveniência do laudo é inválido.");
  }
}

export async function verifyRawImportArchive(input: { tenantId: string; source: Pick<RawSourceReceipt, "key" | "sha256" | "bytes"> }) {
  if (!rawKeyBelongsToTenant(input.source.key, input.tenantId)) {
    throw new Error("Arquivo-fonte não pertence à empresa ativa.");
  }
  const buffer = await readRawStoredFile(input.source.key);
  if (buffer.length !== input.source.bytes || sha256(buffer) !== input.source.sha256.toLowerCase()) {
    throw new Error("Integridade do arquivo-fonte não confere com o arquivo arquivado.");
  }
  return true;
}

/** Persiste o snapshot IMUTÁVEL do relatório. */
export async function saveReportSnapshot(input: { tenantId: string; interpretationId: string; revision: number; content: string }): Promise<StoredFile> {
  const provider = reportProvider();
  const buffer = Buffer.from(input.content, "utf8");
  const digest = sha256(buffer);

  if (provider === "inline") {
    if (buffer.length > MAX_INLINE_REPORT_BYTES) {
      throw new Error(`Snapshot do relatório excede o limite seguro de ${MAX_INLINE_REPORT_BYTES} bytes para armazenamento inline.`);
    }
    return { key: `${INLINE_REPORT_PREFIX}${buffer.toString("base64")}`, bytes: buffer.length, sha256: digest };
  }

  if (provider === "local") {
    if (process.env.VERCEL) {
      throw new Error("Armazenamento local não é durável na Vercel. Configure REPORT_STORAGE_PROVIDER=inline antes de publicar.");
    }
    const key = `reports/${input.tenantId}/${input.interpretationId}/rev-${input.revision}.json`;
    const fullPath = path.join(LOCAL_STORAGE_ROOT, key);
    await mkdir(path.dirname(fullPath), { recursive: true });
    await writeFile(fullPath, buffer);
    return { key, bytes: buffer.length, sha256: digest };
  }

  throw new Error(`STORAGE_PROVIDER/REPORT_STORAGE_PROVIDER "${provider}" não possui persistência de relatório implementada.`);
}

export async function readRawStoredFile(key: string): Promise<Buffer> {
  if (key.startsWith(INLINE_REPORT_PREFIX)) {
    const encoded = key.slice(INLINE_REPORT_PREFIX.length);
    if (!encoded) throw new Error("Snapshot inline vazio.");
    const buffer = Buffer.from(encoded, "base64");
    if (buffer.length > MAX_INLINE_REPORT_BYTES) throw new Error("Snapshot inline excede o limite de segurança.");
    return buffer;
  }

  if (key.startsWith(S3_RAW_PREFIX)) {
    const objectKey = key.slice(S3_RAW_PREFIX.length);
    if (!objectKey || objectKey.includes("../") || objectKey.includes("..\\")) throw new Error("Chave S3 inválida.");
    return getS3Object({ key: objectKey });
  }

  const normalized = path.normalize(key);
  if (normalized.startsWith("..") || path.isAbsolute(normalized)) {
    throw new Error("Chave de armazenamento inválida.");
  }
  return readFile(path.join(LOCAL_STORAGE_ROOT, normalized));
}
