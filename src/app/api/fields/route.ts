import { getPlatformSession } from "@/lib/auth/session";
import { CatalogError, createField } from "@/lib/repositories/catalog";

function validBoundary(value: unknown): object | null {
  if (!value || typeof value !== "object") return null;
  const type = (value as { type?: unknown }).type;
  return type === "Polygon" || type === "MultiPolygon" ? value as object : null;
}

export async function POST(request: Request) {
  const session = await getPlatformSession();
  if (!session) return Response.json({ error: "Sessão necessária." }, { status: 401 });
  if (!new Set(["SUPER_ADMIN","TENANT_ADMIN","AGRONOMIST","FIELD_TECH"]).has(session.role)) return Response.json({ error: "Perfil sem permissão." }, { status: 403 });
  try {
    const body = await request.json() as Record<string, unknown>;
    const propertyId = typeof body.propertyId === "string" ? body.propertyId : "";
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const boundary = validBoundary(body.boundary);
    if (!propertyId || !name || !boundary) return Response.json({ error: "Propriedade, nome e limite GeoJSON do talhão são obrigatórios." }, { status: 400 });
    const field = await createField({ tenantId: session.tenantId, userId: session.userId, propertyId, name, boundary });
    return Response.json({ field }, { status: 201 });
  } catch (error) {
    if (error instanceof CatalogError) return Response.json({ error: error.message }, { status: error.status });
    return Response.json({ error: "Não foi possível cadastrar o talhão. Verifique os dados informados." }, { status: 422 });
  }
}
