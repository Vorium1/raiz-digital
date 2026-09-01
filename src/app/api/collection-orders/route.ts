import { getPlatformSession } from "@/lib/auth/session";
import { createCollectionOrder, FieldOperationError, listCollectionOrders } from "@/lib/repositories/collections";

const writeRoles = new Set(["SUPER_ADMIN", "TENANT_ADMIN", "AGRONOMIST", "FIELD_TECH"]);

function errorResponse(error: unknown) {
  if (error instanceof FieldOperationError) return Response.json({ error: error.message, details: error.details }, { status: error.status });
  const message = error instanceof Error ? error.message : "Falha na operação de campo.";
  return Response.json({ error: message }, { status: 422 });
}

export async function GET(request: Request) {
  const session = await getPlatformSession();
  if (!session) return Response.json({ error: "Sessão necessária." }, { status: 401 });
  const url = new URL(request.url);
  const cropSeasonId = url.searchParams.get("cropSeasonId");
  try {
    const orders = await listCollectionOrders(session.tenantId, session.userId, cropSeasonId);
    return Response.json({ orders });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  const session = await getPlatformSession();
  if (!session) return Response.json({ error: "Sessão necessária." }, { status: 401 });
  if (!writeRoles.has(session.role)) return Response.json({ error: "Seu perfil não pode criar ordens de coleta." }, { status: 403 });

  try {
    const body = await request.json() as Record<string, unknown>;
    const cropSeasonId = typeof body.cropSeasonId === "string" ? body.cropSeasonId : "";
    const samplingStrategy = body.samplingStrategy === "IMPORTED" || body.samplingStrategy === "MANUAL" ? body.samplingStrategy : "GRID";
    const gridAreaHa = body.gridAreaHa == null || body.gridAreaHa === "" ? null : Number(body.gridAreaHa);
    const depthFromCm = Number(body.depthFromCm ?? 0);
    const depthToCm = Number(body.depthToCm ?? 20);
    const assignedTo = typeof body.assignedTo === "string" && body.assignedTo ? body.assignedTo : null;
    const plannedAt = typeof body.plannedAt === "string" && body.plannedAt ? body.plannedAt : null;
    if (!cropSeasonId || !Number.isFinite(depthFromCm) || !Number.isFinite(depthToCm) || (gridAreaHa != null && !Number.isFinite(gridAreaHa))) {
      return Response.json({ error: "Safra, profundidade e grid precisam ser válidos." }, { status: 400 });
    }
    const order = await createCollectionOrder({
      tenantId: session.tenantId,
      userId: session.userId,
      cropSeasonId,
      assignedTo,
      gridAreaHa,
      depthFromCm,
      depthToCm,
      plannedAt,
      samplingStrategy,
    });
    return Response.json({ order }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
