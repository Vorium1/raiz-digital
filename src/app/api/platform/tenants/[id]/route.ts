import { getPlatformSession } from "@/lib/auth/session";
import {
  PlatformAdminError,
  updatePlatformTenantStatus,
  type PlatformTenantStatus,
} from "@/lib/repositories/platform-admin";

const STATUSES = new Set<PlatformTenantStatus>(["ACTIVE", "BLOCKED", "CANCELED"]);

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getPlatformSession();
  if (!session) return Response.json({ error: "Sessão necessária." }, { status: 401 });
  if (!session.isPlatformAdmin) return Response.json({ error: "Acesso restrito à administração da plataforma." }, { status: 403 });

  try {
    const body = await request.json() as { status?: string };
    if (!body.status || !STATUSES.has(body.status as PlatformTenantStatus)) {
      return Response.json({ error: "Situação de empresa inválida." }, { status: 400 });
    }
    const { id } = await context.params;
    await updatePlatformTenantStatus({
      actorUserId: session.userId,
      tenantId: id,
      status: body.status as PlatformTenantStatus,
    });
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof PlatformAdminError) return Response.json({ error: error.message }, { status: error.status });
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível atualizar a empresa." }, { status: 422 });
  }
}
