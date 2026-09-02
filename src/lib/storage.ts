import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const LOCAL_STORAGE_ROOT = process.env.LOCAL_STORAGE_ROOT?.trim() || path.join(process.cwd(), "storage");

export type StoredFile = { key: string; bytes: number };

function sanitizeFileName(fileName: string) {
  return fileName.replace(/[^a-zA-Z0-9_.-]/g, "_").slice(-120);
}

/**
 * Guarda o arquivo bruto enviado pelo usuário (ex.: laudo CSV/XLSX original).
 * Só grava de fato quando STORAGE_PROVIDER=local (padrão de desenvolvimento).
 * Outros provedores (ex.: S3) ainda não estão implementados; retorna null
 * nesse caso em vez de falhar, para não bloquear o commit da importação.
 */
export async function saveRawImportFile(input: {
  tenantId: string;
  analysisId: string;
  fileName: string;
  content: string;
  encoding: "utf8" | "base64";
}): Promise<StoredFile | null> {
  const provider = process.env.STORAGE_PROVIDER ?? "local";
  if (provider !== "local") return null;

  const buffer = Buffer.from(input.content, input.encoding);
  const key = `imports/${input.tenantId}/${input.analysisId}/${Date.now()}-${sanitizeFileName(input.fileName)}`;
  const fullPath = path.join(LOCAL_STORAGE_ROOT, key);
  await mkdir(path.dirname(fullPath), { recursive: true });
  await writeFile(fullPath, buffer);
  return { key, bytes: buffer.length };
}

export async function readRawStoredFile(key: string): Promise<Buffer> {
  const normalized = path.normalize(key);
  if (normalized.startsWith("..") || path.isAbsolute(normalized)) {
    throw new Error("Chave de armazenamento inválida.");
  }
  return readFile(path.join(LOCAL_STORAGE_ROOT, normalized));
}
