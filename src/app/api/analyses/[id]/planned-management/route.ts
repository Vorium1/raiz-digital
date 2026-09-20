import { getPlatformSession } from "@/lib/auth/session";
import {
  AnalysisContextError,
  getAnalysisPlanningContext,
  updateAnalysisPlanningContext,
} from "@/lib/repositories/analyses";

const writeRoles = new Set(["SUPER_ADMIN", "TENANT_ADMIN", "AGRONOMIST", "FIELD_TECH"]);

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getPlatformSession();
  if (!session) return Response.json({ error: "Sessão necessária." }, { status: 401 });
  const { id } = await context.params;

  try {
    const planningContext = await getAnalysisPlanningContext({
      tenantId: session.tenantId,
      userId: session.userId,
      analysisId: id,
    });
    if (!planningContext) return Response.json({ error: "Análise não encontrada." }, { status: 404 });
    return Response.json({ planningContext, plannedManagement: planningContext });
  } catch (error) {
    if (error instanceof AnalysisContextError) return Response.json({ error: error.message }, { status: error.status });
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível carregar o planejamento agronômico." }, { status: 422 });
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getPlatformSession();
  if (!session) return Response.json({ error: "Sessão necessária." }, { status: 401 });
  if (!writeRoles.has(session.role)) return Response.json({ error: "Seu perfil não pode editar o contexto agronômico da análise." }, { status: 403 });
  const { id } = await context.params;

  try {
    const body = await request.json() as Record<string, unknown>;
    const hasPlannedManagement = Object.prototype.hasOwnProperty.call(body, "plannedManagementNotes");
    const hasHorizon = Object.prototype.hasOwnProperty.call(body, "fertilityPlanningHorizonYears");
    const hasCycleNotes = Object.prototype.hasOwnProperty.call(body, "fertilityCyclePlanNotes");

    if (!hasPlannedManagement && !hasHorizon && !hasCycleNotes) {
      throw new AnalysisContextError("Informe ao menos um campo de planejamento.", 400);
    }

    const horizonRaw = hasHorizon && body.fertilityPlanningHorizonYears != null && body.fertilityPlanningHorizonYears !== ""
      ? Number(body.fertilityPlanningHorizonYears)
      : null;

    const planningContext = await updateAnalysisPlanningContext({
      tenantId: session.tenantId,
      userId: session.userId,
      analysisId: id,
      plannedManagementNotes: hasPlannedManagement
        ? (body.plannedManagementNotes == null ? "" : String(body.plannedManagementNotes))
        : undefined,
      fertilityPlanningHorizonYears: hasHorizon
        ? (horizonRaw as 2 | 3 | 4 | 5 | null)
        : undefined,
      fertilityCyclePlanNotes: hasCycleNotes
        ? (body.fertilityCyclePlanNotes == null ? "" : String(body.fertilityCyclePlanNotes))
        : undefined,
    });

    return Response.json({ planningContext, plannedManagement: planningContext });
  } catch (error) {
    if (error instanceof AnalysisContextError) return Response.json({ error: error.message }, { status: error.status });
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível atualizar o planejamento agronômico." }, { status: 422 });
  }
}
