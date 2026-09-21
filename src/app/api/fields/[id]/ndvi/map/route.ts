import { getPlatformSession } from "@/lib/auth/session";
import { ndviRasterBboxContainsBoundary } from "@/domain/ndvi-raster-spatial-validity";
import { NdviRasterPersistenceError, readNdviRasterArtifact } from "@/lib/ndvi-raster-storage";
import { getFieldBoundaryGeoJson, getNdviSnapshotForDate } from "@/lib/repositories/ndvi";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Serve exclusivamente o PNG arquivado junto ao snapshot histórico. Não existe fallback para uma nova
 * chamada ao provider de satélite: se a linha for legada ou o objeto falhar na verificação SHA-256, a rota falha
 * fechado. Isso impede que uma visualização regenerada no futuro seja apresentada como a mesma evidência.
 *
 * O artefato é imutável, mas a autorização do usuário não é. Por isso a resposta não pode ficar
 * armazenada por longo prazo no cache privado do navegador: cada leitura precisa voltar a passar pela
 * sessão e pelo escopo tenant/RLS.
 */
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getPlatformSession();
  if (!session) return Response.json({ error: "Sessão necessária." }, { status: 401 });
  const { id: fieldId } = await context.params;
  const requestedDate = new URL(request.url).searchParams.get("date") ?? "";
  if (!DATE_RE.test(requestedDate)) {
    return Response.json({ error: "Informe uma data de aquisição válida no formato YYYY-MM-DD." }, { status: 400 });
  }

  const [boundary, snapshot] = await Promise.all([
    getFieldBoundaryGeoJson(session.tenantId, fieldId, session.userId),
    getNdviSnapshotForDate({
      tenantId: session.tenantId,
      fieldId,
      capturedAt: requestedDate,
      userId: session.userId,
      source: "SENTINEL_2",
    }),
  ]);
  if (!boundary) return Response.json({ error: "Talhão não encontrado." }, { status: 404 });
  if (!snapshot) {
    return Response.json({ error: "A data solicitada não pertence ao histórico NDVI registrado deste talhão." }, { status: 404 });
  }

  const bbox = snapshot.rasterBbox;
  const hasCompleteArchive = Boolean(
    snapshot.rasterObjectKey && snapshot.rasterSha256 && snapshot.rasterBytes &&
    Array.isArray(bbox) && bbox.length === 4 && bbox.every((value: unknown) => typeof value === "number" && Number.isFinite(value)) &&
    snapshot.rasterWidth && snapshot.rasterHeight && snapshot.rasterAlgorithm &&
    snapshot.rasterMosaickingOrder && snapshot.rasterArchivedAt,
  );

  if (!hasCompleteArchive) {
    return Response.json(
      {
        error: "Este snapshot NDVI é legado e ainda não possui raster histórico arquivado. Atualize o histórico do talhão para criar a cadeia de custódia antes de exibi-lo como mapa histórico.",
        code: "NDVI_RASTER_ARCHIVE_REQUIRED",
      },
      { status: 409 },
    );
  }

  if (!ndviRasterBboxContainsBoundary(snapshot.rasterBbox, boundary)) {
    return Response.json(
      {
        error: "O raster NDVI arquivado pertence a um contorno anterior deste talhão. Atualize o satélite para gerar evidência espacial compatível com o limite atual.",
        code: "NDVI_RASTER_BOUNDARY_MISMATCH",
      },
      { status: 409 },
    );
  }

  try {
    const raster = await readNdviRasterArtifact({
      tenantId: session.tenantId,
      fieldId,
      key: snapshot.rasterObjectKey,
      sha256: snapshot.rasterSha256,
      bytes: snapshot.rasterBytes,
    });

    return new Response(new Uint8Array(raster), {
      status: 200,
      headers: {
        "content-type": "image/png",
        "cache-control": "private, no-store",
        etag: `"${snapshot.rasterSha256}"`,
        "x-raiz-ndvi-date": requestedDate,
        "x-raiz-ndvi-bbox": bbox.join(","),
        "x-raiz-ndvi-size": `${snapshot.rasterWidth}x${snapshot.rasterHeight}`,
        "x-raiz-ndvi-source": "SENTINEL_2_ARCHIVED_RASTER",
        "x-raiz-ndvi-sha256": snapshot.rasterSha256,
        "x-raiz-ndvi-algorithm": snapshot.rasterAlgorithm,
        "x-raiz-ndvi-mosaicking-order": snapshot.rasterMosaickingOrder,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível recuperar o raster NDVI arquivado.";
    const status = error instanceof NdviRasterPersistenceError ? 503 : 502;
    return Response.json({ error: message, code: "NDVI_RASTER_ARCHIVE_UNAVAILABLE" }, { status });
  }
}
