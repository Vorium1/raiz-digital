import { evaluatePrescriptionReviewTransition, type PrescriptionReviewDecision } from "@/domain/agronomic-prescription-review";
import { getPlatformSession } from "@/lib/auth/session";
import { AiGenerationError, reviewAgronomicPrescription } from "@/lib/repositories/ai-generations";
import { getAgronomicPrescriptionReviewState } from "@/lib/repositories/prescription-review-state";

const reviewRoles = new Set(["SUPER_ADMIN", "TENANT_ADMIN", "AGRONOMIST"]);
const validDecisions = new Set<PrescriptionReviewDecision>(["APPROVED", "CHANGES_REQUESTED", "REJECTED"]);

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getPlatformSession();
  if (!session) return Response.json({ error: "Sessão necessária." }, { status: 401 });
  if (!reviewRoles.has(session.role)) return Response.json({ error: "Somente um agrônomo responsável pode revisar a prescrição gerada por IA." }, { status: 403 });
  const { id } = await context.params;

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const rawDecision = typeof body.decision === "string" ? body.decision : "";
    if (!validDecisions.has(rawDecision as PrescriptionReviewDecision)) return Response.json({ error: "Decisão inválida." }, { status: 400 });
    const decision = rawDecision as PrescriptionReviewDecision;

    const current = await getAgronomicPrescriptionReviewState(session.tenantId, id, session.userId);
    if (!current) return Response.json({ error: "Prescrição não encontrada." }, { status: 404 });

    const transition = evaluatePrescriptionReviewTransition(current.status, decision);
    if (!transition.allowed) return Response.json({ error: transition.reason }, { status: 409 });

    // Repetir a mesma decisão é idempotente. Em especial, repetir APPROVED não pode inserir novamente
    // as mesmas doses em input_recommendations.
    if (transition.noOp) {
      return Response.json({
        generation: {
          id: current.id,
          status: current.status,
          analysisId: current.analysisId,
          promotedRecommendations: 0,
          idempotent: true,
        },
      });
    }

    const updated = await reviewAgronomicPrescription({
      tenantId: session.tenantId,
      userId: session.userId,
      generationId: id,
      decision,
      note: typeof body.note === "string" ? body.note : null,
    });
    return Response.json({ generation: updated });
  } catch (error) {
    if (error instanceof AiGenerationError) return Response.json({ error: error.message }, { status: error.status });
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível registrar a revisão." }, { status: 422 });
  }
}
