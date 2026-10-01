import { getPlatformSession } from "@/lib/auth/session";
import { getFieldTimeline } from "@/lib/repositories/field-timeline";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const headers = { "cache-control": "private, no-store" };
  const session = await getPlatformSession();
  if (!session) return Response.json({ error: "Sessão necessária." }, { status: 401, headers });
  const { id } = await context.params;
  const timeline = await getFieldTimeline(session.tenantId, id, session.userId);
  if (!timeline) return Response.json({ error: "Talhão não encontrado." }, { status: 404, headers });
  return Response.json(timeline, { headers });
}
