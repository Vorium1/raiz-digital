import { getPlatformSession } from "@/lib/auth/session";
import {
  createPlatformTenant,
  listPlatformTenants,
  PlatformAdminError,
} from "@/lib/repositories/platform-admin";

function clean(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export async function GET() {
  const session = await getPlatformSession();
  if (!session) return Response.json({ error: "Sessão necessária." }, { status: 401 });
  if (!session.isPlatformAdmin) return Response.json({ error: "Acesso restrito à administração da plataforma." }, { status: 403 });
  return Response.json({ tenants: await listPlatformTenants() });
}

export async function POST(request: Request) {
  const session = await getPlatformSession();
  if (!session) return Response.json({ error: "Sessão necessária." }, { status: 401 });
  if (!session.isPlatformAdmin) return Response.json({ error: "Acesso restrito à administração da plataforma." }, { status: 403 });

  try {
    const body = await request.json() as Record<string, unknown>;
    const legalName = clean(body.legalName);
    const tradeName = clean(body.tradeName);
    if (!legalName || !tradeName) return Response.json({ error: "Razão social e nome da empresa são obrigatórios." }, { status: 400 });

    const tenant = await createPlatformTenant({
      actorUserId: session.userId,
      legalName,
      tradeName,
      taxId: clean(body.taxId),
      timezone: clean(body.timezone),
    });
    return Response.json({ tenant }, { status: 201 });
  } catch (error) {
    if (error instanceof PlatformAdminError) return Response.json({ error: error.message }, { status: error.status });
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível criar a empresa." }, { status: 422 });
  }
}
