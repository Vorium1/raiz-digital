import { getPlatformSession } from "@/lib/auth/session";
import { CatalogError, deleteCropSeason, updateCropSeason } from "@/lib/repositories/catalog";

const writeRoles = new Set(["SUPER_ADMIN", "TENANT_ADMIN", "AGRONOMIST", "FIELD_TECH"]);

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getPlatformSession();
  if (!session) return Response.json({ error: "Sessão necessária." }, { status: 401 });
  if (!writeRoles.has(session.role)) return Response.json({ error: "Seu perfil não pode editar safras." }, { status: 403 });
  const { id } = await context.params;

  try {
    const body = await request.json() as Record<string, unknown>;
    const seasonLabel = typeof body.seasonLabel === "string" ? body.seasonLabel.trim() : "";
    const yieldGoal = body.yieldGoal == null || body.yieldGoal === "" ? null : Number(body.yieldGoal);
    if (!seasonLabel || (yieldGoal != null && (!Number.isFinite(yieldGoal) || yieldGoal <= 0))) {
      return Response.json({ error: "Safra e meta produtiva válida são necessárias." }, { status: 400 });
    }
    const updated = await updateCropSeason({
      tenantId: session.tenantId,
      userId: session.userId,
      cropSeasonId: id,
      seasonLabel,
      currentCrop: typeof body.currentCrop === "string" ? body.currentCrop.trim() : null,
      nextCrop: typeof body.nextCrop === "string" ? body.nextCrop.trim() : null,
      yieldGoal,
      yieldGoalUnit: typeof body.yieldGoalUnit === "string" ? body.yieldGoalUnit.trim() : null,
      irrigated: body.irrigated === true,
    });
    return Response.json({ season: updated });
  } catch (error) {
    if (error instanceof CatalogError) return Response.json({ error: error.message }, { status: error.status });
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível editar a safra." }, { status: 422 });
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getPlatformSession();
  if (!session) return Response.json({ error: "Sessão necessária." }, { status: 401 });
  if (!new Set(["SUPER_ADMIN", "TENANT_ADMIN"]).has(session.role)) {
    return Response.json({ error: "Seu perfil não pode excluir safras." }, { status: 403 });
  }
  const { id } = await context.params;

  try {
    const deleted = await deleteCropSeason({ tenantId: session.tenantId, userId: session.userId, cropSeasonId: id });
    return Response.json({ season: deleted });
  } catch (error) {
    if (error instanceof CatalogError) return Response.json({ error: error.message }, { status: error.status });
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível excluir a safra." }, { status: 422 });
  }
}
