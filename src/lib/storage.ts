import { createHash, createHmac } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Armazenamento da RAIZ.
 *
 * Providers suportados:
 * - `local`: filesystem local, adequado apenas a desenvolvimento não-serverless;
 * - `inline`: somente snapshots JSON pequenos de relatório, persistidos dentro de `reports.storage_key`;
 * - `s3`: object storage S3-compatible (AWS S3, Cloudflare R2, Backblaze B2 e equivalentes com SigV4).
 *
 * Arquivos brutos de laboratório nunca usam `inline`: PDF/XLSX/CSV originais precisam de object storage
 * durável em produção. Snapshots de relatório podem continuar em `inline` no PostgreSQL ou usar `s3`.
 *
 * A implementação S3 usa AWS Signature Version 4 diretamente com `node:crypto`, sem SDK adicional. As
 * credenciais ficam exclusivamente em variáveis de ambiente e nunca entram na chave persistida no banco.
 */
const LOCAL_STORAGE_ROOT = process.env.LOCAL_STORAGE_ROOT?.trim() || path.join(process.cwd(), "storage");
const INLINE_REPORT_PREFIX = "inline:v1:";
const S3_KEY_PREFIX = "s3:v1:";
const MAX_INLINE_REPORT_BYTES = 1_500_000;

export type StoredFile = { key: string; bytes: number };

type S3Config = {
  endpoint: string;
  bucket: string;
  region: string;
  accessKey: string;
  secretKey: string;
};

function sanitizeFileName(fileName: string) {
  return fileName.replace(/[^a-zA-Z0-9_.-]/g, "_").slice(-120);
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

function requireS3Config(): S3Config {
  const endpoint = process.env.S3_ENDPOINT?.trim().replace(/\/+$/, "") ?? "";
  const bucket = process.env.S3_BUCKET?.trim() ?? "";
  const region = process.env.S3_REGION?.trim() || "auto";
  const accessKey = process.env.S3_ACCESS_KEY?.trim() ?? "";
  const secretKey = process.env.S3_SECRET_KEY?.trim() ?? "";

  if (!endpoint || !bucket || !accessKey || !secretKey) {
    throw new Error("Storage S3 incompleto. Configure S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY e S3_SECRET_KEY.");
  }

  let parsed: URL;
  try {
    parsed = new URL(endpoint);
  } catch {
    throw new Error("S3_ENDPOINT precisa ser uma URL HTTPS válida.");
  }
  if (parsed.protocol !== "https:") throw new Error("S3_ENDPOINT precisa usar HTTPS.");
  if (parsed.pathname && parsed.pathname !== "/") {
    throw new Error("S3_ENDPOINT deve apontar para a origem do serviço, sem caminho adicional.");
  }

  return { endpoint, bucket, region, accessKey, secretKey };
}

function sha256Hex(value: Buffer | string) {
  return createHash("sha256").update(value).digest("hex");
}

function hmac(key: Buffer | string, value: string) {
  return createHmac("sha256", key).update(value).digest();
}

function awsEncode(value: string) {
  return encodeURIComponent(value).replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
}

function s3ObjectUrl(config: S3Config, objectKey: string) {
  const encodedKey = objectKey.split("/").map(awsEncode).join("/");
  return new URL(`${config.endpoint}/${awsEncode(config.bucket)}/${encodedKey}`);
}

function amzDate(now = new Date()) {
  return now.toISOString().replace(/[:-]|\.\d{3}/g, "");
}

async function s3Request(method: "GET" | "PUT", objectKey: string, body?: Buffer) {
  const config = requireS3Config();
  const url = s3ObjectUrl(config, objectKey);
  const payload = body ?? Buffer.alloc(0);
  const payloadHash = sha256Hex(payload);
  const timestamp = amzDate();
  const dateStamp = timestamp.slice(0, 8);
  const service = "s3";
  const signedHeaders = "host;x-amz-content-sha256;x-amz-date";
  const canonicalHeaders = `host:${url.host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${timestamp}\n`;
  const canonicalRequest = [method, url.pathname, "", canonicalHeaders, signedHeaders, payloadHash].join("\n");
  const scope = `${dateStamp}/${config.region}/${service}/aws4_request`;
  const stringToSign = ["AWS4-HMAC-SHA256", timestamp, scope, sha256Hex(canonicalRequest)].join("\n");
  const kDate = hmac(Buffer.from(`AWS4${config.secretKey}`, "utf8"), dateStamp);
  const kRegion = hmac(kDate, config.region);
  const kService = hmac(kRegion, service);
  const kSigning = hmac(kService, "aws4_request");
  const signature = createHmac("sha256", kSigning).update(stringToSign).digest("hex");
  const authorization = `AWS4-HMAC-SHA256 Credential=${config.accessKey}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const response = await fetch(url, {
    method,
    headers: {
      authorization,
      "x-amz-content-sha256": payloadHash,
      "x-amz-date": timestamp,
      ...(method === "PUT" ? { "content-type": "application/octet-stream" } : {}),
    },
    body: method === "PUT" ? payload : undefined,
  });

  if (!response.ok) {
    const detail = (await response.text().catch(() => "")).slice(0, 240).replace(/\s+/g, " ");
    throw new Error(`Object storage S3 respondeu HTTP ${response.status}${detail ? `: ${detail}` : ""}.`);
  }
  return response;
}

async function saveS3Object(objectKey: string, buffer: Buffer): Promise<StoredFile> {
  await s3Request("PUT", objectKey, buffer);
  return { key: `${S3_KEY_PREFIX}${objectKey}`, bytes: buffer.length };
}

/** Guarda o arquivo bruto original enviado pelo usuário. */
export async function saveRawImportFile(input: {
  tenantId: string;
  analysisId: string;
  fileName: string;
  content: string;
  encoding: "utf8" | "base64";
}): Promise<StoredFile | null> {
  const provider = configuredProvider();
  const buffer = Buffer.from(input.content, input.encoding);
  const objectKey = `imports/${input.tenantId}/${input.analysisId}/${Date.now()}-${sanitizeFileName(input.fileName)}`;

  if (provider === "s3") return saveS3Object(objectKey, buffer);

  if (provider === "local") {
    if (process.env.VERCEL) return null;
    const fullPath = path.join(LOCAL_STORAGE_ROOT, objectKey);
    await mkdir(path.dirname(fullPath), { recursive: true });
    await writeFile(fullPath, buffer);
    return { key: objectKey, bytes: buffer.length };
  }

  // `inline` é deliberadamente inválido para PDFs/XLSX/CSV brutos.
  if (provider === "inline") return null;
  throw new Error(`STORAGE_PROVIDER "${provider}" não possui persistência de arquivo bruto implementada.`);
}

/** Persiste o snapshot IMUTÁVEL do relatório. */
export async function saveReportSnapshot(input: { tenantId: string; interpretationId: string; revision: number; content: string }): Promise<StoredFile> {
  const provider = reportProvider();
  const buffer = Buffer.from(input.content, "utf8");

  if (provider === "inline") {
    if (buffer.length > MAX_INLINE_REPORT_BYTES) {
      throw new Error(`Snapshot do relatório excede o limite seguro de ${MAX_INLINE_REPORT_BYTES} bytes para armazenamento inline.`);
    }
    return { key: `${INLINE_REPORT_PREFIX}${buffer.toString("base64")}`, bytes: buffer.length };
  }

  const objectKey = `reports/${input.tenantId}/${input.interpretationId}/rev-${input.revision}.json`;
  if (provider === "s3") return saveS3Object(objectKey, buffer);

  if (provider === "local") {
    if (process.env.VERCEL) {
      throw new Error("Armazenamento local não é durável na Vercel. Configure REPORT_STORAGE_PROVIDER=inline ou STORAGE_PROVIDER=s3 antes de publicar.");
    }
    const fullPath = path.join(LOCAL_STORAGE_ROOT, objectKey);
    await mkdir(path.dirname(fullPath), { recursive: true });
    await writeFile(fullPath, buffer);
    return { key: objectKey, bytes: buffer.length };
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

  if (key.startsWith(S3_KEY_PREFIX)) {
    const objectKey = key.slice(S3_KEY_PREFIX.length);
    if (!objectKey || objectKey.startsWith("/") || objectKey.split("/").some((part) => part === "..")) {
      throw new Error("Chave S3 inválida.");
    }
    const response = await s3Request("GET", objectKey);
    return Buffer.from(await response.arrayBuffer());
  }

  const normalized = path.normalize(key);
  if (normalized.startsWith("..") || path.isAbsolute(normalized)) {
    throw new Error("Chave de armazenamento inválida.");
  }
  return readFile(path.join(LOCAL_STORAGE_ROOT, normalized));
}
