import {
  analyzeNdviTemporalHistory,
  classifyNdviObservationQuality,
  computeZoneBreakdownPct,
  detectWithinFieldVariability,
} from "@/domain/ndvi-engine";
import { getPlatformSession } from "@/lib/auth/session";
import {
  NDVI_RASTER_ALGORITHM_VERSION,
  NdviRasterPersistenceError,
  saveRequiredNdviRasterArtifact,
} from "@/lib/ndvi-raster-storage";
import { getFieldBoundaryGeoJson, getLatestNdviSnapshot, listNdviHistoryForField, saveNdviSnapshot } from "@/lib/repositories/ndvi";
import { COPERNICUS_NDVI_MOSAICKING_ORDER, copernicusNdviProvider } from "@/lib/satellite/copernicus-ndvi-provider";

const runRoles = new Set(["SUPER_ADMIN", "TENANT_ADMIN", "AGRONOMIST", "FIELD_TECH"]);
const HISTORY_LOOKBACK_DAYS = 120;
const MAX_SCENES_PER_REFRESH = 18;
/**
 * Cada raster exige Process API + PUT durável. Fazer 18 pares seriais em uma única Vercel Function
 * transforma o refresh em uma tarefa longa e frágil. O histórico considerado continua com 18 cenas,
 * mas cada chamada arquiva no máximo quatro datas ainda pendentes (das mais recentes para trás).
 * Repetir o refresh progride de forma idempotente até zerar `pendingArchiveCount`.
 */
const MAX_RASTERS_TO_ARCHIVE_PER_REQUEST = 4;

function intelligencePayload(latest: Awaited<ReturnType<typeof getLatestNdviSnapshot>>, history: Awaited<ReturnType<typeof listNdviHistoryForField>>) {
  return {
    variability: latest ? detectWithinFieldVariability(latest.zoneBreakdownPct ?? {}) : null,
    quality: latest ? classifyNdviObservationQuality(latest) : "INDETERMINADA",
    temporal: analyzeNdviTemporalHistory(history),
  };
}

function hasArchivedRaster(snapshot: any) {
  return Boolean(
    snapshot?.rasterObjectKey && snapshot?.rasterSha256 && snapshot?.rasterBytes &&
    Array.isArray(snapshot?.rasterBbox) && snapshot.rasterBbox.length === 4 &&
    snapshot?.rasterWidth && snapshot?.rasterHeight && snapshot?.rasterAlgorithm &&
    snapshot?.rasterMosaickingOrder && snapshot?.rasterArchivedAt,
  );
}

/**
 * GET nunca chama o provedor externo: só lê os snapshots já persistidos e calcula inteligência
 * determinística sobre eles. A geometria retornada já passa pelo mesmo escopo tenant/RLS.
 */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getPlatformSession();
  if (!session) return Response.json({ error: "Sessão necessária." }, { status: 401 });
  const { id: fieldId } = await context.params;

  const [latest, history, fieldBoundary] = await Promise.all([
    getLatestNdviSnapshot(session.tenantId, fieldId, session.userId),
    listNdviHistoryForField(session.tenantId, fieldId, session.userId),
    getFieldBoundaryGeoJson(session.tenantId, fieldId, session.userId),
  ]);
  if (!fieldBoundary) return Response.json({ error: "Talhão não encontrado." }, { status: 404 });
  return Response.json({ latest, history, fieldBoundary, ...intelligencePayload(latest, history) });
}

/**
 * POST atualiza o histórico do talhão pela Statistical API e, antes de efetivar cada snapshot novo,
 * gera o PNG espacial correspondente pela Process API e o arquiva de forma content-addressed.
 *
 * Uma linha que já possui raster arquivado vira evidência imutável: refresh posterior preserva tanto
 * a estatística quanto o artefato daquele dia. Linhas legadas sem raster podem ser promovidas uma única
 * vez para o novo contrato. Assim a visualização histórica deixa de ser regenerada sob demanda.
 *
 * O lote pode concluir parcialmente: se um raster posterior falhar depois que outros já foram gravados,
 * a resposta devolve o estado persistido atual com `partialFailure` e a contagem real ainda pendente.
 * Se nenhum raster foi arquivado, a falha continua retornando HTTP de erro e não é mascarada como sucesso.
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
  const existingHistory = await listNdviHistoryForField(session.tenantId, fieldId, session.userId);
  const archivedByDate = new Map(
    existingHistory
      .filter((snapshot: any) => snapshot.source === "SENTINEL_2" && hasArchivedRaster(snapshot))
      .map((snapshot: any) => [String(snapshot.capturedAt).slice(0, 10), snapshot]),
  );

  const missingScenes = selectedScenes.filter((scene) => !archivedByDate.has(scene.capturedAt));
  const scenesToArchive = missingScenes.slice(-MAX_RASTERS_TO_ARCHIVE_PER_REQUEST);
  const pendingOutsideThisBatch = Math.max(0, missingScenes.length - scenesToArchive.length);
  const preservedArchivedCount = selectedScenes.length - missingScenes.length;
  let archivedRasterCount = 0;
  let partialFailure: { error: string; capturedAt: string; status: number } | null = null;

  for (const scene of scenesToArchive) {
    let raster;
    try {
      raster = await copernicusNdviProvider.fetchFieldNdviMap({
        fieldBoundaryGeoJson: boundary as { type: string; coordinates: unknown },
        capturedAt: scene.capturedAt,
      });
    } catch (error) {
      partialFailure = {
        error: error instanceof Error ? error.message : "Falha ao gerar o raster NDVI da aquisição.",
        capturedAt: scene.capturedAt,
        status: 502,
      };
      break;
    }

    let storedRaster;
    try {
      storedRaster = await saveRequiredNdviRasterArtifact({
        tenantId: session.tenantId,
        fieldId,
        capturedAt: scene.capturedAt,
        bytes: Buffer.from(raster.bytes),
      });
    } catch (error) {
      partialFailure = {
        error: error instanceof Error ? error.message : "Falha ao arquivar o raster NDVI.",
        capturedAt: scene.capturedAt,
        status: error instanceof NdviRasterPersistenceError ? 503 : 502,
      };
      break;
    }

    const zoneBreakdownPct = computeZoneBreakdownPct(scene.histogram);
    try {
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
        rasterArtifact: {
          key: storedRaster.key,
          sha256: storedRaster.sha256,
          bytes: storedRaster.bytes,
          bbox: raster.bbox,
          width: raster.width,
          height: raster.height,
          algorithm: NDVI_RASTER_ALGORITHM_VERSION,
          mosaickingOrder: COPERNICUS_NDVI_MOSAICKING_ORDER,
        },
      });
    } catch (error) {
      partialFailure = {
        error: error instanceof Error ? error.message : "Falha ao persistir o snapshot NDVI após arquivar o objeto.",
        capturedAt: scene.capturedAt,
        status: 500,
      };
      break;
    }
    archivedRasterCount += 1;
  }

  const pendingArchiveCount = partialFailure
    ? pendingOutsideThisBatch + (scenesToArchive.length - archivedRasterCount)
    : pendingOutsideThisBatch;

  const [latest, history] = await Promise.all([
    getLatestNdviSnapshot(session.tenantId, fieldId, session.userId),
    listNdviHistoryForField(session.tenantId, fieldId, session.userId),
  ]);

  const responsePayload = {
    snapshot: latest,
    latest,
    history,
    fieldBoundary: boundary,
    importedCount: archivedRasterCount,
    archivedRasterCount,
    preservedArchivedCount,
    pendingArchiveCount,
    archiveCompleteForSelectedWindow: pendingArchiveCount === 0 && !partialFailure,
    maxRastersArchivedPerRequest: MAX_RASTERS_TO_ARCHIVE_PER_REQUEST,
    consideredSceneCount: selectedScenes.length,
    requestedWindowDays: HISTORY_LOOKBACK_DAYS,
    ...(partialFailure
      ? {
          partialFailure: {
            code: "NDVI_ARCHIVE_PARTIAL_FAILURE",
            error: partialFailure.error,
            capturedAt: partialFailure.capturedAt,
          },
        }
      : {}),
    ...intelligencePayload(latest, history),
  };

  if (partialFailure && archivedRasterCount === 0) {
    return Response.json(
      {
        ...responsePayload,
        error: partialFailure.error,
        capturedAt: partialFailure.capturedAt,
      },
      { status: partialFailure.status },
    );
  }

  return Response.json(responsePayload, { status: 201 });
}
