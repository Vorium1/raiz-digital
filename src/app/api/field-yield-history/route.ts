import { getPlatformSession } from "@/lib/auth/session";
import { CatalogError, createFieldYieldHistory, listFieldYieldHistory } from "@/lib/repositories/catalog";

const writeRoles = new Set(["SUPER_ADMIN", "TENANT_ADMIN", "AGRONOMIST", "FIELD_TECH"]);

export async function GET(request: Request) {
  const session = await getPlatformSession();
  if (!session) return Response.json({ error: "Sessão necessária." }, { status: 401 });
  const fieldId = new URL(request.url).searchParams.get("fieldId") ?? "";
  if (!fieldId) return Response.json({ error: "Informe o talhão." }, { status: 400 });
  const entries = await listFieldYieldHistory(session.tenantId, fieldId, session.userId);
  return Response.json({ entries });
}

export async function POST(request: Request) {
  const session = await getPlatformSession();
  if (!session) return Response.json({ error: "Sessão necessária." }, { status: 401 });
  if (!writeRoles.has(session.role)) return Response.json({ error: "Perfil sem permissão." }, { status: 403 });
  const body = await request.json() as Record<string, unknown>;
  const fieldId = typeof body.fieldId === "string" ? body.fieldId : "";
  const seasonLabel = typeof body.seasonLabel === "string" ? body.seasonLabel.trim() : "";
  const crop = typeof body.crop === "string" ? body.crop.trim() : "";
  const yieldValue = Number(body.yieldValue);
  const yieldUnit = typeof body.yieldUnit === "string" ? body.yieldUnit.trim() : "";
  if (!fieldId || !seasonLabel || !crop || !yieldUnit || !Number.isFinite(yieldValue) || yieldValue <= 0) {
    return Response.json({ error: "Talhão, safra, cultura, unidade e produtividade válida são necessários." }, { status: 400 });
  }
  try {
    const entry = await createFieldYieldHistory({
      tenantId: session.tenantId,
      userId: session.userId,
      fieldId,
      seasonLabel,
      crop,
      cultivar: typeof body.cultivar === "string" ? body.cultivar.trim() : null,
      yieldValue,
      yieldUnit,
      source: typeof body.source === "string" ? body.source.trim() : null,
    });
    return Response.json({ entry }, { status: 201 });
  } catch (error) {
    if (error instanceof CatalogError) return Response.json({ error: error.message }, { status: error.status });
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível registrar a produtividade." }, { status: 422 });
  }
}
