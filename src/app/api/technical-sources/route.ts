import { getPlatformSession } from "@/lib/auth/session";
import { AgronomicProfileError, createTechnicalSource, listTechnicalSources } from "@/lib/repositories/agronomic-profiles";

export async function GET() {
  const session = await getPlatformSession();
  if (!session) return Response.json({ error: "Sessão necessária." }, { status: 401 });
  const technicalSources = await listTechnicalSources(session.tenantId, session.userId);
  return Response.json({ technicalSources });
}

export async function POST(request: Request) {
  const session = await getPlatformSession();
  if (!session) return Response.json({ error: "Sessão necessária." }, { status: 401 });
  if (!session.isPlatformCurator) return Response.json({ error: "Somente um curador da plataforma pode cadastrar fontes técnicas." }, { status: 403 });

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const title = typeof body.title === "string" ? body.title.trim() : "";
    if (!title) return Response.json({ error: "Título é obrigatório." }, { status: 400 });
    const technicalSource = await createTechnicalSource({
      tenantId: session.tenantId,
      userId: session.userId,
      title,
      institution: typeof body.institution === "string" ? body.institution : null,
      editionYear: typeof body.editionYear === "number" ? body.editionYear : null,
      cropProfileId: typeof body.cropProfileId === "string" && body.cropProfileId ? body.cropProfileId : null,
      regionCode: typeof body.regionCode === "string" ? body.regionCode : null,
      analyticalMethod: typeof body.analyticalMethod === "string" ? body.analyticalMethod : null,
      subject: typeof body.subject === "string" ? body.subject : null,
      validFrom: typeof body.validFrom === "string" && body.validFrom ? body.validFrom : null,
      validUntil: typeof body.validUntil === "string" && body.validUntil ? body.validUntil : null,
      content: typeof body.content === "string" ? body.content : null,
    });
    return Response.json({ technicalSource }, { status: 201 });
  } catch (error) {
    if (error instanceof AgronomicProfileError) return Response.json({ error: error.message }, { status: error.status });
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível cadastrar a fonte técnica." }, { status: 422 });
  }
}
