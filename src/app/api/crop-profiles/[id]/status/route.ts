import { getPlatformSession } from "@/lib/auth/session";
import { AgronomicProfileError, updateCropProfileStatus } from "@/lib/repositories/agronomic-profiles";

const homologationRoles = new Set(["SUPER_ADMIN", "TENANT_ADMIN", "AGRONOMIST"]);
const validStatuses = new Set(["DRAFT", "ACTIVE", "SUPERSEDED"]);

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getPlatformSession();
  if (!session) return Response.json({ error: "Sessão necessária." }, { status: 401 });
  if (!homologationRoles.has(session.role)) return Response.json({ error: "Somente um agrônomo responsável pode homologar um perfil de cultura." }, { status: 403 });
  const { id } = await context.params;

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const status = typeof body.status === "string" ? body.status : "";
    if (!validStatuses.has(status)) return Response.json({ error: "Status inválido." }, { status: 400 });
    const cropProfile = await updateCropProfileStatus({ tenantId: session.tenantId, userId: session.userId, cropProfileId: id, status: status as "DRAFT" | "ACTIVE" | "SUPERSEDED" });
    return Response.json({ cropProfile });
  } catch (error) {
    if (error instanceof AgronomicProfileError) return Response.json({ error: error.message }, { status: error.status });
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível atualizar o status." }, { status: 422 });
  }
}
