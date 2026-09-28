import { getPlatformSession } from "@/lib/auth/session";
import { listOperationalAlerts } from "@/lib/repositories/alerts";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Carregamento secundário do Talhão 360°.
 *
 * A abertura da página não espera mais a central global de alertas. Este endpoint continua tenant/RLS
 * scoped e só devolve os alertas pertencentes ao talhão solicitado.
 */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getPlatformSession();
  if (!session) return Response.json({ error: "Sessão necessária." }, { status: 401 });

  const { id: fieldId } = await context.params;
  if (!UUID_RE.test(fieldId)) return Response.json({ error: "Talhão inválido." }, { status: 400 });

  const alerts = await listOperationalAlerts(session.tenantId, session.userId);
  return Response.json({ alerts: alerts.filter((alert) => alert.fieldId === fieldId) });
}
