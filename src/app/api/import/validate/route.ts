import { buildLabImportPreview, buildLabImportPreviewFromXlsxBase64, isSpreadsheetFileName } from "@/domain/lab-import";
import { compactLabImportPreview, jsonTransportBytes, LAB_UPLOAD_LIMITS } from "@/domain/lab-upload-limits";
import { getPlatformSession } from "@/lib/auth/session";
import { isDatabaseMode } from "@/lib/data-mode";
import { RawImportPersistenceError, saveRequiredRawImportFile, wrapExtractedLabContent } from "@/lib/storage";

const MAX_BODY_BYTES = LAB_UPLOAD_LIMITS.functionPayloadBytes;

export async function POST(request: Request) {
  const database = isDatabaseMode();
  const session = database ? await getPlatformSession() : null;
  if (database && !session) {
    return Response.json({ error: "Sessão necessária." }, { status: 401 });
  }

  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (contentLength > MAX_BODY_BYTES) {
    return Response.json({ error: "Requisição do arquivo excede o limite seguro do ambiente atual." }, { status: 413 });
  }

  try {
    const body = await request.json() as {
      content?: string;
      fileName?: string;
      fallbackMethod?: string;
      hasAgronomicContext?: boolean;
      spatialLinked?: boolean;
    };

    if (typeof body.content !== "string" || !body.content.trim()) {
      return Response.json({ error: "Conteúdo do arquivo não informado." }, { status: 400 });
    }

    const fileName = body.fileName ?? "laudo.csv";
    const isSpreadsheet = isSpreadsheetFileName(fileName);
    const rawBytes = isSpreadsheet
      ? Buffer.from(body.content, "base64").length
      : Buffer.byteLength(body.content, "utf8");
    const rawLimit = isSpreadsheet ? LAB_UPLOAD_LIMITS.spreadsheetBytes : LAB_UPLOAD_LIMITS.textBytes;
    if (rawBytes > rawLimit) {
      return Response.json({ error: `Arquivo excede ${(rawLimit / 1_000_000).toLocaleString("pt-BR")} MB no upload direto desta versão.` }, { status: 413 });
    }

    const stored = session
      ? await saveRequiredRawImportFile({
          tenantId: session.tenantId,
          fileName,
          content: body.content,
          encoding: isSpreadsheet ? "base64" : "utf8",
        })
      : null;

    const importContext = {
      fallbackMethod: body.fallbackMethod,
      hasAgronomicContext: body.hasAgronomicContext,
      spatialLinked: body.spatialLinked,
    };
    const preview = isSpreadsheet
      ? buildLabImportPreviewFromXlsxBase64(body.content, fileName, importContext)
      : buildLabImportPreview(body.content, fileName, importContext);

    const transportContent = stored && session
      ? wrapExtractedLabContent(body.content, {
          key: stored.key,
          bytes: stored.bytes,
          sha256: stored.sha256,
          fileName,
          sourceType: isSpreadsheet ? "XLSX" : "CSV",
        }, session.tenantId)
      : body.content;

    const responsePayload = {
      ...compactLabImportPreview(preview),
      transportContent,
      sourceArchived: Boolean(stored),
    };
    if (jsonTransportBytes(responsePayload) > LAB_UPLOAD_LIMITS.functionPayloadBytes) {
      return Response.json({
        error: "O preview e o transporte do laudo excedem o limite de resposta do ambiente atual. Divida o arquivo por área ou laboratório.",
      }, { status: 413 });
    }

    return Response.json(responsePayload, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível validar o arquivo.";
    const status = error instanceof RawImportPersistenceError ? 503 : 422;
    return Response.json({ error: message }, { status });
  }
}
