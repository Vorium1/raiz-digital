import { getPlatformSession } from "@/lib/auth/session";
import { getFieldMapLayer } from "@/lib/repositories/map-data";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getPlatformSession();
  if (!session) return Response.json({ error: "Sessão necessária." }, { status: 401 });
  const { id } = await context.params;
  const url = new URL(request.url);
  const parameterCode = url.searchParams.get("parameter");

  const layer = await getFieldMapLayer({ tenantId: session.tenantId, userId: session.userId, collectionOrderId: id, parameterCode });
  if (!layer) return Response.json({ error: "Ordem de coleta não encontrada." }, { status: 404 });
  return Response.json(layer);
}
