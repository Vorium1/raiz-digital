import { getPlatformSession } from "@/lib/auth/session";
import { getTenantBranding, updateTenantBranding } from "@/lib/repositories/tenant-branding";

const manageRoles = new Set(["SUPER_ADMIN", "TENANT_ADMIN"]);

export async function GET() {
  const session = await getPlatformSession();
  if (!session) return Response.json({ error: "Sessão necessária." }, { status: 401 });
  const branding = await getTenantBranding(session.tenantId);
  return Response.json({ branding });
}

export async function PATCH(request: Request) {
  const session = await getPlatformSession();
  if (!session) return Response.json({ error: "Sessão necessária." }, { status: 401 });
  if (!manageRoles.has(session.role)) return Response.json({ error: "Seu perfil não pode alterar a marca dos relatórios." }, { status: 403 });

  try {
    const body = await request.json() as Record<string, unknown>;
    const input: { logoDataUrl?: string | null; responsibleName?: string | null; responsibleRegistration?: string | null } = {};
    if ("logoDataUrl" in body) input.logoDataUrl = typeof body.logoDataUrl === "string" && body.logoDataUrl ? body.logoDataUrl : null;
    if ("responsibleName" in body) input.responsibleName = typeof body.responsibleName === "string" && body.responsibleName.trim() ? body.responsibleName.trim() : null;
    if ("responsibleRegistration" in body) input.responsibleRegistration = typeof body.responsibleRegistration === "string" && body.responsibleRegistration.trim() ? body.responsibleRegistration.trim() : null;

    const branding = await updateTenantBranding(session.tenantId, input);
    return Response.json({ branding });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível salvar." }, { status: 422 });
  }
}
