import { getPlatformSession } from "@/lib/auth/session";
import { cancelCollectionOrder, FieldOperationError } from "@/lib/repositories/collections";

const writeRoles = new Set(["SUPER_ADMIN", "TENANT_ADMIN", "AGRONOMIST", "FIELD_TECH"]);

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getPlatformSession();
  if (!session) return Response.json({ error: "Sessão necessária." }, { status: 401 });
  if (!writeRoles.has(session.role)) return Response.json({ error: "Seu perfil não pode cancelar ordens de coleta." }, { status: 403 });
  const { id } = await context.params;

  try {
    const body = await request.json() as { status?: string };
    if (body.status !== "CANCELED") return Response.json({ error: "Somente cancelamento é suportado por esta rota." }, { status: 400 });
    await cancelCollectionOrder({ tenantId: session.tenantId, userId: session.userId, orderId: id });
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof FieldOperationError) return Response.json({ error: error.message }, { status: error.status });
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível cancelar a ordem." }, { status: 422 });
  }
}
