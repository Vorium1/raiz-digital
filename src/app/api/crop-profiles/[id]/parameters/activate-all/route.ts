import { getPlatformSession } from "@/lib/auth/session";
import { activateAllCropProfileParameters } from "@/lib/repositories/agronomic-profiles";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getPlatformSession();
  if (!session) return Response.json({ error: "Sessão necessária." }, { status: 401 });
  if (!session.isPlatformCurator) return Response.json({ error: "Somente um curador da plataforma pode homologar parâmetros técnicos." }, { status: 403 });
  const { id } = await context.params;

  const activated = await activateAllCropProfileParameters({ tenantId: session.tenantId, userId: session.userId, cropProfileId: id });
  return Response.json({ activated });
}
