import { getPlatformSession } from "@/lib/auth/session";
import { CatalogError, createInputApplication, listInputApplications } from "@/lib/repositories/catalog";

const writeRoles = new Set(["SUPER_ADMIN", "TENANT_ADMIN", "AGRONOMIST", "FIELD_TECH"]);

export async function GET(request: Request) {
  const session = await getPlatformSession();
  if (!session) return Response.json({ error: "Sessão necessária." }, { status: 401 });
  const analysisId = new URL(request.url).searchParams.get("analysisId") ?? "";
  if (!analysisId) return Response.json({ error: "Informe a análise." }, { status: 400 });
  const applications = await listInputApplications(session.tenantId, analysisId, session.userId);
  return Response.json({ applications });
}

export async function POST(request: Request) {
  const session = await getPlatformSession();
  if (!session) return Response.json({ error: "Sessão necessária." }, { status: 401 });
  if (!writeRoles.has(session.role)) return Response.json({ error: "Perfil sem permissão." }, { status: 403 });
  const body = await request.json() as Record<string, unknown>;
  const analysisId = typeof body.analysisId === "string" ? body.analysisId : "";
  const inputType = typeof body.inputType === "string" ? body.inputType.trim() : "";
  const unit = typeof body.unit === "string" ? body.unit.trim() : "";
  const quantity = Number(body.quantity);
  if (!analysisId || !inputType || !unit || !Number.isFinite(quantity) || quantity <= 0) {
    return Response.json({ error: "Análise, insumo, unidade e quantidade válida são necessários." }, { status: 400 });
  }
  try {
    const application = await createInputApplication({
      tenantId: session.tenantId,
      userId: session.userId,
      analysisId,
      inputType,
      quantity,
      unit,
      appliedAt: typeof body.appliedAt === "string" ? body.appliedAt : null,
      notes: typeof body.notes === "string" ? body.notes.trim() : null,
    });
    return Response.json({ application }, { status: 201 });
  } catch (error) {
    if (error instanceof CatalogError) return Response.json({ error: error.message }, { status: error.status });
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível registrar a aplicação." }, { status: 422 });
  }
}
