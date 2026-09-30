import { getPlatformSession } from "@/lib/auth/session";
import { collectAnalysisAgroclimateSnapshot } from "@/lib/agroclimate/analysis-snapshot";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await getPlatformSession();
  if (!session) return Response.json({ error: "Sessão necessária." }, { status: 401 });

  const { id } = await context.params;
  const collected = await collectAnalysisAgroclimateSnapshot({
    tenantId: session.tenantId,
    userId: session.userId,
    analysisId: id,
  });
  if (!collected) return Response.json({ error: "Análise não encontrada." }, { status: 404 });

  return Response.json(collected.raw, {
    headers: { "cache-control": "no-store" },
  });
}
