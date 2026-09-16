import { buildLabImportPreview, buildLabImportPreviewFromXlsxBase64, isSpreadsheetFileName } from "@/domain/lab-import";
import { LAB_UPLOAD_LIMITS } from "@/domain/lab-upload-limits";
import { getPlatformSession } from "@/lib/auth/session";
import { isDatabaseMode } from "@/lib/data-mode";
import { RawImportPersistenceError, saveRequiredRawImportFile, wrapExtractedLabContent } from "@/lib/storage";

const MAX_BODY_BYTES = LAB_UPLOAD_LIMITS.tabularRequestBytes;

export async function POST(request: Request) {
  const database = isDatabaseMode();
  const session = database ? await getPlatformSession() : null;
  if (database && !session) {
    return Response.json({ error: "Sessão necessária." }, { status: 401 });
  }

  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (contentLength > MAX_BODY_BYTES) {
    return Response.json({ error: "Requisição do arquivo excede o limite desta etapa." }, { status: 413 });
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
      return Response.json({ error: `Arquivo excede ${(rawLimit / 1_000_000).toLocaleString("pt-BR")} MB para este formato.` }, { status: 413 });
    }

    // Mesmo a pré-validação é uma leitura agronômica do arquivo. Em modo real, o ORIGINAL precisa
    // existir no storage durável antes de o parser examinar uma única célula/linha.
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

    // O cliente transporta este payload opaco até /commit. Ele está assinado e vinculado ao mesmo
    // arquivo bruto que acabou de ser arquivado, evitando uma segunda versão silenciosa entre preview e commit.
    const transportContent = stored && session
      ? wrapExtractedLabContent(body.content, {
          key: stored.key,
          bytes: stored.bytes,
          sha256: stored.sha256,
          fileName,
          sourceType: isSpreadsheet ? "XLSX" : "CSV",
        }, session.tenantId)
      : body.content;

    return Response.json({ ...preview, transportContent, sourceArchived: Boolean(stored) }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível validar o arquivo.";
    const status = error instanceof RawImportPersistenceError ? 503 : 422;
    return Response.json({ error: message }, { status });
  }
}
