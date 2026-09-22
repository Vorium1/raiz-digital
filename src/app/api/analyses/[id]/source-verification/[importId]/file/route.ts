import { createHash } from "node:crypto";
import { getPlatformSession } from "@/lib/auth/session";
import { withTenant } from "@/lib/db";
import { readRawStoredFile } from "@/lib/storage";

function rawKeyBelongsToTenant(key: string, tenantId: string) {
  const normalized = key.startsWith("s3:v1:") ? key.slice("s3:v1:".length) : key;
  return normalized.startsWith(`imports/${tenantId}/sources/`) && !normalized.includes("../") && !normalized.includes("..\\");
}

function contentType(fileName: string) {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".xlsx")) return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  if (lower.endsWith(".xls")) return "application/vnd.ms-excel";
  if (lower.endsWith(".csv")) return "text/csv; charset=utf-8";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  return "application/octet-stream";
}

function encodedFileName(fileName: string) {
  return encodeURIComponent(fileName).replace(/[!'()*]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
}

export async function GET(_request: Request, context: { params: Promise<{ id: string; importId: string }> }) {
  const session = await getPlatformSession();
  if (!session) return Response.json({ error: "Sessão necessária." }, { status: 401 });
  const { id, importId } = await context.params;

  const source = await withTenant({ tenantId: session.tenantId, userId: session.userId }, async (client) => {
    const result = await client.query<{ fileName: string; fileSha256: string; rawObjectKey: string | null }>(
      `SELECT file_name AS "fileName", file_sha256 AS "fileSha256", raw_object_key AS "rawObjectKey"
       FROM analysis_imports
       WHERE tenant_id = $1::uuid AND analysis_id = $2::uuid AND id = $3::uuid
       LIMIT 1`,
      [session.tenantId, id, importId],
    );
    return result.rows[0] ?? null;
  });

  if (!source) return Response.json({ error: "Importação não encontrada para esta análise." }, { status: 404 });
  if (!source.rawObjectKey) return Response.json({ error: "O arquivo original desta importação não possui chave de armazenamento comprovada." }, { status: 409 });
  if (!rawKeyBelongsToTenant(source.rawObjectKey, session.tenantId)) return Response.json({ error: "Arquivo-fonte não pertence à empresa ativa." }, { status: 409 });

  try {
    const buffer = await readRawStoredFile(source.rawObjectKey);
    const actualSha256 = createHash("sha256").update(buffer).digest("hex");
    if (actualSha256.toLowerCase() !== source.fileSha256.toLowerCase()) {
      return Response.json({ error: "A integridade do arquivo original não confere com o SHA-256 registrado. A abertura foi bloqueada." }, { status: 409 });
    }

    const safeFileName = source.fileName.replace(/[\r\n"\\]/g, "_");
    return new Response(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "content-type": contentType(source.fileName),
        "content-length": String(buffer.length),
        "content-disposition": `inline; filename="${safeFileName}"; filename*=UTF-8''${encodedFileName(source.fileName)}`,
        "cache-control": "private, no-store",
        "x-content-type-options": "nosniff",
      },
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? `Não foi possível abrir o arquivo original: ${error.message}` : "Não foi possível abrir o arquivo original." }, { status: 503 });
  }
}
