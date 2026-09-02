import { getPlatformSession } from "@/lib/auth/session";
import { CatalogError, setLaboratoryActive, updateLaboratory } from "@/lib/repositories/catalog";

const writeRoles = new Set(["SUPER_ADMIN", "TENANT_ADMIN", "AGRONOMIST"]);

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getPlatformSession();
  if (!session) return Response.json({ error: "Sessão necessária." }, { status: 401 });
  if (!writeRoles.has(session.role)) return Response.json({ error: "Seu perfil não pode gerenciar laboratórios." }, { status: 403 });
  const { id } = await context.params;

  try {
    const body = await request.json() as { name?: string; taxId?: string; active?: boolean };

    if (typeof body.name === "string") {
      const name = body.name.trim();
      if (!name) return Response.json({ error: "Nome do laboratório é obrigatório." }, { status: 400 });
      const taxId = typeof body.taxId === "string" ? body.taxId.trim() : "";
      const laboratory = await updateLaboratory({ tenantId: session.tenantId, userId: session.userId, laboratoryId: id, name, taxId });
      return Response.json({ laboratory });
    }
    if (typeof body.active === "boolean") {
      const laboratory = await setLaboratoryActive({ tenantId: session.tenantId, userId: session.userId, laboratoryId: id, active: body.active });
      return Response.json({ laboratory });
    }
    return Response.json({ error: "Informe um nome ou situação para atualizar." }, { status: 400 });
  } catch (error) {
    if (error instanceof CatalogError) return Response.json({ error: error.message }, { status: error.status });
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível atualizar o laboratório." }, { status: 422 });
  }
}
