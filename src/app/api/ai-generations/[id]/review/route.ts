import { getPlatformSession } from "@/lib/auth/session";
import { AiGenerationError, reviewAgronomicNarrative } from "@/lib/repositories/ai-generations";

const reviewRoles = new Set(["SUPER_ADMIN", "TENANT_ADMIN", "AGRONOMIST"]);
const validDecisions = new Set(["APPROVED", "CHANGES_REQUESTED", "REJECTED"]);

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getPlatformSession();
  if (!session) return Response.json({ error: "Sessão necessária." }, { status: 401 });
  if (!reviewRoles.has(session.role)) return Response.json({ error: "Somente um agrônomo responsável pode revisar a síntese gerada por IA." }, { status: 403 });
  const { id } = await context.params;

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const decision = typeof body.decision === "string" ? body.decision : "";
    if (!validDecisions.has(decision)) return Response.json({ error: "Decisão inválida." }, { status: 400 });
    const updated = await reviewAgronomicNarrative({ tenantId: session.tenantId, userId: session.userId, generationId: id, decision: decision as "APPROVED" | "CHANGES_REQUESTED" | "REJECTED", note: typeof body.note === "string" ? body.note : null });
    return Response.json({ generation: updated });
  } catch (error) {
    if (error instanceof AiGenerationError) return Response.json({ error: error.message }, { status: error.status });
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível registrar a revisão." }, { status: 422 });
  }
}
