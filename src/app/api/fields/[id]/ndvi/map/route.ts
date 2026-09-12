import { getPlatformSession } from "@/lib/auth/session";
import { getFieldBoundaryGeoJson, listNdviHistoryForField } from "@/lib/repositories/ndvi";
import { copernicusNdviProvider } from "@/lib/satellite/copernicus-ndvi-provider";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Serve um PNG NDVI real do Sentinel-2 já vinculado a uma aquisição persistida da RAIZ.
 * O cliente nunca escolhe uma data arbitrária do provedor: ela precisa existir no histórico do
 * próprio talhão/tenant. Isso limita abuso de quota e mantém a visualização auditável em relação à
 * série temporal já registrada.
 */
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getPlatformSession();
  if (!session) return Response.json({ error: "Sessão necessária." }, { status: 401 });
  const { id: fieldId } = await context.params;
  const requestedDate = new URL(request.url).searchParams.get("date") ?? "";
  if (!DATE_RE.test(requestedDate)) {
    return Response.json({ error: "Informe uma data de aquisição válida no formato YYYY-MM-DD." }, { status: 400 });
  }

  const [boundary, history] = await Promise.all([
    getFieldBoundaryGeoJson(session.tenantId, fieldId, session.userId),
    listNdviHistoryForField(session.tenantId, fieldId, session.userId),
  ]);
  if (!boundary) return Response.json({ error: "Talhão não encontrado." }, { status: 404 });

  const snapshot = history.find((item) => String(item.capturedAt).slice(0, 10) === requestedDate);
  if (!snapshot) {
    return Response.json({ error: "A data solicitada não pertence ao histórico NDVI registrado deste talhão." }, { status: 404 });
  }

  try {
    const raster = await copernicusNdviProvider.fetchFieldNdviMap({
      fieldBoundaryGeoJson: boundary as { type: string; coordinates: unknown },
      capturedAt: requestedDate,
    });

    return new Response(raster.bytes, {
      status: 200,
      headers: {
        "content-type": "image/png",
        "cache-control": "private, max-age=3600",
        "x-raiz-ndvi-date": raster.capturedAt,
        "x-raiz-ndvi-bbox": raster.bbox.join(","),
        "x-raiz-ndvi-size": `${raster.width}x${raster.height}`,
        "x-raiz-ndvi-source": "SENTINEL_2_COPERNICUS_PROCESS_API",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível gerar o mapa NDVI desta aquisição.";
    return Response.json({ error: message }, { status: 502 });
  }
}
