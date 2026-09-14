import { getPlatformSession } from "@/lib/auth/session";
import {
  getRecommendationContext,
  RecommendationContextError,
  updateRecommendationContext,
} from "@/lib/repositories/recommendation-context";

const writeRoles = new Set(["SUPER_ADMIN", "TENANT_ADMIN", "AGRONOMIST", "FIELD_TECH"]);

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getPlatformSession();
  if (!session) return Response.json({ error: "Sessão necessária." }, { status: 401 });
  const { id } = await context.params;

  try {
    const recommendationContext = await getRecommendationContext({
      tenantId: session.tenantId,
      userId: session.userId,
      cropSeasonId: id,
    });
    return Response.json({ recommendationContext });
  } catch (error) {
    if (error instanceof RecommendationContextError) return Response.json({ error: error.message }, { status: error.status });
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível carregar o contexto de recomendação." }, { status: 422 });
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getPlatformSession();
  if (!session) return Response.json({ error: "Sessão necessária." }, { status: 401 });
  if (!writeRoles.has(session.role)) return Response.json({ error: "Seu perfil não pode editar o contexto agronômico da safra." }, { status: 403 });
  const { id } = await context.params;

  try {
    const body = await request.json() as Record<string, unknown>;
    const patch: {
      tenantId: string;
      userId: string;
      cropSeasonId: string;
      yieldGoal?: number | null;
      yieldGoalUnit?: string | null;
      cultivationOrderAfterSoilAnalysis?: number | null;
    } = {
      tenantId: session.tenantId,
      userId: session.userId,
      cropSeasonId: id,
    };

    if (Object.prototype.hasOwnProperty.call(body, "yieldGoal")) {
      patch.yieldGoal = body.yieldGoal == null || body.yieldGoal === "" ? null : Number(body.yieldGoal);
    }
    if (Object.prototype.hasOwnProperty.call(body, "yieldGoalUnit")) {
      patch.yieldGoalUnit = body.yieldGoalUnit == null ? null : String(body.yieldGoalUnit);
    }
    if (Object.prototype.hasOwnProperty.call(body, "cultivationOrderAfterSoilAnalysis")) {
      patch.cultivationOrderAfterSoilAnalysis = body.cultivationOrderAfterSoilAnalysis == null || body.cultivationOrderAfterSoilAnalysis === ""
        ? null
        : Number(body.cultivationOrderAfterSoilAnalysis);
    }

    const recommendationContext = await updateRecommendationContext(patch);
    return Response.json({ recommendationContext });
  } catch (error) {
    if (error instanceof RecommendationContextError) return Response.json({ error: error.message }, { status: error.status });
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível atualizar o contexto de recomendação." }, { status: 422 });
  }
}
