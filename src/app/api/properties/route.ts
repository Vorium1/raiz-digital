import { getPlatformSession } from "@/lib/auth/session";
import { createProperty } from "@/lib/repositories/catalog";

function validGeometry(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const type = (value as { type?: unknown }).type;
  return type === "Polygon" || type === "MultiPolygon" ? value as object : null;
}

export async function POST(request: Request) {
  const session = await getPlatformSession();
  if (!session) return Response.json({ error: "Sessão necessária." }, { status: 401 });
  if (!new Set(["SUPER_ADMIN","TENANT_ADMIN","AGRONOMIST","FIELD_TECH","COMMERCIAL"]).has(session.role)) return Response.json({ error: "Perfil sem permissão." }, { status: 403 });
  const body = await request.json() as Record<string, unknown>;
  const clientId = typeof body.clientId === "string" ? body.clientId : "";
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const municipality = typeof body.municipality === "string" ? body.municipality.trim() : "";
  const state = typeof body.state === "string" ? body.state.trim().toUpperCase() : "";
  if (!clientId || !name || !municipality || !/^[A-Z]{2}$/.test(state)) return Response.json({ error: "Cliente, propriedade, município e UF são obrigatórios." }, { status: 400 });
  const boundary = body.boundary == null ? null : validGeometry(body.boundary);
  if (body.boundary != null && !boundary) return Response.json({ error: "Limite da propriedade deve ser GeoJSON Polygon ou MultiPolygon." }, { status: 400 });
  const property = await createProperty({ tenantId: session.tenantId, userId: session.userId, clientId, name, municipality, state, boundary });
  return Response.json({ property }, { status: 201 });
}
