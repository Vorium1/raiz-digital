import { getPlatformSession } from "@/lib/auth/session";
import { listFieldHistoricalComparisonCandidates } from "@/lib/repositories/comparisons";

export async function GET(request: Request) {
  const session = await getPlatformSession();
  if (!session) return Response.json({ error: "Sessão necessária." }, { status: 401 });

  const fieldId = new URL(request.url).searchParams.get("fieldId");
  if (!fieldId) return Response.json({ error: "Talhão é obrigatório." }, { status: 400 });

  const result = await listFieldHistoricalComparisonCandidates(
    session.tenantId,
    fieldId,
    session.userId,
  );
  if (!result.field) return Response.json({ error: "Talhão não encontrado." }, { status: 404 });
  return Response.json(result);
}
