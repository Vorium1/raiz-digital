import { getPlatformSession } from "@/lib/auth/session";
import { ClientError, createClient, listClients } from "@/lib/repositories/clients";
import { validateClientDocument, type ClientPersonType } from "@/domain/client-document";

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

  try {
    const body = await request.json() as Record<string, unknown>;
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return Response.json({ error: "Informe um cadastro válido." }, { status: 400 });
    }
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
    const postalCode = cleanOptional(body.postalCode)?.replace(/\D/g, "") ?? null;
    if (postalCode && !/^\d{8}$/.test(postalCode)) {
      return Response.json({ error: "CEP deve conter 8 dígitos." }, { status: 400 });
    }
    const state = cleanOptional(body.state)?.toUpperCase() ?? null;
    if (state && !/^[A-Z]{2}$/.test(state)) {
      return Response.json({ error: "UF deve conter 2 letras." }, { status: 400 });
    }

    const country = cleanOptional(body.country)?.toUpperCase() ?? "BR";
    if (!/^[A-Z]{2}$/.test(country)) {
      return Response.json({ error: "País deve conter 2 letras." }, { status: 400 });
    }

    const created = await createClient({
      tenantId: session.tenantId,
      userId: session.userId,
      name,
      taxId: cleanOptional(body.taxId),
      documentNormalized: document.normalized,
      personType,
      tradeName: cleanOptional(body.tradeName),
      contactName: cleanOptional(body.contactName),
      email,
      phone: cleanOptional(body.phone),
      whatsapp: cleanOptional(body.whatsapp),
      postalCode,
      street: cleanOptional(body.street),
      addressNumber: cleanOptional(body.addressNumber),
      addressComplement: cleanOptional(body.addressComplement),
      district: cleanOptional(body.district),
      municipality: cleanOptional(body.municipality),
      state,
      country,
      notes: cleanOptional(body.notes),
    });

    return Response.json({ client: created }, { status: 201 });
  } catch (error) {
    if (error instanceof ClientError) return Response.json({ error: error.message }, { status: error.status });
    if (error instanceof SyntaxError) return Response.json({ error: "Informe um cadastro válido." }, { status: 400 });
    return Response.json({ error: "Não foi possível cadastrar o cliente." }, { status: 422 });
  }
}
