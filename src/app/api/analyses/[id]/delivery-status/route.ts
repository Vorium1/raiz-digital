import { getPlatformSession } from "@/lib/auth/session";
import { getDecisionDeliveryStatuses } from "@/lib/repositories/decision-delivery-status";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getPlatformSession();
  if (!session) return Response.json({ error: "Sessão necessária." }, { status: 401 });

  const { id } = await context.params;
  const rows = await getDecisionDeliveryStatuses(session.tenantId, [id], session.userId);
  return Response.json({ delivery: rows[0] ?? null });
}
