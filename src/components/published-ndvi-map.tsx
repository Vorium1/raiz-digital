"use client";

import { useEffect, useState } from "react";
import { RealFieldMap, type MapImageOverlay, type MapLegendEntry, type MapPoint, type SpatialGeometry } from "@/components/real-field-map";
import type { VigorZone } from "@/domain/ndvi-engine";
import { VIGOR_ZONE_LABELS } from "@/domain/ndvi-engine";
import { enhanceArchivedNdviRasterForDisplay, NDVI_DISPLAY_ZONE_COLOR } from "@/lib/ndvi-display-palette";

const ZONE_ORDER: VigorZone[] = ["SEM_VEGETACAO", "BAIXO", "MODERADO", "ALTO", "MUITO_ALTO"];
const ZONE_COLOR = NDVI_DISPLAY_ZONE_COLOR;

const VIGOR_LEGEND: MapLegendEntry[] = ZONE_ORDER.map((zone) => ({
  label: VIGOR_ZONE_LABELS[zone],
  color: ZONE_COLOR[zone],
}));

function parseBounds(raw: string | null): MapImageOverlay["bounds"] | null {
  if (!raw) return null;
  const values = raw.split(",").map(Number);
  if (values.length !== 4 || values.some((value) => !Number.isFinite(value))) return null;
  const [minLon, minLat, maxLon, maxLat] = values;
  if (minLon >= maxLon || minLat >= maxLat) return null;
  return [[minLat, minLon], [maxLat, maxLon]];
}

export function PublishedNdviMap({
  fieldId,
  capturedAt,
  boundary,
  points = [],
  height = 300,
  showLegend = true,
  eager = false,
  showHint = true,
}: {
  fieldId: string;
  capturedAt: string;
  boundary: SpatialGeometry;
  points?: MapPoint[];
  height?: number;
  showLegend?: boolean;
  eager?: boolean;
  showHint?: boolean;
}) {
  const [overlay, setOverlay] = useState<MapImageOverlay | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "unavailable">("loading");

  useEffect(() => {
    const date = capturedAt.slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      setState("unavailable");
      return;
    }

    const controller = new AbortController();
    let objectUrl: string | null = null;

    void (async () => {
      try {
        setState("loading");
        const response = await fetch(
          `/api/fields/${fieldId}/ndvi/map?date=${encodeURIComponent(date)}`,
          { cache: "no-cache", signal: controller.signal },
        );
        if (!response.ok) throw new Error("Raster NDVI oficial indisponível nesta sessão.");

        const bounds = parseBounds(response.headers.get("x-raiz-ndvi-bbox"));
        if (!bounds) throw new Error("Envelope geográfico do raster NDVI inválido.");

        const blob = await response.blob();
        if (!blob.type.includes("image/png")) throw new Error("Formato inesperado do raster NDVI oficial.");
        const displayBlob = await enhanceArchivedNdviRasterForDisplay(blob);

        objectUrl = URL.createObjectURL(displayBlob);
        if (!controller.signal.aborted) {
          setOverlay({ url: objectUrl, bounds, opacity: 0.84 });
          setState("ready");
        }
      } catch {
        if (!controller.signal.aborted) {
          setOverlay(null);
          setState("unavailable");
        }
      }
    })();

    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [fieldId, capturedAt]);

  if (state === "loading") {
    return <div className="simple-result-ndvi-map-state" data-report-ndvi-state="loading">Carregando a evidência visual arquivada…</div>;
  }

  if (state === "unavailable" || !overlay) {
    return <div className="simple-result-ndvi-map-state" data-report-ndvi-state="unavailable">A imagem arquivada não pôde ser aberta nesta sessão. O resumo NDVI acima continua sendo o snapshot oficial congelado.</div>;
  }

  return (
    <div className="simple-result-ndvi-map" data-report-ndvi-state="ready">
      <RealFieldMap
        boundary={boundary}
        points={points}
        height={height}
        legend={showLegend ? VIGOR_LEGEND : undefined}
        hint={showHint ? "Raster NDVI arquivado e verificado · mesma data congelada no laudo" : undefined}
        imageOverlay={overlay}
        renderImmediately={eager}
      />
    </div>
  );
}
