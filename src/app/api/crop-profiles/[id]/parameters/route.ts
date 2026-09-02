import { getPlatformSession } from "@/lib/auth/session";
import { AgronomicProfileError, upsertCropProfileParameter } from "@/lib/repositories/agronomic-profiles";

const homologationRoles = new Set(["SUPER_ADMIN", "TENANT_ADMIN", "AGRONOMIST"]);
const validCategories = new Set(["QUIMICO", "FISICO", "MICROBIOLOGICO"]);
const validCriticality = new Set(["BAIXA", "MEDIA", "ALTA"]);

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getPlatformSession();
  if (!session) return Response.json({ error: "Sessão necessária." }, { status: 401 });
  if (!homologationRoles.has(session.role)) return Response.json({ error: "Somente um agrônomo responsável pode cadastrar parâmetros técnicos." }, { status: 403 });
  const { id } = await context.params;

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const parameterCode = typeof body.parameterCode === "string" ? body.parameterCode.trim() : "";
    const parameterCategory = typeof body.parameterCategory === "string" && validCategories.has(body.parameterCategory) ? (body.parameterCategory as "QUIMICO" | "FISICO" | "MICROBIOLOGICO") : "QUIMICO";
    if (!parameterCode) return Response.json({ error: "Código do parâmetro é obrigatório." }, { status: 400 });
    const criticality = typeof body.criticality === "string" && validCriticality.has(body.criticality) ? (body.criticality as "BAIXA" | "MEDIA" | "ALTA") : null;

    const parameter = await upsertCropProfileParameter({
      tenantId: session.tenantId,
      userId: session.userId,
      cropProfileId: id,
      parameterCode,
      parameterCategory,
      depthFromCm: typeof body.depthFromCm === "number" ? body.depthFromCm : null,
      depthToCm: typeof body.depthToCm === "number" ? body.depthToCm : null,
      analyticalMethodAllowed: Array.isArray(body.analyticalMethodAllowed) ? (body.analyticalMethodAllowed as string[]) : [],
      unitExpected: typeof body.unitExpected === "string" ? body.unitExpected : null,
      sufficiencyRanges: Array.isArray(body.sufficiencyRanges) ? body.sufficiencyRanges : null,
      criticality,
      technicalNotes: typeof body.technicalNotes === "string" ? body.technicalNotes : null,
    });
    return Response.json({ parameter }, { status: 201 });
  } catch (error) {
    if (error instanceof AgronomicProfileError) return Response.json({ error: error.message }, { status: error.status });
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível salvar o parâmetro." }, { status: 422 });
  }
}
