import { getPlatformSession } from "@/lib/auth/session";
import { getInputComparisonForAnalysis } from "@/lib/repositories/catalog";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getPlatformSession();
  if (!session) return Response.json({ error: "Sessão necessária." }, { status: 401 });
  const { id } = await context.params;
  const comparison = await getInputComparisonForAnalysis(session.tenantId, id, session.userId);
  return Response.json({ comparison });
}
