import { getPlatformSession } from "@/lib/auth/session";
import { createAnalysis, listAnalyses } from "@/lib/repositories/analyses";

export async function GET() {
  const session = await getPlatformSession();
  if (!session) return Response.json({ error: "Sessão necessária." }, { status: 401 });
  const analyses = await listAnalyses(session.tenantId, session.userId);
  return Response.json({ analyses });
}

export async function POST(request: Request) {
  const session = await getPlatformSession();
  if (!session) return Response.json({ error: "Sessão necessária." }, { status: 401 });
  if (!new Set(["SUPER_ADMIN", "TENANT_ADMIN", "AGRONOMIST", "FIELD_TECH"]).has(session.role)) {
    return Response.json({ error: "Seu perfil não pode criar análises." }, { status: 403 });
  }

  const body = await request.json() as {
    cropSeasonId?: string;
    collectionOrderId?: string;
    laboratoryId?: string;
    sourceType?: "INTEGRATION" | "CSV" | "XLSX" | "PDF_OCR" | "MANUAL";
  };

  if (!body.cropSeasonId) return Response.json({ error: "Safra/talhão obrigatório." }, { status: 400 });

  const analysis = await createAnalysis({
    tenantId: session.tenantId,
    userId: session.userId,
    cropSeasonId: body.cropSeasonId,
    collectionOrderId: body.collectionOrderId || null,
    laboratoryId: body.laboratoryId || null,
    sourceType: body.sourceType || null,
  });
  return Response.json({ analysis }, { status: 201 });
}
