import { getPlatformSession } from "@/lib/auth/session";
import { parsePointFile } from "@/domain/field-operations";
import { FieldOperationError, importCollectionPoints } from "@/lib/repositories/collections";

const writeRoles = new Set(["SUPER_ADMIN", "TENANT_ADMIN", "AGRONOMIST", "FIELD_TECH"]);

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getPlatformSession();
  if (!session) return Response.json({ error: "Sessão necessária." }, { status: 401 });
  if (!writeRoles.has(session.role)) return Response.json({ error: "Seu perfil não pode importar pontos." }, { status: 403 });
  const { id } = await context.params;
  try {
    const body = await request.json() as { fileName?: string; content?: string; replaceExisting?: boolean };
    if (!body.fileName || typeof body.content !== "string" || !body.content.trim()) return Response.json({ error: "Arquivo de pontos não informado." }, { status: 400 });
    if (body.content.length > 2_500_000) return Response.json({ error: "Arquivo de pontos excede o limite desta versão." }, { status: 413 });
    const preview = parsePointFile(body.content, body.fileName);
    if (preview.blockers) return Response.json({ error: "Arquivo de pontos possui inconsistências.", preview }, { status: 422 });
    const result = await importCollectionPoints({
      tenantId: session.tenantId,
      userId: session.userId,
      orderId: id,
      points: preview.points,
      source: preview.format,
      replaceExisting: body.replaceExisting !== false,
    });
    return Response.json({ ...result, preview });
  } catch (error) {
    if (error instanceof FieldOperationError) return Response.json({ error: error.message, details: error.details }, { status: error.status });
    return Response.json({ error: error instanceof Error ? error.message : "Falha ao importar pontos." }, { status: 422 });
  }
}
