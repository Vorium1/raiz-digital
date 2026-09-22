import { getPlatformSession } from "@/lib/auth/session";
import {
  AgroclimateProfileError,
  createAgroclimateProfile,
  listAgroclimateProfiles,
  type AgroclimateProfileKind,
} from "@/lib/repositories/agroclimate-profiles";

const KINDS = new Set<AgroclimateProfileKind>([
  "PHYSIOLOGY",
  "REGIONAL_CLIMATE",
  "DISEASE",
  "ZARC_CONTEXT",
]);

export async function GET(request: Request) {
  const session = await getPlatformSession();
  if (!session) return Response.json({ error: "Sessão necessária." }, { status: 401 });

  const url = new URL(request.url);
  const cropCode = url.searchParams.get("cropCode");
  const statusRaw = url.searchParams.get("status");
  const technicalRegionCodes = url.searchParams
    .getAll("technicalRegionCode")
    .flatMap((value) => value.split(","))
    .map((value) => value.trim())
    .filter(Boolean);

  const status = statusRaw === "DRAFT" || statusRaw === "ACTIVE" || statusRaw === "SUPERSEDED"
    ? statusRaw
    : null;

  const profiles = await listAgroclimateProfiles({
    tenantId: session.tenantId,
    userId: session.userId,
    cropCode,
    technicalRegionCodes,
    status,
  });
  return Response.json({ profiles });
}

export async function POST(request: Request) {
  const session = await getPlatformSession();
  if (!session) return Response.json({ error: "Sessão necessária." }, { status: 401 });
  if (!session.isPlatformCurator) {
    return Response.json({ error: "Somente o curador da plataforma pode cadastrar perfis agroclimáticos." }, { status: 403 });
  }

  try {
    const body = await request.json() as Record<string, unknown>;
    const kind = typeof body.kind === "string" ? body.kind.toUpperCase() as AgroclimateProfileKind : null;
    if (!kind || !KINDS.has(kind)) {
      throw new AgroclimateProfileError("Tipo de perfil agroclimático inválido.", 400);
    }

    const code = typeof body.code === "string" ? body.code.trim() : "";
    const cropProfileId = typeof body.cropProfileId === "string" ? body.cropProfileId.trim() : "";
    const technicalRegionCode = typeof body.technicalRegionCode === "string" ? body.technicalRegionCode.trim() : "";
    const technicalSourceId = typeof body.technicalSourceId === "string" ? body.technicalSourceId.trim() : "";
    if (!code || !cropProfileId || !technicalRegionCode || !technicalSourceId) {
      throw new AgroclimateProfileError("Código, cultura, região técnica e fonte técnica são obrigatórios.", 400);
    }

    const phenologicalStages = Array.isArray(body.phenologicalStages)
      ? body.phenologicalStages.filter((value): value is string => typeof value === "string")
      : [];

    const payload = body.payload && typeof body.payload === "object" && !Array.isArray(body.payload)
      ? body.payload as Record<string, unknown>
      : {};

    const profile = await createAgroclimateProfile({
      tenantId: session.tenantId,
      userId: session.userId,
      code,
      semanticVersion: typeof body.semanticVersion === "string" ? body.semanticVersion : undefined,
      kind,
      cropProfileId,
      technicalRegionCode,
      technicalSourceId,
      diseaseCode: typeof body.diseaseCode === "string" ? body.diseaseCode : null,
      phenologicalStages,
      payload,
      contentHash: typeof body.contentHash === "string" ? body.contentHash : null,
      validFrom: typeof body.validFrom === "string" ? body.validFrom : null,
      validUntil: typeof body.validUntil === "string" ? body.validUntil : null,
    });

    return Response.json({ profile }, { status: 201 });
  } catch (error) {
    if (error instanceof AgroclimateProfileError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    return Response.json({
      error: error instanceof Error ? error.message : "Não foi possível cadastrar o perfil agroclimático.",
    }, { status: 422 });
  }
}
