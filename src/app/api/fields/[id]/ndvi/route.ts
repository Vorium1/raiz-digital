import { computeZoneBreakdownPct, detectWithinFieldVariability } from "@/domain/ndvi-engine";
import { getPlatformSession } from "@/lib/auth/session";
import { getFieldBoundaryGeoJson, getLatestNdviSnapshot, listNdviHistoryForField, saveNdviSnapshot } from "@/lib/repositories/ndvi";
import { copernicusNdviProvider } from "@/lib/satellite/copernicus-ndvi-provider";

const runRoles = new Set(["SUPER_ADMIN", "TENANT_ADMIN", "AGRONOMIST", "FIELD_TECH"]);

/** Leitura de vigor por satélite não é feita a cada carregamento de tela -- só quando alguém pede
 * explicitamente (POST), já que é uma chamada a serviço externo. GET só lê o que já foi salvo. */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getPlatformSession();
  if (!session) return Response.json({ error: "Sessão necessária." }, { status: 401 });
  const { id: fieldId } = await context.params;

  const [latest, history] = await Promise.all([
    getLatestNdviSnapshot(session.tenantId, fieldId, session.userId),
    listNdviHistoryForField(session.tenantId, fieldId, session.userId),
  ]);
  const variability = latest ? detectWithinFieldVariability(latest.zoneBreakdownPct ?? {}) : null;
  return Response.json({ latest, history, variability });
}

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getPlatformSession();
  if (!session) return Response.json({ error: "Sessão necessária." }, { status: 401 });
  if (!runRoles.has(session.role)) return Response.json({ error: "Seu perfil não pode buscar leitura de satélite." }, { status: 403 });
  const { id: fieldId } = await context.params;

  const boundary = await getFieldBoundaryGeoJson(session.tenantId, fieldId, session.userId);
  if (!boundary) return Response.json({ error: "Talhão não encontrado." }, { status: 404 });

  const toDate = new Date();
  const fromDate = new Date(toDate);
  fromDate.setDate(fromDate.getDate() - 30);

  let scene;
  try {
    scene = await copernicusNdviProvider.fetchFieldNdvi({
      fieldBoundaryGeoJson: boundary as { type: string; coordinates: unknown },
      fromDate: fromDate.toISOString().slice(0, 10),
      toDate: toDate.toISOString().slice(0, 10),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao consultar o provedor de satélite.";
    return Response.json({ error: message }, { status: 502 });
  }

  if (!scene) {
    return Response.json({ error: "Nenhuma cena Sentinel-2 com nuvem aceitável nos últimos 30 dias para este talhão." }, { status: 404 });
  }

  const zoneBreakdownPct = computeZoneBreakdownPct(scene.histogram);
  const saved = await saveNdviSnapshot({
    tenantId: session.tenantId,
    userId: session.userId,
    fieldId,
    capturedAt: scene.capturedAt,
    source: "SENTINEL_2",
    providerSceneId: scene.sceneId,
    cloudCoverPct: scene.cloudCoverPct,
    pixelCount: scene.pixelCount,
    meanNdvi: scene.meanNdvi,
    minNdvi: scene.minNdvi,
    maxNdvi: scene.maxNdvi,
    stddevNdvi: scene.stddevNdvi,
    zoneBreakdownPct,
  });

  return Response.json({ snapshot: saved, variability: detectWithinFieldVariability(zoneBreakdownPct) }, { status: 201 });
}
