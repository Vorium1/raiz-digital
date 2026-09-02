import { getPlatformSession } from "@/lib/auth/session";
import { InterpretationError, reviewInterpretation } from "@/lib/repositories/interpretations";

const reviewRoles = new Set(["SUPER_ADMIN", "TENANT_ADMIN", "AGRONOMIST"]);

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getPlatformSession();
  if (!session) return Response.json({ error: "Sessão necessária." }, { status: 401 });
  if (!reviewRoles.has(session.role)) return Response.json({ error: "Somente um agrônomo responsável pode revisar ou aprovar uma interpretação." }, { status: 403 });
  const { id } = await context.params;

  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const approve = body.approve === true;
    const updated = await reviewInterpretation({ tenantId: session.tenantId, userId: session.userId, interpretationId: id, approve });
    return Response.json({ interpretation: updated });
  } catch (error) {
    if (error instanceof InterpretationError) return Response.json({ error: error.message }, { status: error.status });
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível registrar a revisão." }, { status: 422 });
  }
}
