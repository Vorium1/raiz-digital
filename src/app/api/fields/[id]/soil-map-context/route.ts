import { getPlatformSession } from "@/lib/auth/session";
import { getLatestFieldSoilMapContext } from "@/lib/repositories/map-data";

/**
 * Contexto mínimo para o cruzamento visual Solo × Satélite. Retorna apenas uma ordem real do próprio
 * talhão/tenant que possua resultado laboratorial; a camada detalhada continua vindo do endpoint
 * autenticado de `map-layer`.
 */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getPlatformSession();
  if (!session) return Response.json({ error: "Sessão necessária." }, { status: 401 });
  const { id: fieldId } = await context.params;

  const soilContext = await getLatestFieldSoilMapContext({
    tenantId: session.tenantId,
    userId: session.userId,
    fieldId,
  });

  return Response.json({ context: soilContext });
}
