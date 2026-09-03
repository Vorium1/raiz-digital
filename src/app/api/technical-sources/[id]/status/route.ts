import { getPlatformSession } from "@/lib/auth/session";
import { AgronomicProfileError, setTechnicalSourceStatus } from "@/lib/repositories/agronomic-profiles";

const validStatuses = new Set(["DRAFT", "ACTIVE", "SUPERSEDED"]);

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getPlatformSession();
  if (!session) return Response.json({ error: "Sessão necessária." }, { status: 401 });
  if (!session.isPlatformCurator) return Response.json({ error: "Somente um curador da plataforma pode homologar uma fonte técnica." }, { status: 403 });
  const { id } = await context.params;

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const status = typeof body.status === "string" ? body.status : "";
    if (!validStatuses.has(status)) return Response.json({ error: "Status inválido." }, { status: 400 });
    const technicalSource = await setTechnicalSourceStatus({ tenantId: session.tenantId, userId: session.userId, sourceId: id, status: status as "DRAFT" | "ACTIVE" | "SUPERSEDED" });
    return Response.json({ technicalSource });
  } catch (error) {
    if (error instanceof AgronomicProfileError) return Response.json({ error: error.message }, { status: error.status });
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível atualizar a fonte técnica." }, { status: 422 });
  }
}
