import { getPlatformSession } from "@/lib/auth/session";
import { createLaboratory, listAgronomicContext } from "@/lib/repositories/catalog";

export async function GET() {
  const session = await getPlatformSession();
  if (!session) return Response.json({ error: "Sessão necessária." }, { status: 401 });
  const context = await listAgronomicContext(session.tenantId, session.userId);
  return Response.json({ laboratories: context.laboratories });
}

export async function POST(request: Request) {
  const session = await getPlatformSession();
  if (!session) return Response.json({ error: "Sessão necessária." }, { status: 401 });
  if (!new Set(["SUPER_ADMIN", "TENANT_ADMIN", "AGRONOMIST"]).has(session.role)) {
    return Response.json({ error: "Seu perfil não pode cadastrar laboratórios." }, { status: 403 });
  }

  const body = await request.json() as Record<string, unknown>;
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const taxId = typeof body.taxId === "string" ? body.taxId.trim() : "";
  if (!name) return Response.json({ error: "Nome do laboratório é obrigatório." }, { status: 400 });

  const laboratory = await createLaboratory({ tenantId: session.tenantId, userId: session.userId, name, taxId });
  return Response.json({ laboratory }, { status: 201 });
}
