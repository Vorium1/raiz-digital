import { getPlatformSession } from "@/lib/auth/session";
import { AiGenerationError } from "@/lib/repositories/ai-generations";
import { reviewFinalTechnicalReviewSafely } from "@/lib/repositories/final-technical-review";
import { InterpretationError } from "@/lib/repositories/interpretations";

const reviewRoles = new Set(["SUPER_ADMIN", "TENANT_ADMIN", "AGRONOMIST"]);

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getPlatformSession();
  if (!session) return Response.json({ error: "Sessão necessária." }, { status: 401 });
  if (!reviewRoles.has(session.role)) {
    return Response.json({ error: "Somente um agrônomo responsável pode concluir a revisão técnica final." }, { status: 403 });
  }

  const { id } = await context.params;
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const interpretationId = typeof body.interpretationId === "string" ? body.interpretationId : "";
  const prescriptionId = typeof body.prescriptionId === "string" ? body.prescriptionId : "";
  const decision = body.decision === "CHANGES_REQUESTED"
    ? "CHANGES_REQUESTED"
    : body.decision === undefined || body.decision === "APPROVED"
      ? "APPROVED"
      : null;

  if (!interpretationId || !prescriptionId) {
    return Response.json({ error: "Interpretação e recomendação de rascunho são obrigatórias para a revisão final." }, { status: 400 });
  }
  if (!decision) {
    return Response.json({ error: "Decisão inválida para a revisão final." }, { status: 400 });
  }

  try {
    const result = await reviewFinalTechnicalReviewSafely({
      tenantId: session.tenantId,
      userId: session.userId,
      analysisId: id,
      interpretationId,
      prescriptionId,
      decision,
      note: typeof body.note === "string" ? body.note : null,
    });
    return Response.json(result);
  } catch (error) {
    if (error instanceof AiGenerationError || error instanceof InterpretationError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível concluir a revisão técnica final." }, { status: 422 });
  }
}
