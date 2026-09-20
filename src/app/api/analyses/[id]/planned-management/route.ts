import { getPlatformSession } from "@/lib/auth/session";
import {
  AnalysisContextError,
  getAnalysisPlannedManagementNotes,
  updateAnalysisPlannedManagementNotes,
} from "@/lib/repositories/analyses";

const writeRoles = new Set(["SUPER_ADMIN", "TENANT_ADMIN", "AGRONOMIST", "FIELD_TECH"]);

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getPlatformSession();
  if (!session) return Response.json({ error: "Sessão necessária." }, { status: 401 });
  const { id } = await context.params;

  try {
    const plannedManagement = await getAnalysisPlannedManagementNotes({
      tenantId: session.tenantId,
      userId: session.userId,
      analysisId: id,
    });
    if (!plannedManagement) return Response.json({ error: "Análise não encontrada." }, { status: 404 });
    return Response.json({ plannedManagement });
  } catch (error) {
    if (error instanceof AnalysisContextError) return Response.json({ error: error.message }, { status: error.status });
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível carregar o manejo planejado." }, { status: 422 });
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getPlatformSession();
  if (!session) return Response.json({ error: "Sessão necessária." }, { status: 401 });
  if (!writeRoles.has(session.role)) return Response.json({ error: "Seu perfil não pode editar o contexto agronômico da análise." }, { status: 403 });
  const { id } = await context.params;

  try {
    const body = await request.json() as Record<string, unknown>;
    if (!Object.prototype.hasOwnProperty.call(body, "plannedManagementNotes")) {
      throw new AnalysisContextError("Informe o campo plannedManagementNotes.", 400);
    }
    const plannedManagementNotes = body.plannedManagementNotes == null ? "" : String(body.plannedManagementNotes);

    const plannedManagement = await updateAnalysisPlannedManagementNotes({
      tenantId: session.tenantId,
      userId: session.userId,
      analysisId: id,
      plannedManagementNotes,
    });
    return Response.json({ plannedManagement });
  } catch (error) {
    if (error instanceof AnalysisContextError) return Response.json({ error: error.message }, { status: error.status });
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível atualizar o manejo planejado." }, { status: 422 });
  }
}
