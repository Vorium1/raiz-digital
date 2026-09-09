import { buildLabImportPreview } from "@/domain/lab-import";
import { geminiLabExtractionProvider } from "@/lib/ai/providers/gemini-lab-extraction-provider";
import { getPlatformSession } from "@/lib/auth/session";
import { isDatabaseMode } from "@/lib/data-mode";

const MAX_BODY_BYTES = 9_000_000;
const ALLOWED_MIME_TYPES = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp"]);

/**
 * Leitura de laudo (PDF/foto) por IA -- ver nota completa em
 * `gemini-lab-extraction-provider.ts`. Este endpoint só faz a transcrição
 * (IA) e devolve pelo MESMO validador determinístico que já processa CSV/
 * XLSX (`buildLabImportPreview`), então a resposta tem exatamente o mesmo
 * formato (`LabImportPreview`) que a tela de importação já sabe renderizar
 * -- a única diferença visível pro usuário é o aviso extra de que os
 * valores vieram de IA e precisam de conferência linha a linha contra o
 * laudo original antes de prosseguir.
 */
export async function POST(request: Request) {
  if (isDatabaseMode() && !(await getPlatformSession())) {
    return Response.json({ error: "Sessão necessária." }, { status: 401 });
  }

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

    const extraction = await geminiLabExtractionProvider.extract({ fileBase64: body.content, mimeType: body.mimeType });
    const preview = buildLabImportPreview(extraction.csvContent, body.fileName ?? "laudo-ia.csv", {
      fallbackMethod: body.fallbackMethod,
      hasAgronomicContext: true,
      spatialLinked: true,
    });

    return Response.json({ ...preview, aiExtracted: true, aiProvider: extraction.provider, aiModel: extraction.model, csvContent: extraction.csvContent }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível ler o arquivo com IA.";
    return Response.json({ error: message }, { status: 422 });
  }
}
