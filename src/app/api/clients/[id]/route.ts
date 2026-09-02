import { getPlatformSession } from "@/lib/auth/session";
import { ClientError, deleteClient, updateClient } from "@/lib/repositories/clients";

const writeRoles = new Set(["SUPER_ADMIN", "TENANT_ADMIN", "AGRONOMIST", "COMMERCIAL"]);

function cleanOptional(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getPlatformSession();
  if (!session) return Response.json({ error: "Sessão necessária." }, { status: 401 });
  if (!writeRoles.has(session.role)) return Response.json({ error: "Seu perfil não pode editar clientes." }, { status: 403 });
  const { id } = await context.params;

  try {
    const body = await request.json() as Record<string, unknown>;
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (name.length < 2 || name.length > 160) {
      return Response.json({ error: "Informe um nome válido para o cliente." }, { status: 400 });
    }
    const email = cleanOptional(body.email);
    if (email && !/^\S+@\S+\.\S+$/.test(email)) {
      return Response.json({ error: "E-mail inválido." }, { status: 400 });
    }

    const updated = await updateClient({
      tenantId: session.tenantId,
      userId: session.userId,
      clientId: id,
      name,
      taxId: cleanOptional(body.taxId),
      email,
      phone: cleanOptional(body.phone),
      notes: cleanOptional(body.notes),
    });
    return Response.json({ client: updated });
  } catch (error) {
    if (error instanceof ClientError) return Response.json({ error: error.message }, { status: error.status });
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível editar o cliente." }, { status: 422 });
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getPlatformSession();
  if (!session) return Response.json({ error: "Sessão necessária." }, { status: 401 });
  if (!new Set(["SUPER_ADMIN", "TENANT_ADMIN"]).has(session.role)) {
    return Response.json({ error: "Seu perfil não pode excluir clientes." }, { status: 403 });
  }
  const { id } = await context.params;

  try {
    const deleted = await deleteClient({ tenantId: session.tenantId, userId: session.userId, clientId: id });
    return Response.json({ client: deleted });
  } catch (error) {
    if (error instanceof ClientError) return Response.json({ error: error.message }, { status: error.status });
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível excluir o cliente." }, { status: 422 });
  }
}
