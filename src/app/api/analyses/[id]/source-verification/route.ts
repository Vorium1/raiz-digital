import { getPlatformSession } from "@/lib/auth/session";
import { confirmAnalysisImportSource, getAnalysisSourceVerificationStatus, SourceVerificationError } from "@/lib/repositories/source-verification";

const VERIFY_ROLES = new Set(["SUPER_ADMIN", "TENANT_ADMIN", "AGRONOMIST"]);

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getPlatformSession();
  if (!session) return Response.json({ error: "Sessão necessária." }, { status: 401 });
  const { id } = await context.params;
  try {
    const status = await getAnalysisSourceVerificationStatus({
      tenantId: session.tenantId,
      userId: session.userId,
      analysisId: id,
    });
    return Response.json({ ...status, canVerify: VERIFY_ROLES.has(session.role) });
  } catch (error) {
    if (error instanceof SourceVerificationError) return Response.json({ error: error.message }, { status: error.status });
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível consultar a proveniência do laudo." }, { status: 422 });
  }
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getPlatformSession();
  if (!session) return Response.json({ error: "Sessão necessária." }, { status: 401 });
  if (!VERIFY_ROLES.has(session.role)) {
    return Response.json({ error: "Somente um responsável técnico autorizado pode confirmar o arquivo original do laudo." }, { status: 403 });
  }
  const { id } = await context.params;
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const importId = typeof body.importId === "string" ? body.importId : "";
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(importId)) {
      return Response.json({ error: "Importação inválida." }, { status: 400 });
    }
    const result = await confirmAnalysisImportSource({
      tenantId: session.tenantId,
      userId: session.userId,
      analysisId: id,
      importId,
    });
    return Response.json({ verification: result });
  } catch (error) {
    if (error instanceof SourceVerificationError) return Response.json({ error: error.message }, { status: error.status });
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível confirmar o arquivo original." }, { status: 422 });
  }
}
