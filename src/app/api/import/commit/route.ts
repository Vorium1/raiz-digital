import { getPlatformSession } from "@/lib/auth/session";
import { commitCsvImport } from "@/lib/repositories/imports";

const MAX_BODY_BYTES = 6_000_000;

export async function POST(request: Request) {
  const session = await getPlatformSession();
  if (!session) return Response.json({ error: "Sessão necessária." }, { status: 401 });
  if (!new Set(["SUPER_ADMIN", "TENANT_ADMIN", "AGRONOMIST", "FIELD_TECH"]).has(session.role)) {
    return Response.json({ error: "Seu perfil não pode importar laudos." }, { status: 403 });
  }

  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (contentLength > MAX_BODY_BYTES) {
    return Response.json({ error: "Arquivo excede o limite desta etapa do MVP." }, { status: 413 });
  }

  try {
    const body = await request.json() as {
      analysisId?: string;
      content?: string;
      fileName?: string;
      fallbackMethod?: string;
      hasAgronomicContext?: boolean;
      spatialLinked?: boolean;
    };

    if (!body.analysisId || typeof body.content !== "string" || !body.content.trim()) {
      return Response.json({ error: "Análise e conteúdo CSV são obrigatórios." }, { status: 400 });
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
    });

    return Response.json(result, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao persistir a importação.";
    return Response.json({ error: message }, { status: 422 });
  }
}
