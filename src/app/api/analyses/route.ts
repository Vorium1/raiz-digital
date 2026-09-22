import { isAnalysisDepthId, type AnalysisDepthId } from "@/domain/analysis-depths";
import { getPlatformSession } from "@/lib/auth/session";
import { createAnalysis, listAnalyses } from "@/lib/repositories/analyses";
import { irrigationApplicationsFromContext, parseIrrigationApplications } from "@/domain/irrigation-applications";

const sourceTypes = new Set(["INTEGRATION", "CSV", "XLSX", "PDF_OCR", "MANUAL"] as const);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

export async function GET() {
  const session = await getPlatformSession();
  if (!session) return Response.json({ error: "Sessão necessária." }, { status: 401 });
  const analyses = await listAnalyses(session.tenantId, session.userId);
  return Response.json({ analyses });
}

export async function POST(request: Request) {
  const session = await getPlatformSession();
  if (!session) return Response.json({ error: "Sessão necessária." }, { status: 401 });
  if (!new Set(["SUPER_ADMIN", "TENANT_ADMIN", "AGRONOMIST", "FIELD_TECH"]).has(session.role)) {
    return Response.json({ error: "Seu perfil não pode criar análises." }, { status: 403 });
  }

  const body = await request.json() as {
    cropSeasonId?: string;
    collectionOrderId?: string;
    laboratoryId?: string;
    sourceType?: "INTEGRATION" | "CSV" | "XLSX" | "PDF_OCR" | "MANUAL" | null;
    analysisDepth?: AnalysisDepthId | null;
    analysisContext?: unknown;
  };

  if (!body.cropSeasonId) return Response.json({ error: "Safra/talhão obrigatório." }, { status: 400 });
  if (body.sourceType != null && !sourceTypes.has(body.sourceType)) {
    return Response.json({ error: "Tipo de origem do laudo inválido." }, { status: 400 });
  }
  if (body.analysisDepth != null && !isAnalysisDepthId(body.analysisDepth)) {
    return Response.json({ error: "Profundidade de análise inválida." }, { status: 400 });
  }
  if (body.analysisContext != null && !isPlainObject(body.analysisContext)) {
    return Response.json({ error: "Contexto da análise deve ser um objeto." }, { status: 400 });
  }

  const analysisContext = body.analysisContext && isPlainObject(body.analysisContext) ? body.analysisContext : {};
  const contextBytes = Buffer.byteLength(JSON.stringify(analysisContext), "utf8");
  if (contextBytes > 64 * 1024) {
    return Response.json({ error: "Contexto da análise excede o limite de 64 KB. Vincule documentos em vez de colar conteúdo integral." }, { status: 413 });
  }

  try { parseIrrigationApplications(irrigationApplicationsFromContext(analysisContext)); }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Registro de irrigação inválido." }, { status: 400 }); }

  const analysis = await createAnalysis({
    tenantId: session.tenantId,
    userId: session.userId,
    cropSeasonId: body.cropSeasonId,
    collectionOrderId: body.collectionOrderId || null,
    laboratoryId: body.laboratoryId || null,
    sourceType: body.sourceType || null,
    analysisDepth: body.analysisDepth ?? null,
    analysisContext,
  });
  return Response.json({ analysis }, { status: 201 });
}
