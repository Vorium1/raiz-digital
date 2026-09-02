import { getPlatformSession } from "@/lib/auth/session";
import { listAuditEvents } from "@/lib/repositories/audit";

export async function GET() {
  const session = await getPlatformSession();
  if (!session) return Response.json({ error: "Sessão necessária." }, { status: 401 });
  const events = await listAuditEvents(session.tenantId, session.userId, 10);
  return Response.json({ events });
}
