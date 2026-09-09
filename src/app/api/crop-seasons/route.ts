import { getPlatformSession } from "@/lib/auth/session";
import { createCropSeason } from "@/lib/repositories/catalog";

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

export async function POST(request: Request) {
  const session = await getPlatformSession();
  if (!session) return Response.json({ error: "Sessão necessária." }, { status: 401 });
  if (!new Set(["SUPER_ADMIN","TENANT_ADMIN","AGRONOMIST","FIELD_TECH"]).has(session.role)) return Response.json({ error: "Perfil sem permissão." }, { status: 403 });
  const body = await request.json() as Record<string, unknown>;
  const fieldId = typeof body.fieldId === "string" ? body.fieldId : "";
  const seasonLabel = typeof body.seasonLabel === "string" ? body.seasonLabel.trim() : "";
  const yieldGoal = body.yieldGoal == null || body.yieldGoal === "" ? null : Number(body.yieldGoal);
  if (!fieldId || !seasonLabel || (yieldGoal != null && (!Number.isFinite(yieldGoal) || yieldGoal <= 0))) return Response.json({ error: "Talhão, safra e meta produtiva válida são necessários." }, { status: 400 });
  const technologyLevel = typeof body.technologyLevel === "string" && TECHNOLOGY_LEVELS.has(body.technologyLevel) ? body.technologyLevel : null;
  const soilCompactionLevel = typeof body.soilCompactionLevel === "string" && COMPACTION_LEVELS.has(body.soilCompactionLevel) ? body.soilCompactionLevel : null;
  const season = await createCropSeason({
    tenantId: session.tenantId,
    userId: session.userId,
    fieldId,
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
  return Response.json({ season }, { status: 201 });
}
