import { getPlatformSession } from "@/lib/auth/session";
import { CatalogError, deleteField, updateField } from "@/lib/repositories/catalog";

const writeRoles = new Set(["SUPER_ADMIN", "TENANT_ADMIN", "AGRONOMIST", "FIELD_TECH"]);

function validBoundary(value: unknown): object | null {
  if (!value || typeof value !== "object") return null;
  const type = (value as { type?: unknown }).type;
  return type === "Polygon" || type === "MultiPolygon" ? value as object : null;
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getPlatformSession();
  if (!session) return Response.json({ error: "Sessão necessária." }, { status: 401 });
  if (!writeRoles.has(session.role)) return Response.json({ error: "Seu perfil não pode editar talhões." }, { status: 403 });
  const { id } = await context.params;

  try {
    const body = await request.json() as Record<string, unknown>;
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) return Response.json({ error: "Nome do talhão é obrigatório." }, { status: 400 });
    const boundaryProvided = Object.prototype.hasOwnProperty.call(body, "boundary");
    const boundary = boundaryProvided ? validBoundary(body.boundary) : null;
    if (boundaryProvided && !boundary) {
      return Response.json({ error: "O limite do talhão precisa ser um GeoJSON Polygon ou MultiPolygon válido." }, { status: 400 });
    }
    const updated = await updateField({
      tenantId: session.tenantId,
      userId: session.userId,
      fieldId: id,
      name,
      boundary: boundaryProvided ? boundary : undefined,
    });
    return Response.json({ field: updated });
  } catch (error) {
    if (error instanceof CatalogError) return Response.json({ error: error.message }, { status: error.status });
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível editar o talhão." }, { status: 422 });
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getPlatformSession();
  if (!session) return Response.json({ error: "Sessão necessária." }, { status: 401 });
  if (!new Set(["SUPER_ADMIN", "TENANT_ADMIN"]).has(session.role)) {
    return Response.json({ error: "Seu perfil não pode excluir talhões." }, { status: 403 });
  }
  const { id } = await context.params;

  try {
    const deleted = await deleteField({ tenantId: session.tenantId, userId: session.userId, fieldId: id });
    return Response.json({ field: deleted });
  } catch (error) {
    if (error instanceof CatalogError) return Response.json({ error: error.message }, { status: error.status });
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível excluir o talhão." }, { status: 422 });
  }
}
