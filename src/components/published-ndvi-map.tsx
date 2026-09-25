"use client";

import { useEffect, useState } from "react";
import { RealFieldMap, type MapImageOverlay, type MapLegendEntry, type SpatialGeometry } from "@/components/real-field-map";
import type { VigorZone } from "@/domain/ndvi-engine";
import { VIGOR_ZONE_LABELS } from "@/domain/ndvi-engine";

const ZONE_ORDER: VigorZone[] = ["SEM_VEGETACAO", "BAIXO", "MODERADO", "ALTO", "MUITO_ALTO"];
const ZONE_COLOR: Record<VigorZone, string> = {
  SEM_VEGETACAO: "#9a8468",
  BAIXO: "#d9655a",
  MODERADO: "#d89943",
  ALTO: "#8fbf6b",
  MUITO_ALTO: "#29966f",
};

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
  height = 300,
}: {
  fieldId: string;
  capturedAt: string;
  boundary: SpatialGeometry;
  height?: number;
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
          { cache: "no-store", signal: controller.signal },
        );
        if (!response.ok) throw new Error("Raster NDVI oficial indisponível nesta sessão.");

        const bounds = parseBounds(response.headers.get("x-raiz-ndvi-bbox"));
        if (!bounds) throw new Error("Envelope geográfico do raster NDVI inválido.");

        const blob = await response.blob();
        if (!blob.type.includes("image/png")) throw new Error("Formato inesperado do raster NDVI oficial.");

        objectUrl = URL.createObjectURL(blob);
        if (!controller.signal.aborted) {
          setOverlay({ url: objectUrl, bounds, opacity: 0.62 });
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
    return <div className="simple-result-ndvi-map-state">Carregando a evidência visual arquivada…</div>;
  }

  if (state === "unavailable" || !overlay) {
    return <div className="simple-result-ndvi-map-state">A imagem arquivada não pôde ser aberta nesta sessão. O resumo NDVI acima continua sendo o snapshot oficial congelado.</div>;
  }

  return (
    <div className="simple-result-ndvi-map">
      <RealFieldMap
        boundary={boundary}
        points={[]}
        height={height}
        legend={VIGOR_LEGEND}
        hint="Raster NDVI arquivado e verificado · mesma data congelada no laudo"
        imageOverlay={overlay}
      />
    </div>
  );
}
