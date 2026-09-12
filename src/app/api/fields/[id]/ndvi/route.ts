import {
  analyzeNdviTemporalHistory,
  classifyNdviObservationQuality,
  computeZoneBreakdownPct,
  detectWithinFieldVariability,
} from "@/domain/ndvi-engine";
import { getPlatformSession } from "@/lib/auth/session";
import { getFieldBoundaryGeoJson, getLatestNdviSnapshot, listNdviHistoryForField, saveNdviSnapshot } from "@/lib/repositories/ndvi";
import { copernicusNdviProvider } from "@/lib/satellite/copernicus-ndvi-provider";

const runRoles = new Set(["SUPER_ADMIN", "TENANT_ADMIN", "AGRONOMIST", "FIELD_TECH"]);
const HISTORY_LOOKBACK_DAYS = 120;
const MAX_SCENES_PER_REFRESH = 18;

function intelligencePayload(latest: Awaited<ReturnType<typeof getLatestNdviSnapshot>>, history: Awaited<ReturnType<typeof listNdviHistoryForField>>) {
  return {
    variability: latest ? detectWithinFieldVariability(latest.zoneBreakdownPct ?? {}) : null,
    quality: latest ? classifyNdviObservationQuality(latest) : "INDETERMINADA",
    temporal: analyzeNdviTemporalHistory(history),
  };
}

/**
 * GET nunca chama o provedor externo: só lê os snapshots já persistidos e calcula inteligência
 * determinística sobre eles. Isso mantém a tela rápida, auditável e sem consumo de quota por render.
 */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getPlatformSession();
  if (!session) return Response.json({ error: "Sessão necessária." }, { status: 401 });
  const { id: fieldId } = await context.params;

  const [latest, history] = await Promise.all([
    getLatestNdviSnapshot(session.tenantId, fieldId, session.userId),
    listNdviHistoryForField(session.tenantId, fieldId, session.userId),
  ]);
  return Response.json({ latest, history, ...intelligencePayload(latest, history) });
}

/**
 * POST atualiza o histórico do talhão em uma única consulta Statistical API de 120 dias. O provedor
 * devolve uma entrada diária válida; persistimos no máximo as 18 mais recentes por atualização para
 * limitar escrita/auditoria. O banco usa upsert por talhão+data+fonte, então repetir a atualização é
 * idempotente e nunca cria duas leituras para a mesma aquisição diária.
 */
export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getPlatformSession();
  if (!session) return Response.json({ error: "Sessão necessária." }, { status: 401 });
  if (!runRoles.has(session.role)) return Response.json({ error: "Seu perfil não pode buscar leitura de satélite." }, { status: 403 });
  const { id: fieldId } = await context.params;

  const boundary = await getFieldBoundaryGeoJson(session.tenantId, fieldId, session.userId);
  if (!boundary) return Response.json({ error: "Talhão não encontrado." }, { status: 404 });

  const toDate = new Date();
  const fromDate = new Date(toDate);
  fromDate.setDate(fromDate.getDate() - HISTORY_LOOKBACK_DAYS);

  let scenes;
  try {
    scenes = await copernicusNdviProvider.fetchFieldNdviSeries({
      fieldBoundaryGeoJson: boundary as { type: string; coordinates: unknown },
      fromDate: fromDate.toISOString().slice(0, 10),
      toDate: toDate.toISOString().slice(0, 10),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao consultar o provedor de satélite.";
    return Response.json({ error: message }, { status: 502 });
  }

  if (scenes.length === 0) {
    return Response.json({ error: `Nenhuma cena Sentinel-2 válida nos últimos ${HISTORY_LOOKBACK_DAYS} dias para este talhão.` }, { status: 404 });
  }

  const selectedScenes = scenes.slice(-MAX_SCENES_PER_REFRESH);
  for (const scene of selectedScenes) {
    const zoneBreakdownPct = computeZoneBreakdownPct(scene.histogram);
    await saveNdviSnapshot({
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
  }

  const [latest, history] = await Promise.all([
    getLatestNdviSnapshot(session.tenantId, fieldId, session.userId),
    listNdviHistoryForField(session.tenantId, fieldId, session.userId),
  ]);

  return Response.json(
    {
      snapshot: latest,
      latest,
      history,
      importedCount: selectedScenes.length,
      requestedWindowDays: HISTORY_LOOKBACK_DAYS,
      ...intelligencePayload(latest, history),
    },
    { status: 201 },
  );
}
