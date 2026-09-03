import { getPlatformSession } from "@/lib/auth/session";
import { CatalogError, deleteInputApplication } from "@/lib/repositories/catalog";

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getPlatformSession();
  if (!session) return Response.json({ error: "Sessão necessária." }, { status: 401 });
  if (!new Set(["SUPER_ADMIN", "TENANT_ADMIN", "AGRONOMIST", "FIELD_TECH"]).has(session.role)) {
    return Response.json({ error: "Seu perfil não pode excluir este registro." }, { status: 403 });
  }
  const { id } = await context.params;
  try {
    const deleted = await deleteInputApplication({ tenantId: session.tenantId, userId: session.userId, applicationId: id });
    return Response.json({ application: deleted });
  } catch (error) {
    if (error instanceof CatalogError) return Response.json({ error: error.message }, { status: error.status });
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível excluir o registro." }, { status: 422 });
  }
}
