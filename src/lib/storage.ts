import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { getS3Object, putS3Object } from "./s3-object-storage.ts";

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
const RAW_SOURCE_ENVELOPE_PREFIX = "#RAIZ_SOURCE_V2 ";
const LEGACY_RAW_SOURCE_ENVELOPE_PREFIX = "#RAIZ_SOURCE_V1 ";
const MAX_INLINE_REPORT_BYTES = 1_500_000;

export type LabRawSourceType = "CSV" | "XLSX" | "PDF_OCR";
export type StoredFile = { key: string; bytes: number; sha256: string };
export type RawSourceReceipt = {
  key: string;
  bytes: number;
  sha256: string;
  fileName: string;
  sourceType: LabRawSourceType;
  extractedSha256: string;
  signature: string;
};
export type RawImportFileInput = {
  tenantId: string;
  analysisId?: string;
  fileName: string;
  content: string;
  encoding: "utf8" | "base64";
};

export class RawImportPersistenceError extends Error {
  constructor(message = "Persistência obrigatória do arquivo original indisponível. Configure um armazenamento bruto durável antes de analisar ou importar o laudo.") {
    super(message);
    this.name = "RawImportPersistenceError";
  }
}

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

function provenanceSecret() {
  const secret = process.env.AUTH_SECRET?.trim() ?? "";
  if (secret.length < 32) {
    throw new RawImportPersistenceError("Cadeia de custódia indisponível: AUTH_SECRET precisa ter ao menos 32 caracteres antes de transportar um laudo validado.");
  }
  return secret;
}

function rawObjectKey(input: { tenantId: string; fileName: string; sha256: string }) {
  return `imports/${input.tenantId}/sources/${input.sha256}-${sanitizeFileName(input.fileName)}`;
}

function rawKeyBelongsToTenant(key: string, tenantId: string) {
  const rawKey = key.startsWith(S3_RAW_PREFIX) ? key.slice(S3_RAW_PREFIX.length) : key;
  return rawKey.startsWith(`imports/${tenantId}/sources/`) && !rawKey.includes("../") && !rawKey.includes("..\\");
}

function provenanceManifest(input: {
  tenantId: string;
  key: string;
  bytes: number;
  sha256: string;
  fileName: string;
  sourceType: LabRawSourceType;
  extractedSha256: string;
}) {
  // Campos delimitados por JSON em ordem fixa para evitar ambiguidades de concatenação.
  return JSON.stringify({
    version: 2,
    tenantId: input.tenantId,
    key: input.key,
    bytes: input.bytes,
    sha256: input.sha256.toLowerCase(),
    fileName: input.fileName,
    sourceType: input.sourceType,
    extractedSha256: input.extractedSha256.toLowerCase(),
  });
}

function signProvenance(input: Parameters<typeof provenanceManifest>[0]) {
  return createHmac("sha256", provenanceSecret()).update(provenanceManifest(input)).digest("hex");
}

function safeEqualHex(expectedHex: string, receivedHex: string) {
  if (!/^[a-f0-9]{64}$/i.test(receivedHex)) return false;
  const expected = Buffer.from(expectedHex, "hex");
  const received = Buffer.from(receivedHex, "hex");
  return expected.length === received.length && timingSafeEqual(expected, received);
}

/**
 * Guarda os bytes originais recebidos do laboratório/usuário.
 *
 * `inline` nunca é aceito para fonte bruta. Em Vercel, `local` também não é considerado persistência e
 * devolve `null`; o preflight comercial exige `STORAGE_PROVIDER=s3`, portanto produção não pode ser
 * promovida com essa lacuna escondida.
 */
export async function saveRawImportFile(input: RawImportFileInput): Promise<StoredFile | null> {
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
 * Variante fail-closed para qualquer fluxo que vá interpretar, normalizar ou promover dados agronômicos.
 * Nenhuma análise pode começar se os bytes originais ainda não tiverem sido persistidos de forma durável.
 */
export async function saveRequiredRawImportFile(input: RawImportFileInput): Promise<StoredFile> {
  const stored = await saveRawImportFile(input);
  if (!stored) throw new RawImportPersistenceError();
  return stored;
}

/**
 * Depois que o arquivo original foi arquivado, o servidor assina um recibo que vincula tenant + arquivo
 * bruto + hash/bytes + nome + tipo de fonte + hash exato do conteúdo que será entregue ao parser no commit.
 *
 * Em PDF/foto esse conteúdo é o CSV extraído pela IA. Em CSV/XLSX ele é o próprio conteúdo bruto já
 * arquivado. Assim o cliente pode transportar o payload entre validação e commit, mas não pode alterá-lo
 * nem apontar para outro arquivo sem invalidar a assinatura HMAC.
 */
export function wrapExtractedLabContent(
  content: string,
  source: Omit<RawSourceReceipt, "extractedSha256" | "signature">,
  tenantId: string,
) {
  const extractedSha256 = sha256(Buffer.from(content, "utf8"));
  const unsigned = { ...source, extractedSha256 };
  const receipt: RawSourceReceipt = {
    ...unsigned,
    signature: signProvenance({ tenantId, ...unsigned }),
  };
  const encoded = Buffer.from(JSON.stringify(receipt), "utf8").toString("base64url");
  return `${RAW_SOURCE_ENVELOPE_PREFIX}${encoded}\n${content}`;
}

export function unwrapExtractedLabContent(content: string, tenantId: string): { content: string; source: RawSourceReceipt | null } {
  if (content.startsWith(LEGACY_RAW_SOURCE_ENVELOPE_PREFIX)) {
    throw new Error("Envelope legado de proveniência sem assinatura. Refaça a leitura/validação do arquivo antes de importar.");
  }
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
      typeof parsed.extractedSha256 !== "string" || !/^[a-f0-9]{64}$/i.test(parsed.extractedSha256) ||
      typeof parsed.signature !== "string" || !/^[a-f0-9]{64}$/i.test(parsed.signature) ||
      typeof parsed.bytes !== "number" || !Number.isSafeInteger(parsed.bytes) || parsed.bytes < 0 ||
      !new Set<LabRawSourceType>(["CSV", "XLSX", "PDF_OCR"]).has(parsed.sourceType as LabRawSourceType)
    ) throw new Error("metadados inválidos");

    const transportedContent = content.slice(newline + 1);
    const actualExtractedSha256 = sha256(Buffer.from(transportedContent, "utf8"));
    if (actualExtractedSha256 !== parsed.extractedSha256.toLowerCase()) {
      throw new Error("conteúdo transportado foi alterado depois da validação da fonte original");
    }

    const expectedSignature = signProvenance({
      tenantId,
      key: parsed.key,
      bytes: parsed.bytes,
      sha256: parsed.sha256,
      fileName: parsed.fileName,
      sourceType: parsed.sourceType as LabRawSourceType,
      extractedSha256: parsed.extractedSha256,
    });
    if (!safeEqualHex(expectedSignature, parsed.signature)) {
      throw new Error("assinatura de proveniência não confere");
    }

    return { content: transportedContent, source: parsed as RawSourceReceipt };
  } catch (error) {
    if (error instanceof RawImportPersistenceError) throw error;
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
