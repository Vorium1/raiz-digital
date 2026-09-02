import { getPlatformSession } from "@/lib/auth/session";
import { createCropSeason } from "@/lib/repositories/catalog";

export async function POST(request: Request) {
  const session = await getPlatformSession();
  if (!session) return Response.json({ error: "Sessão necessária." }, { status: 401 });
  if (!new Set(["SUPER_ADMIN","TENANT_ADMIN","AGRONOMIST","FIELD_TECH"]).has(session.role)) return Response.json({ error: "Perfil sem permissão." }, { status: 403 });
  const body = await request.json() as Record<string, unknown>;
  const fieldId = typeof body.fieldId === "string" ? body.fieldId : "";
  const seasonLabel = typeof body.seasonLabel === "string" ? body.seasonLabel.trim() : "";
  const yieldGoal = body.yieldGoal == null || body.yieldGoal === "" ? null : Number(body.yieldGoal);
  if (!fieldId || !seasonLabel || (yieldGoal != null && (!Number.isFinite(yieldGoal) || yieldGoal <= 0))) return Response.json({ error: "Talhão, safra e meta produtiva válida são necessários." }, { status: 400 });
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
  });
  return Response.json({ season }, { status: 201 });
}
