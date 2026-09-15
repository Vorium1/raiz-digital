import { buildLabImportPreview } from "@/domain/lab-import";
import { geminiLabExtractionProvider } from "@/lib/ai/providers/gemini-lab-extraction-provider";
import { getPlatformSession } from "@/lib/auth/session";
import { isDatabaseMode } from "@/lib/data-mode";
import { RawImportPersistenceError, saveRequiredRawImportFile, wrapExtractedLabContent } from "@/lib/storage";

const MAX_BODY_BYTES = 9_000_000;
const ALLOWED_MIME_TYPES = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp"]);

/**
 * Leitura de laudo (PDF/foto) por IA.
 *
 * Em modo real, o arquivo ORIGINAL é arquivado de forma durável ANTES de qualquer chamada de IA ou
 * construção de preview. O CSV transcrito leva apenas um envelope opaco de proveniência, que será removido
 * e conferido novamente no commit. Se o arquivo bruto não puder ser persistido, o fluxo falha fechado e a
 * IA não recebe o documento.
 */
export async function POST(request: Request) {
  const database = isDatabaseMode();
  const session = database ? await getPlatformSession() : null;
  if (database && !session) return Response.json({ error: "Sessão necessária." }, { status: 401 });

  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (contentLength > MAX_BODY_BYTES) {
    return Response.json({ error: "Arquivo excede o limite desta etapa (9MB)." }, { status: 413 });
  }

  try {
    const body = (await request.json()) as { content?: string; mimeType?: string; fileName?: string; fallbackMethod?: string };

    if (typeof body.content !== "string" || !body.content.trim()) {
      return Response.json({ error: "Conteúdo do arquivo não informado." }, { status: 400 });
    }
    if (!body.mimeType || !ALLOWED_MIME_TYPES.has(body.mimeType)) {
      return Response.json({ error: "Tipo de arquivo não suportado para leitura por IA -- use PDF, JPG, PNG ou WEBP." }, { status: 400 });
    }

    const originalFileName = body.fileName?.trim() || "laudo-original";

    // Cadeia de custódia: no runtime com banco, nenhum byte segue para IA antes de existir uma cópia
    // persistente e endereçada por hash do arquivo original.
    const stored = session
      ? await saveRequiredRawImportFile({
          tenantId: session.tenantId,
          fileName: originalFileName,
          content: body.content,
          encoding: "base64",
        })
      : null;

    const extraction = await geminiLabExtractionProvider.extract({ fileBase64: body.content, mimeType: body.mimeType });
    const preview = buildLabImportPreview(extraction.csvContent, `${originalFileName}.csv`, {
      fallbackMethod: body.fallbackMethod,
      hasAgronomicContext: true,
      spatialLinked: true,
    });

    const csvContent = stored
      ? wrapExtractedLabContent(extraction.csvContent, {
          key: stored.key,
          bytes: stored.bytes,
          sha256: stored.sha256,
          fileName: originalFileName,
          sourceType: "PDF_OCR",
        })
      : extraction.csvContent;

    return Response.json({
      ...preview,
      aiExtracted: true,
      aiProvider: extraction.provider,
      aiModel: extraction.model,
      csvContent,
      sourceArchived: Boolean(stored),
    }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível ler o arquivo com IA.";
    const status = error instanceof RawImportPersistenceError ? 503 : 422;
    return Response.json({ error: message }, { status });
  }
}
