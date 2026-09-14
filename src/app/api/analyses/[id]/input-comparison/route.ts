import { getPlatformSession } from "@/lib/auth/session";
import { getCurrentInputComparisonForAnalysis } from "@/lib/repositories/input-comparison";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getPlatformSession();
  if (!session) return Response.json({ error: "Sessão necessária." }, { status: 401 });
  const { id } = await context.params;
  const comparison = await getCurrentInputComparisonForAnalysis(session.tenantId, id, session.userId);
  return Response.json({ comparison });
}
