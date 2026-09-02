import { getPlatformSession } from "@/lib/auth/session";
import { getCropProfile } from "@/lib/repositories/agronomic-profiles";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getPlatformSession();
  if (!session) return Response.json({ error: "Sessão necessária." }, { status: 401 });
  const { id } = await context.params;
  const cropProfile = await getCropProfile(session.tenantId, id, session.userId);
  if (!cropProfile) return Response.json({ error: "Perfil de cultura não encontrado." }, { status: 404 });
  return Response.json({ cropProfile });
}
