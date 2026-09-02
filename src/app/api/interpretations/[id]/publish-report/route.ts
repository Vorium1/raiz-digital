import { getPlatformSession } from "@/lib/auth/session";
import { publishFieldAnalysisReport, ReportError } from "@/lib/repositories/reports";

const publishRoles = new Set(["SUPER_ADMIN", "TENANT_ADMIN", "AGRONOMIST"]);

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getPlatformSession();
  if (!session) return Response.json({ error: "Sessão necessária." }, { status: 401 });
  if (!publishRoles.has(session.role)) return Response.json({ error: "Somente um agrônomo responsável pode publicar um relatório." }, { status: 403 });
  const { id } = await context.params;

  try {
    const report = await publishFieldAnalysisReport({ tenantId: session.tenantId, userId: session.userId, interpretationId: id });
    return Response.json({ report }, { status: 201 });
  } catch (error) {
    if (error instanceof ReportError) return Response.json({ error: error.message }, { status: error.status });
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível publicar o relatório." }, { status: 422 });
  }
}
