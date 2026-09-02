import { buildLabImportPreview, buildLabImportPreviewFromXlsxBase64, isSpreadsheetFileName } from "@/domain/lab-import";
import { getPlatformSession } from "@/lib/auth/session";
import { isDatabaseMode } from "@/lib/data-mode";

const MAX_BODY_BYTES = 6_000_000;

export async function POST(request: Request) {
  if (isDatabaseMode() && !(await getPlatformSession())) {
    return Response.json({ error: "Sessão necessária." }, { status: 401 });
  }

  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (contentLength > MAX_BODY_BYTES) {
    return Response.json({ error: "Arquivo excede o limite desta etapa do MVP." }, { status: 413 });
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
    const importContext = {
      fallbackMethod: body.fallbackMethod,
      hasAgronomicContext: body.hasAgronomicContext,
      spatialLinked: body.spatialLinked,
    };
    const preview = isSpreadsheetFileName(fileName)
      ? buildLabImportPreviewFromXlsxBase64(body.content, fileName, importContext)
      : buildLabImportPreview(body.content, fileName, importContext);

    return Response.json(preview, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível validar o arquivo.";
    return Response.json({ error: message }, { status: 422 });
  }
}
