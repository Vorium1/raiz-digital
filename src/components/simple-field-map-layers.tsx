"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icon";
import { GoogleFieldTerrain3D } from "@/components/google-field-terrain-3d";
import { RealFieldMap, type MapLegendEntry, type MapPoint, type SpatialGeometry } from "@/components/real-field-map";
import { humanClassification } from "@/domain/simple-ux-labels";
import type { AnalysisEvidenceFreshnessCode } from "@/domain/analysis-evidence-freshness";
import { classificationColor } from "@/lib/classification-colors";
import { hasGoogleMapsBrowserKey } from "@/lib/maps/google-maps-loader";

type SoilContext = {
  collectionOrderId: string;
  collectionOrderCode: string;
  seasonLabel: string;
  depthFromCm: number;
  depthToCm: number;
};

type LayerResponse = {
  fieldBoundary: SpatialGeometry;
  points: MapPoint[];
  availableParameters: string[];
  interpretationStatus: string | null;
  interpretationCurrent: boolean;
  interpretationFreshnessCode: string;
};

const PARAMETER_LABEL: Record<string, string> = {
  PH: "pH",
  P: "Fósforo",
  K: "Potássio",
  CA: "Cálcio",
  MG: "Magnésio",
  MO: "Matéria orgânica",
  V: "Sat. bases",
  S: "Enxofre",
  B: "Boro",
  ZN: "Zinco",
  CU: "Cobre",
  MN: "Manganês",
};

const PARAMETER_PRIORITY = ["P", "K", "PH", "MO", "CA", "MG", "ZN", "CU", "B", "MN", "S"];
const REFRESHABLE_FRESHNESS_CODES = new Set<AnalysisEvidenceFreshnessCode>([
  "AGRONOMIC_RULES_CHANGED",
  "CROP_PROFILE_CHANGED",
  "LAB_EVIDENCE_CHANGED",
  "INTERPRETATION_TIMESTAMP_MISSING",
]);

function parameterLabel(code: string) {
  return PARAMETER_LABEL[code.toUpperCase()] ?? code;
}

export function SimpleFieldMapLayers({
  fieldId,
  boundary,
  collectionPoints,
  analysisId,
  freshnessCode,
  canRefresh,
}: {
  fieldId: string;
  boundary: SpatialGeometry;
  collectionPoints: MapPoint[];
  analysisId: string | null;
  freshnessCode: AnalysisEvidenceFreshnessCode | null;
  canRefresh: boolean;
}) {
  const router = useRouter();
  const sectionRef = useRef<HTMLElement | null>(null);
  const [activated, setActivated] = useState(false);
  const [mode, setMode] = useState<"soil" | "collection" | "terrain">("soil");
  const [context, setContext] = useState<SoilContext | null>(null);
  const [availableParameters, setAvailableParameters] = useState<string[]>([]);
  const [parameter, setParameter] = useState("");
  const [layer, setLayer] = useState<LayerResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [layerLoading, setLayerLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [terrain3DFailed, setTerrain3DFailed] = useState(false);

  useEffect(() => {
    const node = sectionRef.current;
    if (!node || activated) return;
    if (typeof IntersectionObserver === "undefined") {
      setActivated(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setActivated(true);
          observer.disconnect();
        }
      },
      { rootMargin: "180px 0px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [activated]);

  useEffect(() => {
    if (!activated) return;
    let cancelled = false;
    const controller = new AbortController();

    void (async () => {
      try {
        let refreshedAnalysis = false;
        if (
          analysisId
          && canRefresh
          && freshnessCode
          && REFRESHABLE_FRESHNESS_CODES.has(freshnessCode)
        ) {
          const key = `raiz:ux3:field-analysis-refresh:${analysisId}`;
          if (!sessionStorage.getItem(key)) {
            sessionStorage.setItem(key, "1");
            try {
              const refresh = await fetch(`/api/analyses/${analysisId}/interpret?draft=local`, { method: "POST", signal: controller.signal });
              if (!refresh.ok) {
                const payload = await refresh.json().catch(() => ({}));
                throw new Error(payload.error ?? "Não foi possível atualizar a análise desta área.");
              }
              refreshedAnalysis = true;
            } catch (error) {
              sessionStorage.removeItem(key);
              throw error;
            }
          }
        }

        if (cancelled) return;
        const response = await fetch(`/api/fields/${fieldId}/soil-map-context`, { cache: "no-store", signal: controller.signal });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error ?? "Não foi possível abrir a leitura do solo.");
        const nextContext = (payload.context ?? null) as SoilContext | null;
        if (cancelled) return;

        setContext(nextContext);
        if (!nextContext) {
          setMode("collection");
          setLoading(false);
          return;
        }

        const layerResponse = await fetch(`/api/collection-orders/${nextContext.collectionOrderId}/map-layer`, { cache: "no-store", signal: controller.signal });
        const layerPayload = await layerResponse.json().catch(() => ({}));
        if (!layerResponse.ok) throw new Error(layerPayload.error ?? "Não foi possível abrir os dados do solo.");
        if (cancelled) return;

        const params = Array.isArray(layerPayload.availableParameters)
          ? layerPayload.availableParameters as string[]
          : [];
        setAvailableParameters(params);
        const preferred = PARAMETER_PRIORITY.find((code) => params.includes(code)) ?? params[0] ?? "";
        setParameter(preferred);
        if (!preferred) setMode("collection");
        setLoading(false);
        if (refreshedAnalysis) router.refresh();
      } catch (caught) {
        if (cancelled) return;
        setMessage(caught instanceof Error ? caught.message : "Não foi possível abrir as camadas desta área.");
        setMode("collection");
        setLoading(false);
      }
    })();

    return () => { cancelled = true; controller.abort(); };
  }, [activated, analysisId, canRefresh, fieldId, freshnessCode, router]);

  useEffect(() => {
    if (!context || !parameter) {
      setLayer(null);
      setLayerLoading(false);
      return;
    }
    const controller = new AbortController();
    setLayerLoading(true);
    setMessage("");
    void fetch(
      `/api/collection-orders/${context.collectionOrderId}/map-layer?parameter=${encodeURIComponent(parameter)}`,
      { cache: "no-store", signal: controller.signal },
    )
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error ?? "Não foi possível carregar este parâmetro.");
        return payload as LayerResponse;
      })
      .then((payload) => {
        if (controller.signal.aborted) return;
        setLayer(payload);
        setLayerLoading(false);
      })
      .catch((caught) => {
        if (controller.signal.aborted) return;
        setLayer(null);
        setLayerLoading(false);
        setMessage(caught instanceof Error ? caught.message : "Não foi possível carregar este parâmetro.");
      });
    return () => controller.abort();
  }, [context, parameter]);

  const soilPoints = layer?.points ?? [];
  const classifiedCount = soilPoints.filter((point) => Boolean(point.classification)).length;

  const legend = useMemo<MapLegendEntry[]>(() => {
    const labels = new Map<string, string>();
    for (const point of soilPoints) {
      if (!point.classification) continue;
      labels.set(point.classification, classificationColor(point.classification));
    }
    return Array.from(labels.entries()).map(([classification, color]) => ({
      label: humanClassification(classification),
      color,
    }));
  }, [soilPoints]);

  const colorFor = useCallback((point: MapPoint) => {
    const color = classificationColor(point.classification);
    return { stroke: color, fill: color, fillOpacity: point.classification ? 0.9 : 0.35 };
  }, []);

  const collectionDisplayPoints = useMemo<MapPoint[]>(() => {
    const result: MapPoint[] = [];
    for (const point of collectionPoints) {
      result.push(point);
      const plannedLatitude = point.plannedLatitude;
      const plannedLongitude = point.plannedLongitude;
      if (plannedLatitude == null || plannedLongitude == null) continue;
      const actualLatitude = point.observedLatitude ?? point.latitude;
      const actualLongitude = point.observedLongitude ?? point.longitude;
      const differs = Math.abs(plannedLatitude - actualLatitude) > 0.0000005
        || Math.abs(plannedLongitude - actualLongitude) > 0.0000005;
      if (!differs) continue;
      result.push({
        ...point,
        id: `${point.id}:planned`,
        code: `${point.code} · planejado`,
        latitude: plannedLatitude,
        longitude: plannedLongitude,
        observedLatitude: null,
        observedLongitude: null,
        plannedLatitude: null,
        plannedLongitude: null,
        collectedAt: null,
        accuracyM: null,
        gpsSource: "PLANNED_GRID_SOURCE",
        notes: "Posição originalmente planejada para comparar com o local real da coleta.",
        labResultCount: 0,
        value: undefined,
        unit: undefined,
        method: undefined,
        interpretable: undefined,
        classification: undefined,
        notInterpretableReason: undefined,
      });
    }
    return result;
  }, [collectionPoints]);

  const collectionColorFor = useCallback((point: MapPoint) => {
    const source = (point.gpsSource ?? "").trim().toUpperCase();
    if (source === "PLANNED_GRID_SOURCE") {
      return { stroke: "#9A6A24", fill: "#F2C879", fillOpacity: 0.7 };
    }
    if (source === "SHAPEFILE_REAL_GPS_LONLAT" || source === "SHAPEFILE_REAL_EPSG4326") {
      return { stroke: "#007F8E", fill: "#00C4D6", fillOpacity: 0.95 };
    }
    if (point.observedLatitude != null && point.observedLongitude != null) {
      return { stroke: "#176C47", fill: "#2D9B69", fillOpacity: 0.95 };
    }
    return { stroke: "#8B765F", fill: "#C7B49D", fillOpacity: 0.72 };
  }, []);

  const collectionLegend = useMemo<MapLegendEntry[]>(() => {
    const entries: MapLegendEntry[] = [];
    const sources = new Set(collectionDisplayPoints.map((point) => (point.gpsSource ?? "").trim().toUpperCase()));
    if (collectionDisplayPoints.some((point) => point.observedLatitude != null && point.observedLongitude != null)
        && !sources.has("SHAPEFILE_REAL_GPS_LONLAT") && !sources.has("SHAPEFILE_REAL_EPSG4326")) {
      entries.push({ label: "GPS coletado", color: "#2D9B69" });
    }
    if (sources.has("SHAPEFILE_REAL_GPS_LONLAT") || sources.has("SHAPEFILE_REAL_EPSG4326")) {
      entries.push({ label: "Coleta real importada", color: "#00C4D6" });
    }
    if (sources.has("PLANNED_GRID_SOURCE")) entries.push({ label: "Ponto planejado", color: "#F2C879" });
    return entries;
  }, [collectionDisplayPoints]);

  const onTerrain3DFailure = useCallback(() => setTerrain3DFailed(true), []);

  const mapPoints = mode === "soil" ? soilPoints : collectionDisplayPoints;
  const mapBoundary = layer?.fieldBoundary ?? boundary;

  return (
    <section ref={sectionRef} className="simple-field-map-card simple-field-map-layers">
      <div className="simple-field-map-head layered">
        <div>
          <span>MAPA DA ÁREA</span>
          <strong>{mode === "soil" ? "Fertilidade por parâmetro" : mode === "terrain" ? "Relevo" : "Planejado × coletado"}</strong>
        </div>
        <div className="simple-map-layer-switch" role="group" aria-label="Camada do mapa">
          <button type="button" className={mode === "soil" ? "active" : ""} onClick={() => setMode("soil")} disabled={!context || availableParameters.length === 0}>Fertilidade</button>
          <button type="button" className={mode === "collection" ? "active" : ""} onClick={() => setMode("collection")}>Pontos</button>
          <button type="button" className={mode === "terrain" ? "active" : ""} onClick={() => setMode("terrain")}>Relevo</button>
        </div>
      </div>

      {mode === "soil" && availableParameters.length > 0 && (
        <div className="simple-soil-parameter-strip" aria-label="Parâmetro do solo">
          {availableParameters.map((code) => (
            <button
              type="button"
              key={code}
              className={parameter === code ? "active" : ""}
              onClick={() => setParameter(code)}
            >
              {parameterLabel(code)}
            </button>
          ))}
        </div>
      )}

      {!activated || loading || (mode === "soil" && layerLoading) ? (
        <div className="simple-map-loading"><Icon name="clock" size={17}/> {activated ? "Preparando o mapa…" : "Mapa pronto quando você chegar aqui…"}</div>
      ) : mode === "terrain" && hasGoogleMapsBrowserKey() && !terrain3DFailed ? (
        <GoogleFieldTerrain3D boundary={mapBoundary} height={390} onFailure={onTerrain3DFailure}/>
      ) : (
        <RealFieldMap
          boundary={mapBoundary}
          points={mode === "terrain" ? collectionPoints : mapPoints}
          height={390}
          colorFor={mode === "soil" ? colorFor : mode === "collection" ? collectionColorFor : undefined}
          legend={mode === "soil" && legend.length ? legend : mode === "collection" && collectionLegend.length ? collectionLegend : undefined}
          baseLayer={mode === "terrain" ? "terrain" : "default"}
          hint={
            mode === "soil"
              ? classifiedCount > 0
                ? `${parameterLabel(parameter)} · ${classifiedCount} ponto(s) classificados`
                : "A análise ainda não gerou classificação atual para este parâmetro."
              : mode === "terrain"
                ? terrain3DFailed
                  ? "Relevo 3D indisponível nesta sessão; exibindo base topográfica."
                  : "Base topográfica para leitura do relevo da área."
                : collectionDisplayPoints.length > collectionPoints.length
                  ? "Compare onde cada ponto foi planejado com o local real registrado na coleta."
                  : "Mostra a posição real/auditada dos pontos e sua proveniência de coleta."
          }
        />
      )}

      {mode === "soil" && !loading && availableParameters.length === 0 && (
        <div className="simple-map-layer-note"><Icon name="shield" size={14}/> Ainda não há parâmetros laboratoriais vinculados a esta coleta.</div>
      )}
      {mode === "soil" && classifiedCount === 0 && !layerLoading && parameter && (
        <div className="simple-map-layer-note"><Icon name="clock" size={14}/> A RAIZ ainda não tem uma classificação atual deste parâmetro. Os valores continuam preservados; nenhuma cor é inventada.</div>
      )}
      {message && <details className="simple-map-layer-error"><summary>Não foi possível carregar uma camada.</summary><small>{message}</small></details>}
    </section>
  );
}
