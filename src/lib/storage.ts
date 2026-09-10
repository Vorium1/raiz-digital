import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * AUDITORIA REAL (fechamento técnico Fase 3, item 3 do 2º pedido do diretor) -- leia antes de configurar
 * produção:
 *
 * `STORAGE_PROVIDER=local` (o único caminho realmente implementado neste arquivo) grava no filesystem
 * do PROCESSO que está rodando, em `LOCAL_STORAGE_ROOT` (por padrão `<repo>/storage`). Isso é adequado
 * pra desenvolvimento local (`npm run dev`, onde o processo roda continuamente na mesma máquina), mas
 * **não pode ser considerado armazenamento durável** na Vercel (ou qualquer plataforma serverless
 * equivalente): cada invocação de função roda num container efêmero, o filesystem local é
 * read-only/temporário fora de `/tmp` (e mesmo `/tmp` some entre invocações frias), e não há garantia
 * nenhuma de que a mesma máquina que gravou um arquivo seja a que vai atender uma leitura futura. Na
 * prática, publicar um relatório em produção (Vercel) com `STORAGE_PROVIDER=local` hoje resultaria em
 * `saveReportSnapshot` retornando `null` na melhor das hipóteses (função `readRawStoredFile` sem arquivo
 * pra achar) ou, pior, num arquivo que parece gravado com sucesso mas desaparece antes de qualquer
 * leitura futura -- ambos avisados como erro real pela leitura (`getPublishedReportSnapshot` já trata
 * isso como `readError` explícito, nunca finge sucesso), mas o RESULTADO pro usuário seria "relatório
 * publicado, mas nunca mais recuperável" -- inaceitável pra um documento que precisa ser imutável.
 *
 * Nenhum outro `STORAGE_PROVIDER` está implementado aqui -- `saveRawImportFile`/`saveReportSnapshot`
 * simplesmente devolvem `null` pra qualquer valor diferente de `local`, sem gravar nada.
 *
 * PROPOSTA (não implementada nesta rodada -- exigiria contratar um serviço de storage de objetos, fora
 * do escopo sem autorização explícita do diretor): uma interface `StorageProvider` comum, com uma
 * implementação real trocável por variável de ambiente (`STORAGE_PROVIDER=local|s3|r2|blob`), mantendo
 * `local` como está (dev) e adicionando um provedor real de objeto pra produção. Opções self-hosted/
 * baratas compatíveis com a stack já aprovada (`CLAUDE.md`: preferir gratuito/self-hosted/substituível):
 * Cloudflare R2 (compatível com a API S3, sem custo de egress) ou um bucket S3 padrão. A interface abaixo
 * é só a PROPOSTA de contrato -- não está sendo usada em nenhum lugar do código ainda.
 *
 * ```ts
 * export interface StorageProvider {
 *   save(input: { key: string; content: Buffer | string }): Promise<StoredFile>;
 *   read(key: string): Promise<Buffer>;
 * }
 * ```
 *
 * Migrar pra essa interface não exige alterar `db/migrations/` (a coluna `reports.storage_key` já guarda
 * uma chave opaca, independente de qual provedor a resolve) -- só trocar a implementação por trás de
 * `saveReportSnapshot`/`readRawStoredFile` e configurar a variável de ambiente do provedor real em
 * produção. Arquivos já gravados localmente em dev não precisam ser migrados (nenhum publish real de
 * cliente existe hoje neste ambiente).
 */
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

/**
 * Guarda o snapshot de um relatório publicado. Mesmo padrão de
 * `saveRawImportFile`: só grava de fato em STORAGE_PROVIDER=local; em outros
 * provedores (S3 ainda não implementado) retorna null sem falhar. O
 * `sha256` do snapshot é sempre calculado por quem chama, independente de
 * o arquivo ter sido persistido ou não, para que o relatório continue
 * rastreável e reproduzível mesmo sem storage real configurado.
 */
export async function saveReportSnapshot(input: { tenantId: string; interpretationId: string; revision: number; content: string }): Promise<StoredFile | null> {
  const provider = process.env.STORAGE_PROVIDER ?? "local";
  if (provider !== "local") return null;

  const buffer = Buffer.from(input.content, "utf8");
  const key = `reports/${input.tenantId}/${input.interpretationId}/rev-${input.revision}.json`;
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
