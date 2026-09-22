import { getPlatformSession } from "@/lib/auth/session";
import {
  AgroclimateProfileError,
  setAgroclimateProfileStatus,
} from "@/lib/repositories/agroclimate-profiles";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getPlatformSession();
  if (!session) return Response.json({ error: "Sessão necessária." }, { status: 401 });
  if (!session.isPlatformCurator) {
    return Response.json({ error: "Somente o curador da plataforma pode homologar perfis agroclimáticos." }, { status: 403 });
  }

  try {
    const { id } = await context.params;
    const body = await request.json() as Record<string, unknown>;
    const status = body.status;
    if (status !== "DRAFT" && status !== "ACTIVE" && status !== "SUPERSEDED") {
      throw new AgroclimateProfileError("Status inválido.", 400);
    }

    const profile = await setAgroclimateProfileStatus({
      tenantId: session.tenantId,
      userId: session.userId,
      profileId: id,
      status,
    });

    return Response.json({ profile });
  } catch (error) {
    if (error instanceof AgroclimateProfileError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    return Response.json({
      error: error instanceof Error ? error.message : "Não foi possível atualizar o perfil agroclimático.",
    }, { status: 422 });
  }
}
