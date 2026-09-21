import { compactLabImportPreview, LAB_UPLOAD_LIMITS } from "@/domain/lab-upload-limits";
import { getPlatformSession } from "@/lib/auth/session";
import { commitCsvImport, type LabSampleType } from "@/lib/repositories/imports";
import { RawImportPersistenceError } from "@/lib/storage";

const MAX_BODY_BYTES = LAB_UPLOAD_LIMITS.functionPayloadBytes;

export async function POST(request: Request) {
  const session = await getPlatformSession();
  if (!session) return Response.json({ error: "Sessão necessária." }, { status: 401 });
  if (!new Set(["SUPER_ADMIN", "TENANT_ADMIN", "AGRONOMIST", "FIELD_TECH"]).has(session.role)) {
    return Response.json({ error: "Seu perfil não pode importar laudos." }, { status: 403 });
  }

  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (contentLength > MAX_BODY_BYTES) {
    return Response.json({ error: "Requisição do arquivo excede o limite seguro do ambiente atual." }, { status: 413 });
  }

  try {
    const body = await request.json() as {
      analysisId?: string;
      content?: string;
      fileName?: string;
      fallbackMethod?: string;
      hasAgronomicContext?: boolean;
      spatialLinked?: boolean;
      sampleType?: LabSampleType;
    };

    if (!body.analysisId || typeof body.content !== "string" || !body.content.trim()) {
      return Response.json({ error: "Análise e conteúdo do laudo são obrigatórios." }, { status: 400 });
    }

    const allowedSampleTypes = new Set<LabSampleType>([
      "SOLO", "FOLIAR", "PECIOLO", "MASSA_SECA", "GRAO", "SEMENTE", "FERTILIZANTE", "BIOLOGICO",
    ]);
    if (body.sampleType != null && !allowedSampleTypes.has(body.sampleType)) {
      return Response.json({ error: "Tipo de amostra não reconhecido." }, { status: 400 });
    }

    const result = await commitCsvImport({
      tenantId: session.tenantId,
      userId: session.userId,
      analysisId: body.analysisId,
      content: body.content,
      fileName: body.fileName ?? "laudo.csv",
      fallbackMethod: body.fallbackMethod,
      hasAgronomicContext: body.hasAgronomicContext,
      spatialLinked: body.spatialLinked,
      sampleType: body.sampleType,
    });

    // O commit processa/persiste todas as linhas, mas a resposta HTTP devolve somente uma amostra do
    // preview. Isso evita estourar o limite de resposta da Vercel depois que o banco já foi atualizado.
    return Response.json({ ...result, preview: compactLabImportPreview(result.preview) }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao persistir a importação.";
    const status = error instanceof RawImportPersistenceError ? 503 : 422;
    return Response.json({ error: message }, { status });
  }
}
