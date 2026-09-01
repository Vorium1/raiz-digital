import { getPlatformSession } from "@/lib/auth/session";
import { collectSamplePoint, FieldOperationError } from "@/lib/repositories/collections";

const writeRoles = new Set(["SUPER_ADMIN", "TENANT_ADMIN", "AGRONOMIST", "FIELD_TECH"]);

export async function PATCH(request: Request, context: { params: Promise<{ id: string; pointId: string }> }) {
  const session = await getPlatformSession();
  if (!session) return Response.json({ error: "Sessão necessária." }, { status: 401 });
  if (!writeRoles.has(session.role)) return Response.json({ error: "Seu perfil não pode registrar coleta." }, { status: 403 });
  const { id, pointId } = await context.params;
  try {
    const body = await request.json() as Record<string, unknown>;
    const latitude = Number(body.latitude);
    const longitude = Number(body.longitude);
    const accuracyM = body.accuracyM == null ? null : Number(body.accuracyM);
    const subsampleCount = body.subsampleCount == null || body.subsampleCount === "" ? null : Number(body.subsampleCount);
    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
      return Response.json({ error: "Coordenada GPS inválida." }, { status: 400 });
    }
    if (accuracyM != null && (!Number.isFinite(accuracyM) || accuracyM < 0 || accuracyM > 500)) return Response.json({ error: "Precisão GPS inválida." }, { status: 400 });
    if (subsampleCount != null && (!Number.isInteger(subsampleCount) || subsampleCount < 1 || subsampleCount > 100)) return Response.json({ error: "Quantidade de subamostras inválida." }, { status: 400 });
    const result = await collectSamplePoint({
      tenantId: session.tenantId,
      userId: session.userId,
      orderId: id,
      pointId,
      latitude,
      longitude,
      accuracyM,
      subsampleCount,
      notes: typeof body.notes === "string" ? body.notes.trim() : null,
    });
    return Response.json({ point: result });
  } catch (error) {
    if (error instanceof FieldOperationError) return Response.json({ error: error.message, details: error.details }, { status: error.status });
    return Response.json({ error: error instanceof Error ? error.message : "Falha ao registrar coleta." }, { status: 422 });
  }
}
