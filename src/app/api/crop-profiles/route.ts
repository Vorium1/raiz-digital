import { getPlatformSession } from "@/lib/auth/session";
import { AgronomicProfileError, createCropProfile, listCropProfiles } from "@/lib/repositories/agronomic-profiles";

const homologationRoles = new Set(["SUPER_ADMIN", "TENANT_ADMIN", "AGRONOMIST"]);

export async function GET() {
  const session = await getPlatformSession();
  if (!session) return Response.json({ error: "Sessão necessária." }, { status: 401 });
  const cropProfiles = await listCropProfiles(session.tenantId, session.userId);
  return Response.json({ cropProfiles });
}

export async function POST(request: Request) {
  const session = await getPlatformSession();
  if (!session) return Response.json({ error: "Sessão necessária." }, { status: 401 });
  if (!homologationRoles.has(session.role)) return Response.json({ error: "Seu perfil não pode cadastrar culturas." }, { status: 403 });

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const code = typeof body.code === "string" ? body.code.trim() : "";
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!code || !name) return Response.json({ error: "Código e nome da cultura são necessários." }, { status: 400 });
    const cropProfile = await createCropProfile({
      tenantId: session.tenantId,
      userId: session.userId,
      code,
      name,
      cropGroup: typeof body.cropGroup === "string" ? body.cropGroup : null,
      applicableRegions: Array.isArray(body.applicableRegions) ? (body.applicableRegions as string[]) : [],
      applicableSystems: Array.isArray(body.applicableSystems) ? (body.applicableSystems as string[]) : [],
      technicalNotes: typeof body.technicalNotes === "string" ? body.technicalNotes : null,
    });
    return Response.json({ cropProfile }, { status: 201 });
  } catch (error) {
    if (error instanceof AgronomicProfileError) return Response.json({ error: error.message }, { status: error.status });
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível cadastrar a cultura." }, { status: 422 });
  }
}
