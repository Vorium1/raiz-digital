import { getPlatformSession } from "@/lib/auth/session";
import { AgronomicProfileError, crossValidateCropProfileParameter } from "@/lib/repositories/agronomic-profiles";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getPlatformSession();
  if (!session) return Response.json({ error: "Sessão necessária." }, { status: 401 });
  if (!session.isPlatformCurator) return Response.json({ error: "Somente um curador da plataforma pode cruzar um parâmetro com a IA." }, { status: 403 });
  const { id } = await context.params;

  try {
    const parameter = await crossValidateCropProfileParameter({ tenantId: session.tenantId, userId: session.userId, parameterId: id });
    return Response.json({ parameter });
  } catch (error) {
    if (error instanceof AgronomicProfileError) return Response.json({ error: error.message }, { status: error.status });
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível cruzar o parâmetro com a IA." }, { status: 422 });
  }
}
