import { getPlatformSession } from "@/lib/auth/session";
import { archiveClient, ClientError, getClient360, updateClient } from "@/lib/repositories/clients";
import { validateClientDocument, type ClientPersonType } from "@/domain/client-document";

const writeRoles = new Set(["SUPER_ADMIN", "TENANT_ADMIN", "AGRONOMIST", "COMMERCIAL"]);

function cleanOptional(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getPlatformSession();
  if (!session) return Response.json({ error: "Sessão necessária." }, { status: 401 });
  const { id } = await context.params;
  try {
    return Response.json(await getClient360(session.tenantId, id, session.userId));
  } catch (error) {
    if (error instanceof ClientError) return Response.json({ error: error.message }, { status: error.status });
    return Response.json({ error: "Não foi possível carregar o cliente." }, { status: 422 });
  }
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
    const personType = body.personType === "PJ" ? "PJ" : body.personType === "PF" ? "PF" : null;
    if (!personType) return Response.json({ error: "Informe se o cliente é pessoa física ou jurídica." }, { status: 400 });
    const document = validateClientDocument(personType as ClientPersonType, cleanOptional(body.taxId));
    if (document.error) return Response.json({ error: document.error }, { status: 400 });
    if (email && !/^\S+@\S+\.\S+$/.test(email)) {
      return Response.json({ error: "E-mail inválido." }, { status: 400 });
    }

    const updated = await updateClient({
      tenantId: session.tenantId,
      userId: session.userId,
      clientId: id,
      name,
      taxId: cleanOptional(body.taxId),
      documentNormalized: document.normalized,
      personType,
      tradeName: cleanOptional(body.tradeName),
      contactName: cleanOptional(body.contactName),
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
    const archived = await archiveClient({ tenantId: session.tenantId, userId: session.userId, clientId: id });
    return Response.json({ client: archived });
  } catch (error) {
    if (error instanceof ClientError) return Response.json({ error: error.message }, { status: error.status });
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível excluir o cliente." }, { status: 422 });
  }
}
