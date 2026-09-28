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
  classifiedParameters: string[];
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

        const params = Array.isArray(layerPayload.classifiedParameters)
          ? layerPayload.classifiedParameters as string[]
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
    const verified = collectionPoints.filter((point) => {
      const source = (point.gpsSource ?? "").trim().toUpperCase();
      return point.observedLatitude != null
        && point.observedLongitude != null
        || source === "SHAPEFILE_REAL_GPS_LONLAT"
        || source === "SHAPEFILE_REAL_EPSG4326";
    });
    if (verified.length > 0) return verified;

    // Sem posição real/auditada, preservamos somente coordenadas importadas/cadastradas que não sejam
    // grid de planejamento do próprio sistema. Elas ficam neutras e nunca são apresentadas como GPS real.
    return collectionPoints.filter((point) => {
      const source = (point.gpsSource ?? "").trim().toUpperCase();
      return source !== "POSTGIS_GRID" && source !== "PLANNED_GRID_SOURCE";
    });
  }, [collectionPoints]);

  const hiddenPlanningCount = Math.max(0, collectionPoints.length - collectionDisplayPoints.length);

  const collectionColorFor = useCallback((point: MapPoint) => {
    const source = (point.gpsSource ?? "").trim().toUpperCase();
    if (source === "SHAPEFILE_REAL_GPS_LONLAT" || source === "SHAPEFILE_REAL_EPSG4326") {
      return { stroke: "#00758A", fill: "#00BBD4", fillOpacity: 0.98 };
    }
    if (point.observedLatitude != null && point.observedLongitude != null) {
      return { stroke: "#0B6B3A", fill: "#16A765", fillOpacity: 0.98 };
    }
    return { stroke: "#6E756F", fill: "#AAB2AC", fillOpacity: 0.8 };
  }, []);

  const collectionLegend = useMemo<MapLegendEntry[]>(() => {
    const entries: MapLegendEntry[] = [];
    const sources = new Set(collectionDisplayPoints.map((point) => (point.gpsSource ?? "").trim().toUpperCase()));
    if (collectionDisplayPoints.some((point) => point.observedLatitude != null && point.observedLongitude != null)
        && !sources.has("SHAPEFILE_REAL_GPS_LONLAT") && !sources.has("SHAPEFILE_REAL_EPSG4326")) {
      entries.push({ label: "GPS coletado em campo", color: "#16A765" });
    }
    if (sources.has("SHAPEFILE_REAL_GPS_LONLAT") || sources.has("SHAPEFILE_REAL_EPSG4326")) {
      entries.push({ label: "Ponto real importado", color: "#00BBD4" });
    }
    if (collectionDisplayPoints.some((point) => {
      const source = (point.gpsSource ?? "").trim().toUpperCase();
      return point.observedLatitude == null
        && point.observedLongitude == null
        && source !== "SHAPEFILE_REAL_GPS_LONLAT"
        && source !== "SHAPEFILE_REAL_EPSG4326";
    })) {
      entries.push({ label: "Sem GPS real confirmado", color: "#AAB2AC" });
    }
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
          <strong>{mode === "soil" ? "Fertilidade classificada" : mode === "terrain" ? "Relevo" : "Pontos de coleta"}</strong>
        </div>
        <div className="simple-map-layer-switch" role="group" aria-label="Camada do mapa">
          {availableParameters.length > 0 && (
            <button type="button" className={mode === "soil" ? "active" : ""} onClick={() => setMode("soil")} disabled={!context}>Fertilidade</button>
          )}
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
                : collectionDisplayPoints.length > 0
                  ? "Mostra a posição real/auditada dos pontos. Planejamento interno não aparece nesta visão."
                  : "Ainda não há coordenada real/auditada para exibir nesta área."
          }
        />
      )}

      {mode === "soil" && !loading && availableParameters.length === 0 && (
        <div className="simple-map-layer-note"><Icon name="shield" size={14}/> Os resultados laboratoriais estão preservados nos detalhes técnicos, mas ainda não há classificação corrente útil para colorir este mapa.</div>
      )}
      {mode === "collection" && hiddenPlanningCount > 0 && (
        <div className="simple-map-layer-note"><Icon name="shield" size={14}/> {hiddenPlanningCount} posição(ões) de planejamento interno foram ocultadas desta visão. O histórico continua preservado para auditoria.</div>
      )}
      {mode === "soil" && classifiedCount === 0 && !layerLoading && parameter && (
        <div className="simple-map-layer-note"><Icon name="clock" size={14}/> A RAIZ ainda não tem uma classificação atual deste parâmetro. Os valores continuam preservados; nenhuma cor é inventada.</div>
      )}
      {message && <details className="simple-map-layer-error"><summary>Não foi possível carregar uma camada.</summary><small>{message}</small></details>}
    </section>
  );
}
