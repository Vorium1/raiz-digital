import { buildLabImportPreview, evaluateLabImportUsability } from "@/domain/lab-import";
import { compactLabImportPreview, jsonTransportBytes, LAB_UPLOAD_LIMITS } from "@/domain/lab-upload-limits";
import { geminiLabExtractionProvider } from "@/lib/ai/providers/gemini-lab-extraction-provider";
import { getPlatformSession } from "@/lib/auth/session";
import { isDatabaseMode } from "@/lib/data-mode";
import { RawImportPersistenceError, saveRequiredRawImportFile, wrapExtractedLabContent } from "@/lib/storage";

const MAX_BODY_BYTES = LAB_UPLOAD_LIMITS.functionPayloadBytes;
const ALLOWED_MIME_TYPES = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp"]);

/**
 * Leitura de laudo (PDF/foto) por IA.
 *
 * Em modo real, o arquivo ORIGINAL é arquivado de forma durável ANTES de qualquer chamada de IA ou
 * construção de preview. O CSV transcrito leva um recibo de proveniência assinado que o vincula ao
 * arquivo bruto e ao tenant; qualquer alteração entre extração e commit invalida a cadeia de custódia.
 */
export async function POST(request: Request) {
  const database = isDatabaseMode();
  const session = database ? await getPlatformSession() : null;
  if (database && !session) return Response.json({ error: "Sessão necessária." }, { status: 401 });

  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (contentLength > MAX_BODY_BYTES) {
    return Response.json({ error: "Requisição do arquivo excede o limite seguro do ambiente atual." }, { status: 413 });
  }

  try {
    const body = (await request.json()) as { content?: string; mimeType?: string; fileName?: string; fallbackMethod?: string };

    if (typeof body.content !== "string" || !body.content.trim()) {
      return Response.json({ error: "Conteúdo do arquivo não informado." }, { status: 400 });
    }
    if (!body.mimeType || !ALLOWED_MIME_TYPES.has(body.mimeType)) {
      return Response.json({ error: "Tipo de arquivo não suportado para leitura por IA -- use PDF, JPG, PNG ou WEBP." }, { status: 400 });
    }

    const rawBytes = Buffer.from(body.content, "base64").length;
    if (rawBytes > LAB_UPLOAD_LIMITS.imageOrPdfBytes) {
      return Response.json({ error: `PDF/foto excede ${(LAB_UPLOAD_LIMITS.imageOrPdfBytes / 1_000_000).toLocaleString("pt-BR")} MB no upload direto desta versão.` }, { status: 413 });
    }

    const originalFileName = body.fileName?.trim() || "laudo-original";

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

    const csvContent = stored && session
      ? wrapExtractedLabContent(extraction.csvContent, {
          key: stored.key,
          bytes: stored.bytes,
          sha256: stored.sha256,
          fileName: originalFileName,
          sourceType: "PDF_OCR",
        }, session.tenantId)
      : extraction.csvContent;

    const responsePayload = {
      ...compactLabImportPreview(preview),
      usability: evaluateLabImportUsability(preview),
      aiExtracted: true,
      aiProvider: extraction.provider,
      aiModel: extraction.model,
      csvContent,
      sourceArchived: Boolean(stored),
    };
    if (jsonTransportBytes(responsePayload) > LAB_UPLOAD_LIMITS.functionPayloadBytes) {
      return Response.json({
        error: "A transcrição ficou grande demais para o limite de resposta do ambiente atual. Divida o laudo por área/laboratório ou use um arquivo tabular menor.",
      }, { status: 413 });
    }

    return Response.json(responsePayload, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível ler o arquivo com IA.";
    const status = error instanceof RawImportPersistenceError ? 503 : 422;
    return Response.json({ error: message }, { status });
  }
}
