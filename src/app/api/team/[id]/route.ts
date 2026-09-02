import { getPlatformSession } from "@/lib/auth/session";
import { setTeamMemberActive, TeamError, updateTeamMemberRole } from "@/lib/repositories/team";
import { withTenant } from "@/lib/db";

const manageableRoles = new Set(["TENANT_ADMIN", "AGRONOMIST", "FIELD_TECH", "COMMERCIAL", "VIEWER"]);

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getPlatformSession();
  if (!session) return Response.json({ error: "Sessão necessária." }, { status: 401 });
  if (!new Set(["SUPER_ADMIN", "TENANT_ADMIN"]).has(session.role)) {
    return Response.json({ error: "Seu perfil não pode gerenciar a equipe." }, { status: 403 });
  }
  const { id } = await context.params;

  try {
    if (session.role !== "SUPER_ADMIN") {
      const targetRole = await withTenant({ tenantId: session.tenantId, userId: session.userId }, async (client) => {
        const result = await client.query<{ role: string }>(
          `SELECT role::text FROM tenant_members WHERE tenant_id = $1::uuid AND user_id = $2::uuid`,
          [session.tenantId, id],
        );
        return result.rows[0]?.role;
      });
      if (targetRole === "SUPER_ADMIN") {
        return Response.json({ error: "Apenas um super administrador pode gerenciar outro super administrador." }, { status: 403 });
      }
    }

    const body = await request.json() as { role?: string; active?: boolean };

    if (typeof body.role === "string") {
      if (!manageableRoles.has(body.role)) return Response.json({ error: "Perfil inválido." }, { status: 400 });
      await updateTeamMemberRole({ tenantId: session.tenantId, actorUserId: session.userId, targetUserId: id, role: body.role });
    }
    if (typeof body.active === "boolean") {
      await setTeamMemberActive({ tenantId: session.tenantId, actorUserId: session.userId, targetUserId: id, active: body.active });
    }
    if (typeof body.role !== "string" && typeof body.active !== "boolean") {
      return Response.json({ error: "Informe um perfil ou situação para atualizar." }, { status: 400 });
    }

    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof TeamError) return Response.json({ error: error.message }, { status: error.status });
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível atualizar o membro." }, { status: 422 });
  }
}
