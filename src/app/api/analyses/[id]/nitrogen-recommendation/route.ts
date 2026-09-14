import { getPlatformSession } from "@/lib/auth/session";
import {
  calculateNitrogenRecommendation,
  getNitrogenRecommendationWorkspace,
  NitrogenRecommendationError,
  updateNitrogenRecommendationContext,
} from "@/lib/repositories/nitrogen-recommendation";
import type { NitrogenContextFields } from "@/domain/nitrogen-context";

const writeRoles = new Set(["SUPER_ADMIN", "TENANT_ADMIN", "AGRONOMIST", "FIELD_TECH"]);

function nullableString(value: unknown) {
  if (value == null || value === "") return null;
  return String(value);
}

function nullableNumber(value: unknown) {
  if (value == null || value === "") return null;
  return Number(value);
}

function nullableBoolean(value: unknown) {
  if (value == null || value === "") return null;
  if (typeof value === "boolean") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  throw new NitrogenRecommendationError("Valor booleano inválido no contexto de N.", 400);
}

function errorResponse(error: unknown, fallback: string) {
  if (error instanceof NitrogenRecommendationError) {
    return Response.json({ error: error.message, details: error.details ?? null }, { status: error.status });
  }
  return Response.json({ error: error instanceof Error ? error.message : fallback }, { status: 422 });
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getPlatformSession();
  if (!session) return Response.json({ error: "Sessão necessária." }, { status: 401 });
  const { id } = await context.params;
  try {
    const workspace = await getNitrogenRecommendationWorkspace({ tenantId: session.tenantId, userId: session.userId, analysisId: id });
    return Response.json({ workspace });
  } catch (error) {
    return errorResponse(error, "Não foi possível carregar o módulo de nitrogênio.");
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getPlatformSession();
  if (!session) return Response.json({ error: "Sessão necessária." }, { status: 401 });
  if (!writeRoles.has(session.role)) return Response.json({ error: "Seu perfil não pode editar o contexto de nitrogênio." }, { status: 403 });
  const { id } = await context.params;

  try {
    const workspace = await getNitrogenRecommendationWorkspace({ tenantId: session.tenantId, userId: session.userId, analysisId: id });
    const body = await request.json() as Record<string, unknown>;
    const patch: Partial<NitrogenContextFields> = {};

    if (Object.prototype.hasOwnProperty.call(body, "cornPrecedingClass")) patch.cornPrecedingClass = nullableString(body.cornPrecedingClass) as NitrogenContextFields["cornPrecedingClass"];
    if (Object.prototype.hasOwnProperty.call(body, "plannedPopulationPlantsPerHa")) patch.plannedPopulationPlantsPerHa = nullableNumber(body.plannedPopulationPlantsPerHa);
    if (Object.prototype.hasOwnProperty.call(body, "residueClass")) patch.residueClass = nullableString(body.residueClass) as NitrogenContextFields["residueClass"];
    if (Object.prototype.hasOwnProperty.call(body, "residueBiomassTonPerHa")) patch.residueBiomassTonPerHa = nullableNumber(body.residueBiomassTonPerHa);
    if (Object.prototype.hasOwnProperty.call(body, "wheatPrecedingCrop")) patch.wheatPrecedingCrop = nullableString(body.wheatPrecedingCrop) as NitrogenContextFields["wheatPrecedingCrop"];
    if (Object.prototype.hasOwnProperty.call(body, "lateQualityNitrogenRequested")) patch.lateQualityNitrogenRequested = nullableBoolean(body.lateQualityNitrogenRequested);
    if (Object.prototype.hasOwnProperty.call(body, "pastureType")) patch.pastureType = nullableString(body.pastureType) as NitrogenContextFields["pastureType"];
    if (Object.prototype.hasOwnProperty.call(body, "targetDryMatterTonPerHa")) patch.targetDryMatterTonPerHa = nullableNumber(body.targetDryMatterTonPerHa);
    if (Object.prototype.hasOwnProperty.call(body, "precedingLegume")) patch.precedingLegume = nullableBoolean(body.precedingLegume);
    if (Object.prototype.hasOwnProperty.call(body, "effectiveLegumeInoculation")) patch.effectiveLegumeInoculation = nullableBoolean(body.effectiveLegumeInoculation);
    if (Object.prototype.hasOwnProperty.call(body, "provenLegumeInoculationFailure")) patch.provenLegumeInoculationFailure = nullableBoolean(body.provenLegumeInoculationFailure);
    if (Object.prototype.hasOwnProperty.call(body, "numberOfUses")) patch.numberOfUses = nullableNumber(body.numberOfUses);

    await updateNitrogenRecommendationContext({
      tenantId: session.tenantId,
      userId: session.userId,
      cropSeasonId: workspace.cropSeasonId,
      patch,
    });
    const refreshed = await getNitrogenRecommendationWorkspace({ tenantId: session.tenantId, userId: session.userId, analysisId: id });
    return Response.json({ workspace: refreshed });
  } catch (error) {
    return errorResponse(error, "Não foi possível atualizar o contexto de nitrogênio.");
  }
}

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getPlatformSession();
  if (!session) return Response.json({ error: "Sessão necessária." }, { status: 401 });
  if (!writeRoles.has(session.role)) return Response.json({ error: "Seu perfil não pode executar o cálculo de nitrogênio." }, { status: 403 });
  const { id } = await context.params;

  try {
    const result = await calculateNitrogenRecommendation({ tenantId: session.tenantId, userId: session.userId, analysisId: id });
    return Response.json({ result }, { status: 201 });
  } catch (error) {
    return errorResponse(error, "Não foi possível calcular o nitrogênio.");
  }
}
