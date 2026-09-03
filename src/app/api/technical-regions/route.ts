import { getPlatformSession } from "@/lib/auth/session";
import { AgronomicProfileError, createTechnicalRegion, listTechnicalRegions } from "@/lib/repositories/agronomic-profiles";

export async function GET() {
  const session = await getPlatformSession();
  if (!session) return Response.json({ error: "Sessão necessária." }, { status: 401 });
  const technicalRegions = await listTechnicalRegions(session.tenantId, session.userId);
  return Response.json({ technicalRegions });
}

export async function POST(request: Request) {
  const session = await getPlatformSession();
  if (!session) return Response.json({ error: "Sessão necessária." }, { status: 401 });
  if (!session.isPlatformCurator) return Response.json({ error: "Somente um curador da plataforma pode cadastrar regiões técnicas." }, { status: 403 });

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const code = typeof body.code === "string" ? body.code.trim() : "";
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!code || !name) return Response.json({ error: "Código e nome da região são necessários." }, { status: 400 });
    const technicalRegion = await createTechnicalRegion({ tenantId: session.tenantId, userId: session.userId, code, name, description: typeof body.description === "string" ? body.description : null });
    return Response.json({ technicalRegion }, { status: 201 });
  } catch (error) {
    if (error instanceof AgronomicProfileError) return Response.json({ error: error.message }, { status: error.status });
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível cadastrar a região técnica." }, { status: 422 });
  }
}
