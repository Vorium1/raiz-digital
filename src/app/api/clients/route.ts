import { getPlatformSession } from "@/lib/auth/session";
import { createClient, listClients } from "@/lib/repositories/clients";

function cleanOptional(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export async function GET() {
  const session = await getPlatformSession();
  if (!session) return Response.json({ error: "Sessão necessária." }, { status: 401 });
  const clients = await listClients(session.tenantId, session.userId);
  return Response.json({ clients });
}

export async function POST(request: Request) {
  const session = await getPlatformSession();
  if (!session) return Response.json({ error: "Sessão necessária." }, { status: 401 });
  if (!new Set(["SUPER_ADMIN", "TENANT_ADMIN", "AGRONOMIST", "COMMERCIAL"]).has(session.role)) {
    return Response.json({ error: "Seu perfil não pode cadastrar clientes." }, { status: 403 });
  }

  const body = await request.json() as Record<string, unknown>;
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (name.length < 2 || name.length > 160) {
    return Response.json({ error: "Informe um nome válido para o cliente." }, { status: 400 });
  }

  const email = cleanOptional(body.email);
  if (email && !/^\S+@\S+\.\S+$/.test(email)) {
    return Response.json({ error: "E-mail inválido." }, { status: 400 });
  }

  const created = await createClient({
    tenantId: session.tenantId,
    userId: session.userId,
    name,
    taxId: cleanOptional(body.taxId),
    email,
    phone: cleanOptional(body.phone),
    notes: cleanOptional(body.notes),
  });

  return Response.json({ client: created }, { status: 201 });
}
