import { getPlatformSession } from "@/lib/auth/session";
import { InterpretationError, runInterpretationForAnalysis } from "@/lib/repositories/interpretations";

const writeRoles = new Set(["SUPER_ADMIN", "TENANT_ADMIN", "AGRONOMIST", "FIELD_TECH"]);

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getPlatformSession();
  if (!session) return Response.json({ error: "Sessão necessária." }, { status: 401 });
  if (!writeRoles.has(session.role)) return Response.json({ error: "Seu perfil não pode interpretar análises." }, { status: 403 });
  const { id } = await context.params;

  try {
    const { interpretation, engineResult } = await runInterpretationForAnalysis({ tenantId: session.tenantId, userId: session.userId, analysisId: id });
    return Response.json({ interpretation, engineResult }, { status: 201 });
  } catch (error) {
    if (error instanceof InterpretationError) return Response.json({ error: error.message }, { status: error.status });
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível interpretar a análise." }, { status: 422 });
  }
}
