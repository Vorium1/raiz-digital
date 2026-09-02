import { getPlatformSession } from "@/lib/auth/session";
import { CatalogError, deleteProperty, updateProperty } from "@/lib/repositories/catalog";

const writeRoles = new Set(["SUPER_ADMIN", "TENANT_ADMIN", "AGRONOMIST", "FIELD_TECH", "COMMERCIAL"]);

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getPlatformSession();
  if (!session) return Response.json({ error: "Sessão necessária." }, { status: 401 });
  if (!writeRoles.has(session.role)) return Response.json({ error: "Seu perfil não pode editar propriedades." }, { status: 403 });
  const { id } = await context.params;

  try {
    const body = await request.json() as Record<string, unknown>;
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const municipality = typeof body.municipality === "string" ? body.municipality.trim() : "";
    const state = typeof body.state === "string" ? body.state.trim().toUpperCase() : "";
    if (!name || !municipality || !/^[A-Z]{2}$/.test(state)) {
      return Response.json({ error: "Nome, município e UF são obrigatórios." }, { status: 400 });
    }
    const updated = await updateProperty({ tenantId: session.tenantId, userId: session.userId, propertyId: id, name, municipality, state });
    return Response.json({ property: updated });
  } catch (error) {
    if (error instanceof CatalogError) return Response.json({ error: error.message }, { status: error.status });
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível editar a propriedade." }, { status: 422 });
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getPlatformSession();
  if (!session) return Response.json({ error: "Sessão necessária." }, { status: 401 });
  if (!new Set(["SUPER_ADMIN", "TENANT_ADMIN"]).has(session.role)) {
    return Response.json({ error: "Seu perfil não pode excluir propriedades." }, { status: 403 });
  }
  const { id } = await context.params;

  try {
    const deleted = await deleteProperty({ tenantId: session.tenantId, userId: session.userId, propertyId: id });
    return Response.json({ property: deleted });
  } catch (error) {
    if (error instanceof CatalogError) return Response.json({ error: error.message }, { status: error.status });
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível excluir a propriedade." }, { status: 422 });
  }
}
