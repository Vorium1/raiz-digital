import { getPlatformSession } from "@/lib/auth/session";
import { listRuleSets } from "@/lib/repositories/agronomic-profiles";

export async function GET() {
  const session = await getPlatformSession();
  if (!session) return Response.json({ error: "Sessão necessária." }, { status: 401 });
  const ruleSets = await listRuleSets(session.tenantId, session.userId);
  return Response.json({ ruleSets });
}
