import { getPlatformSession } from "@/lib/auth/session";
import { getFieldYieldOutlook } from "@/lib/repositories/yield-outlook";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getPlatformSession();
  if (!session) return Response.json({ error: "Sessão necessária." }, { status: 401 });
  const { id: fieldId } = await context.params;
  const outlook = await getFieldYieldOutlook({ tenantId: session.tenantId, userId: session.userId, fieldId });
  if (!outlook) return Response.json({ error: "Talhão não encontrado." }, { status: 404 });
  return Response.json({ outlook });
}
