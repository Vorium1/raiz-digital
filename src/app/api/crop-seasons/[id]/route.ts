import { getPlatformSession } from "@/lib/auth/session";
import { CatalogError, deleteCropSeason, updateCropSeason } from "@/lib/repositories/catalog";

const writeRoles = new Set(["SUPER_ADMIN", "TENANT_ADMIN", "AGRONOMIST", "FIELD_TECH"]);
const TECHNOLOGY_LEVELS = new Set(["BAIXO", "MEDIO", "ALTO"]);
const COMPACTION_LEVELS = new Set(["NENHUM", "BAIXO", "MEDIO", "ALTO"]);

function parseNonNegativeNumber(value: unknown): number | null {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function parseCultivationYears(value: unknown): number | null {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

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
    const technologyLevel = typeof body.technologyLevel === "string" && TECHNOLOGY_LEVELS.has(body.technologyLevel) ? body.technologyLevel : null;
    const soilCompactionLevel = typeof body.soilCompactionLevel === "string" && COMPACTION_LEVELS.has(body.soilCompactionLevel) ? body.soilCompactionLevel : null;
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
      cropProfileId: typeof body.cropProfileId === "string" && body.cropProfileId ? body.cropProfileId : null,
      cultivar: typeof body.cultivar === "string" ? body.cultivar.trim() : null,
      managementSystem: typeof body.managementSystem === "string" ? body.managementSystem.trim() : null,
      soilType: typeof body.soilType === "string" ? body.soilType.trim() : null,
      soilTexture: typeof body.soilTexture === "string" ? body.soilTexture.trim() : null,
      technicalRegionCode: typeof body.technicalRegionCode === "string" ? body.technicalRegionCode.trim() : null,
      nextCultivar: typeof body.nextCultivar === "string" ? body.nextCultivar.trim() : null,
      technologyLevel,
      soilCompactionLevel,
      livestockTrampleAreaHa: parseNonNegativeNumber(body.livestockTrampleAreaHa),
      headlandAreaHa: parseNonNegativeNumber(body.headlandAreaHa),
      isFirstYearArea: typeof body.isFirstYearArea === "boolean" ? body.isFirstYearArea : null,
      cultivationYears: parseCultivationYears(body.cultivationYears),
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
