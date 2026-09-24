import { getPlatformSession } from "@/lib/auth/session";
import { ReportError } from "@/lib/repositories/reports";
import { publishPremiumFieldAnalysisReport } from "@/lib/repositories/premium-report-publication";
import { assertReportPublicationReady, ReportPublicationGateError } from "@/lib/repositories/report-publication-gate";

const publishRoles = new Set(["SUPER_ADMIN", "TENANT_ADMIN", "AGRONOMIST"]);

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getPlatformSession();
  if (!session) return Response.json({ error: "Sessão necessária." }, { status: 401 });
  if (!publishRoles.has(session.role)) return Response.json({ error: "Seu perfil não pode gerar um laudo oficial." }, { status: 403 });
  const { id } = await context.params;

  const body = await request.json().catch(() => ({})) as { commercialPlanSnapshotId?: unknown };
  if (body.commercialPlanSnapshotId != null && typeof body.commercialPlanSnapshotId !== "string") {
    return Response.json({ error: "Identificador do cenário comercial inválido." }, { status: 400 });
  }
  const commercialPlanSnapshotId = typeof body.commercialPlanSnapshotId === "string" && body.commercialPlanSnapshotId.trim()
    ? body.commercialPlanSnapshotId.trim()
    : null;

  try {
    await assertReportPublicationReady(session.tenantId, id, session.userId);
    const report = await publishPremiumFieldAnalysisReport({
      tenantId: session.tenantId,
      userId: session.userId,
      interpretationId: id,
      commercialPlanSnapshotId,
    });
    return Response.json({ report }, { status: 201 });
  } catch (error) {
    if (error instanceof ReportPublicationGateError) return Response.json({ error: error.message }, { status: error.status });
    if (error instanceof ReportError) return Response.json({ error: error.message }, { status: error.status });
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível publicar o relatório." }, { status: 422 });
  }
}
