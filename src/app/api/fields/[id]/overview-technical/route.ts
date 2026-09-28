import { getPlatformSession } from "@/lib/auth/session";
import { getFieldOverviewTechnicalDetails } from "@/lib/repositories/field-overview";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getPlatformSession();
  if (!session) return Response.json({ error: "Sessão necessária." }, { status: 401 });

  const { id: fieldId } = await context.params;
  const details = await getFieldOverviewTechnicalDetails(session.tenantId, fieldId, session.userId);
  if (!details) return Response.json({ error: "Talhão não encontrado." }, { status: 404 });

  return Response.json(details, {
    headers: { "cache-control": "private, no-store" },
  });
}
