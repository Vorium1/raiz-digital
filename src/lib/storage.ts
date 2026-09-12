import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Armazenamento da RAIZ.
 *
 * Importações brutas continuam usando filesystem local apenas em desenvolvimento; para produção, um
 * object storage ainda é desejável para preservar o arquivo original de grande porte.
 *
 * RELATÓRIOS têm uma exigência mais rígida: depois de publicados, o snapshot precisa continuar legível e
 * verificável pelo hash. Em ambiente serverless (Vercel) o filesystem local é efêmero e NÃO pode ser a
 * fonte de verdade. Para o MVP comercial adicionamos um provider `inline` específico para snapshots de
 * relatório: o conteúdo é codificado dentro da própria `storage_key` e, portanto, persiste na linha
 * `reports` do PostgreSQL/Neon. Não exige migration nem serviço de objeto adicional e mantém o hash
 * imutável já existente.
 *
 * Estratégia:
 * - dev/local: `STORAGE_PROVIDER=local` continua gravando em `<repo>/storage`;
 * - produção Vercel sem provider explícito: snapshots de relatório usam `inline` automaticamente;
 * - `STORAGE_PROVIDER=inline`: força o mesmo comportamento em qualquer ambiente;
 * - no futuro, S3/R2/Blob pode substituir `inline` sem mudar a tabela (`storage_key` é opaca).
 *
 * `inline` NÃO é usado para arquivos brutos de laboratório: base64 grande dentro do banco não é adequado
 * para PDFs/XLSX. É deliberadamente limitado a snapshots JSON pequenos de relatórios.
 */
const LOCAL_STORAGE_ROOT = process.env.LOCAL_STORAGE_ROOT?.trim() || path.join(process.cwd(), "storage");
const INLINE_REPORT_PREFIX = "inline:v1:";
const MAX_INLINE_REPORT_BYTES = 1_500_000;

export type StoredFile = { key: string; bytes: number };

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
  // Vercel + local seria efêmero. Sem configuração explícita, usa persistência inline no próprio banco.
  if (provider === "local" && process.env.VERCEL) return "inline";
  return provider;
}

/**
 * Guarda o arquivo bruto enviado pelo usuário. Só `local` está implementado neste módulo. Em produção
 * serverless, retorna `null` em vez de fingir persistência. A UI/importação deve manter a indicação de que
 * o arquivo-fonte bruto não foi arquivado até configurarmos object storage.
 */
export async function saveRawImportFile(input: {
  tenantId: string;
  analysisId: string;
  fileName: string;
  content: string;
  encoding: "utf8" | "base64";
}): Promise<StoredFile | null> {
  const provider = configuredProvider();
  if (provider !== "local" || process.env.VERCEL) return null;

  const buffer = Buffer.from(input.content, input.encoding);
  const key = `imports/${input.tenantId}/${input.analysisId}/${Date.now()}-${sanitizeFileName(input.fileName)}`;
  const fullPath = path.join(LOCAL_STORAGE_ROOT, key);
  await mkdir(path.dirname(fullPath), { recursive: true });
  await writeFile(fullPath, buffer);
  return { key, bytes: buffer.length };
}

/**
 * Persiste o snapshot IMUTÁVEL do relatório.
 *
 * `inline`: devolve uma chave auto-contida; o chamador grava essa chave em `reports.storage_key`, tornando
 * o snapshot durável no PostgreSQL. O limite impede que um payload anormal transforme a coluna em depósito
 * arbitrário de arquivos.
 *
 * Provider desconhecido falha fechado. Publicação de relatório nunca deve prosseguir com uma chave
 * inventada para conteúdo que não foi persistido.
 */
export async function saveReportSnapshot(input: { tenantId: string; interpretationId: string; revision: number; content: string }): Promise<StoredFile> {
  const provider = reportProvider();
  const buffer = Buffer.from(input.content, "utf8");

  if (provider === "inline") {
    if (buffer.length > MAX_INLINE_REPORT_BYTES) {
      throw new Error(`Snapshot do relatório excede o limite seguro de ${MAX_INLINE_REPORT_BYTES} bytes para armazenamento inline.`);
    }
    return { key: `${INLINE_REPORT_PREFIX}${buffer.toString("base64")}`, bytes: buffer.length };
  }

  if (provider === "local") {
    if (process.env.VERCEL) {
      throw new Error("Armazenamento local não é durável na Vercel. Configure REPORT_STORAGE_PROVIDER=inline ou um provider durável antes de publicar.");
    }
    const key = `reports/${input.tenantId}/${input.interpretationId}/rev-${input.revision}.json`;
    const fullPath = path.join(LOCAL_STORAGE_ROOT, key);
    await mkdir(path.dirname(fullPath), { recursive: true });
    await writeFile(fullPath, buffer);
    return { key, bytes: buffer.length };
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

  const normalized = path.normalize(key);
  if (normalized.startsWith("..") || path.isAbsolute(normalized)) {
    throw new Error("Chave de armazenamento inválida.");
  }
  return readFile(path.join(LOCAL_STORAGE_ROOT, normalized));
}
