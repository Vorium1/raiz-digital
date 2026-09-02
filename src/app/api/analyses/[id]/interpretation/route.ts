import { getPlatformSession } from "@/lib/auth/session";
import { getLatestInterpretation, listInterpretationHistory } from "@/lib/repositories/interpretations";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getPlatformSession();
  if (!session) return Response.json({ error: "Sessão necessária." }, { status: 401 });
  const { id } = await context.params;

  const [latest, history] = await Promise.all([
    getLatestInterpretation(session.tenantId, id, session.userId),
    listInterpretationHistory(session.tenantId, id, session.userId),
  ]);
  return Response.json({ latest, history });
}
