import { getPlatformSession } from "@/lib/auth/session";
import { listAgronomicContext } from "@/lib/repositories/catalog";

export async function GET() {
  const session = await getPlatformSession();
  if (!session) return Response.json({ error: "Sessão necessária." }, { status: 401 });
  return Response.json(await listAgronomicContext(session.tenantId, session.userId));
}
