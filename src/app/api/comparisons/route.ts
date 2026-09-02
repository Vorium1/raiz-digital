import { getPlatformSession } from "@/lib/auth/session";
import { compareFields, compareSeasons, comparePoints, compareProperties } from "@/lib/repositories/comparisons";

export async function GET(request: Request) {
  const session = await getPlatformSession();
  if (!session) return Response.json({ error: "Sessão necessária." }, { status: 401 });
  const url = new URL(request.url);
  const mode = url.searchParams.get("mode");
  const a = url.searchParams.get("a");
  const b = url.searchParams.get("b");
  if (!a || !b) return Response.json({ error: "Selecione os dois itens para comparar." }, { status: 400 });

  try {
    if (mode === "fields") return Response.json(await compareFields(session.tenantId, a, b, session.userId));
    if (mode === "seasons") return Response.json(await compareSeasons(session.tenantId, a, b, session.userId));
    if (mode === "points") return Response.json(await comparePoints(session.tenantId, a, b, session.userId));
    if (mode === "properties") return Response.json(await compareProperties(session.tenantId, a, b, session.userId));
    return Response.json({ error: "Modo de comparação inválido." }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Falha ao comparar." }, { status: 422 });
  }
}
