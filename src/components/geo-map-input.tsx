"use client";

import { useEffect, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";
import type * as Leaflet from "leaflet";
import { Icon } from "@/components/icon";
import {
  boundaryPointCoverage,
  type BoundaryReferencePoint,
  type FieldBoundaryGeometry as Geometry,
} from "@/domain/field-boundary";
import { loadGoogleMaps, hasGoogleMapsBrowserKey } from "@/lib/maps/google-maps-loader";
import { spatialGeometryPositions } from "@/components/spatial-map-types";

type BoundaryCoverage = ReturnType<typeof boundaryPointCoverage>;

type GeoMapInputProps = {
  value: string;
  onChange: (value: string) => void;
  /** Limite maior (ex.: propriedade), apenas como referência visual. */
  referenceBoundary?: Geometry | null;
  /** Contorno anterior do próprio talhão, para redesenho seguro. */
  previousBoundary?: Geometry | null;
  /** Pontos fixos que o novo contorno precisa conter. */
  referencePoints?: BoundaryReferencePoint[];
  requireAllReferencePointsInside?: boolean;
  onValidationChange?: (coverage: BoundaryCoverage) => void;
  height?: number;
};

const DEFAULT_CENTER: [number, number] = [-15.7797, -47.9297];

function parseGeometry(text: string): Geometry | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  try {
    const parsed = JSON.parse(trimmed) as Geometry;
    if (!parsed || (parsed.type !== "Polygon" && parsed.type !== "MultiPolygon") || !Array.isArray(parsed.coordinates)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function ringsToLatLngs(geometry: Geometry): [number, number][][] {
  const toLatLng = (ring: number[][]) => ring.map(([lon, lat]) => [lat, lon] as [number, number]);
  if (geometry.type === "Polygon") return (geometry.coordinates as number[][][]).map(toLatLng);
  return (geometry.coordinates as number[][][][]).flatMap((polygon) => polygon.map(toLatLng));
}

function pointsToGeometry(points: [number, number][]): Geometry {
  const ring = points.map(([lat, lon]) => [lon, lat]);
  ring.push(ring[0]!);
  return { type: "Polygon", coordinates: [ring] };
}

function geometryPositions(geometry: Geometry | null | undefined) {
  return geometry ? spatialGeometryPositions(geometry) : [];
}

export function GeoMapInput({
  value,
  onChange,
  referenceBoundary,
  previousBoundary,
  referencePoints = [],
  requireAllReferencePointsInside = false,
  onValidationChange,
  height = 320,
}: GeoMapInputProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const cleanupProviderRef = useRef<() => void>(() => {});
  const redrawRef = useRef<(fit?: boolean) => void>(() => {});
  const setViewRef = useRef<(lat: number, lon: number, zoom: number) => void>(() => {});
  const drawPointsRef = useRef<[number, number][]>([]);
  const drawingRef = useRef(false);
  const latestRef = useRef({ value, referenceBoundary, previousBoundary, referencePoints });
  const [drawing, setDrawing] = useState(false);
  const [pointCount, setPointCount] = useState(0);
  const [locating, setLocating] = useState(false);
  const [provider, setProvider] = useState<"GOOGLE" | "LEAFLET" | "LOADING">("LOADING");
  const [providerNote, setProviderNote] = useState<string | null>(null);

  latestRef.current = { value, referenceBoundary, previousBoundary, referencePoints };
  drawingRef.current = drawing;

  const candidateGeometry =
    drawing && drawPointsRef.current.length >= 3
      ? pointsToGeometry(drawPointsRef.current)
      : parseGeometry(value);
  const coverage = boundaryPointCoverage(candidateGeometry, referencePoints);
  const finishBlocked =
    pointCount < 3
    || (requireAllReferencePointsInside && referencePoints.length > 0 && !coverage.valid);

  useEffect(() => {
    onValidationChange?.(coverage);
  }, [coverage.inside, coverage.total, coverage.outside, coverage.valid, onValidationChange]);

  useEffect(() => {
    redrawRef.current(false);
  }, [value, referenceBoundary, previousBoundary, referencePoints, drawing, pointCount]);

  useEffect(() => {
    let cancelled = false;
    cleanupProviderRef.current();

    async function initLeaflet(note?: string) {
      const container = containerRef.current;
      if (!container || cancelled) return;
      container.replaceChildren();

      const mod = await import("leaflet");
      if (cancelled || !containerRef.current) return;
      const L = mod.default;
      const map = L.map(containerRef.current, { attributionControl: true, preferCanvas: true }).setView(DEFAULT_CENTER, 4);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: "&copy; OpenStreetMap contributors",
      }).addTo(map);

      const layers = {
        reference: L.layerGroup().addTo(map),
        previous: L.layerGroup().addTo(map),
        shape: L.layerGroup().addTo(map),
        points: L.layerGroup().addTo(map),
      };

      const redraw = (fit = false) => {
        Object.values(layers).forEach((layer) => layer.clearLayers());
        const current = latestRef.current;
        const valueGeometry = parseGeometry(current.value);
        const activeDrawing = drawingRef.current;
        const drawPoints = drawPointsRef.current;

        if (current.referenceBoundary) {
          for (const ring of ringsToLatLngs(current.referenceBoundary)) {
            L.polygon(ring, { color: "#B86F3E", weight: 1.5, dashArray: "5 5", fillOpacity: 0.02 }).addTo(layers.reference);
          }
        }
        if (current.previousBoundary && activeDrawing) {
          for (const ring of ringsToLatLngs(current.previousBoundary)) {
            L.polygon(ring, { color: "#6F7D76", weight: 1.5, dashArray: "3 5", fillOpacity: 0.03 }).addTo(layers.previous);
          }
        }
        if (!activeDrawing && valueGeometry) {
          for (const ring of ringsToLatLngs(valueGeometry)) {
            L.polygon(ring, { color: "#00C4D6", weight: 2.5, fillOpacity: 0.16 }).addTo(layers.shape);
          }
        }
        if (activeDrawing) {
          drawPoints.forEach((point, index) => {
            L.circleMarker(point, { radius: 5, color: "#00C4D6", fillColor: "#00C4D6", fillOpacity: 1 })
              .bindTooltip(String(index + 1), { permanent: false })
              .addTo(layers.shape);
          });
          if (drawPoints.length > 1) L.polyline(drawPoints, { color: "#00C4D6", weight: 2.5 }).addTo(layers.shape);
          if (drawPoints.length > 2) L.polygon(drawPoints, { color: "#00C4D6", weight: 2.5, fillOpacity: 0.14 }).addTo(layers.shape);
        }

        for (const point of current.referencePoints) {
          L.circleMarker([point.latitude, point.longitude], {
            radius: 7,
            color: "#173F2A",
            fillColor: "#F4C430",
            fillOpacity: 1,
            weight: 2,
          }).bindTooltip(`${point.code} · ponto GPS fixo`, { direction: "top" }).addTo(layers.points);
        }

        if (fit) {
          const primary: [number, number][] = [];
          const primaryGeometry = activeDrawing && drawPoints.length >= 3
            ? pointsToGeometry(drawPoints)
            : valueGeometry ?? current.previousBoundary ?? null;
          for (const [lon, lat] of geometryPositions(primaryGeometry)) primary.push([lat, lon]);
          for (const point of current.referencePoints) primary.push([point.latitude, point.longitude]);

          const fallback: [number, number][] = [];
          for (const [lon, lat] of geometryPositions(current.referenceBoundary)) fallback.push([lat, lon]);
          const bounds = L.latLngBounds(primary.length ? primary : fallback);
          if (bounds.isValid()) map.fitBounds(bounds, { padding: [24, 24], maxZoom: 18 });
        }
      };

      const click = (event: Leaflet.LeafletMouseEvent) => {
        if (!drawingRef.current) return;
        drawPointsRef.current = [...drawPointsRef.current, [event.latlng.lat, event.latlng.lng]];
        setPointCount(drawPointsRef.current.length);
        redraw(false);
      };
      map.on("click", click);

      const resizeObserver = new ResizeObserver(() => map.invalidateSize({ pan: false }));
      resizeObserver.observe(containerRef.current);

      redrawRef.current = redraw;
      setViewRef.current = (lat, lon, zoom) => map.setView([lat, lon], zoom);
      setProvider("LEAFLET");
      setProviderNote(note ?? (hasGoogleMapsBrowserKey() ? "Satélite indisponível; usando mapa de contingência." : "Google Satellite não configurado; usando mapa de contingência."));
      redraw(true);

      cleanupProviderRef.current = () => {
        resizeObserver.disconnect();
        try { map.off("click", click); } catch { /* noop */ }
        try { map.remove(); } catch { /* noop */ }
      };
    }

    async function initGoogle() {
      if (!hasGoogleMapsBrowserKey()) {
        await initLeaflet();
        return;
      }

      try {
        const maps = await loadGoogleMaps();
        if (cancelled || !containerRef.current) return;
        containerRef.current.replaceChildren();
        const map = new maps.Map(containerRef.current, {
          center: { lat: DEFAULT_CENTER[0], lng: DEFAULT_CENTER[1] },
          zoom: 4,
          mapTypeId: maps.MapTypeId?.SATELLITE ?? "satellite",
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
          rotateControl: false,
          tilt: 0,
          gestureHandling: "greedy",
        });

        map.data.setStyle((feature: any) => {
          const kind = String(feature.getProperty("kind") ?? "");
          if (kind === "reference-point") {
            return {
              icon: {
                path: maps.SymbolPath.CIRCLE,
                scale: 7,
                fillColor: "#F4C430",
                fillOpacity: 1,
                strokeColor: "#173F2A",
                strokeWeight: 2,
              },
              zIndex: 10,
            };
          }
          if (kind === "property-boundary") return { strokeColor: "#B86F3E", strokeWeight: 2, strokeOpacity: 0.9, fillOpacity: 0.02 };
          if (kind === "previous-boundary") return { strokeColor: "#D7E0DA", strokeWeight: 2, strokeOpacity: 0.95, fillOpacity: 0.03 };
          if (kind === "drawing-line") return { strokeColor: "#00C4D6", strokeWeight: 3 };
          return { strokeColor: "#00C4D6", strokeWeight: 3, fillColor: "#00C4D6", fillOpacity: 0.14 };
        });

        const addGeometry = (geometry: Geometry | null | undefined, kind: string) => {
          if (!geometry) return;
          map.data.addGeoJson({ type: "Feature", properties: { kind }, geometry });
        };

        const redraw = (fit = false) => {
          map.data.forEach((feature: any) => map.data.remove(feature));
          const current = latestRef.current;
          const valueGeometry = parseGeometry(current.value);
          const activeDrawing = drawingRef.current;
          const drawPoints = drawPointsRef.current;

          addGeometry(current.referenceBoundary, "property-boundary");
          if (current.previousBoundary && activeDrawing) addGeometry(current.previousBoundary, "previous-boundary");
          if (!activeDrawing) addGeometry(valueGeometry, "shape");

          if (activeDrawing && drawPoints.length > 1) {
            const coordinates = drawPoints.map(([lat, lon]) => [lon, lat]);
            map.data.addGeoJson({
              type: "Feature",
              properties: { kind: drawPoints.length > 2 ? "shape" : "drawing-line" },
              geometry: drawPoints.length > 2
                ? { type: "Polygon", coordinates: [[...coordinates, coordinates[0]]] }
                : { type: "LineString", coordinates },
            });
          }

          for (const point of current.referencePoints) {
            map.data.addGeoJson({
              type: "Feature",
              properties: { kind: "reference-point", code: point.code },
              geometry: { type: "Point", coordinates: [point.longitude, point.latitude] },
            });
          }

          if (fit) {
            const bounds = new maps.LatLngBounds();
            const primaryGeometry = activeDrawing && drawPoints.length >= 3
              ? pointsToGeometry(drawPoints)
              : valueGeometry ?? current.previousBoundary ?? null;
            for (const [lon, lat] of geometryPositions(primaryGeometry)) bounds.extend({ lat, lng: lon });
            for (const point of current.referencePoints) bounds.extend({ lat: point.latitude, lng: point.longitude });
            if (bounds.isEmpty()) {
              for (const [lon, lat] of geometryPositions(current.referenceBoundary)) bounds.extend({ lat, lng: lon });
            }
            if (!bounds.isEmpty()) {
              map.fitBounds(bounds, 28);
              maps.event.addListenerOnce(map, "idle", () => {
                const zoom = map.getZoom();
                if (typeof zoom === "number" && zoom > 19) map.setZoom(19);
              });
            }
          }
        };

        const clickListener = map.addListener("click", (event: any) => {
          if (!drawingRef.current || !event.latLng) return;
          drawPointsRef.current = [...drawPointsRef.current, [event.latLng.lat(), event.latLng.lng()]];
          setPointCount(drawPointsRef.current.length);
          redraw(false);
        });

        redrawRef.current = redraw;
        setViewRef.current = (lat, lon, zoom) => map.setZoom(zoom) || map.setCenter({ lat, lng: lon });
        setProvider("GOOGLE");
        setProviderNote(null);
        redraw(true);

        cleanupProviderRef.current = () => {
          try { clickListener.remove?.(); } catch { /* noop */ }
          try { maps.event.clearInstanceListeners(map); } catch { /* noop */ }
          if (containerRef.current) containerRef.current.replaceChildren();
        };
      } catch (error) {
        await initLeaflet(error instanceof Error ? error.message : "Google Satellite indisponível.");
      }
    }

    void initGoogle();

    return () => {
      cancelled = true;
      cleanupProviderRef.current();
      redrawRef.current = () => {};
      setViewRef.current = () => {};
    };
  }, []);

  function centerOnCurrentLocation() {
    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setViewRef.current(position.coords.latitude, position.coords.longitude, 16);
        setLocating(false);
      },
      () => setLocating(false),
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
    );
  }

  function startDrawing() {
    drawPointsRef.current = [];
    setPointCount(0);
    setDrawing(true);
    requestAnimationFrame(() => redrawRef.current(false));
  }

  function undoLastPoint() {
    drawPointsRef.current = drawPointsRef.current.slice(0, -1);
    setPointCount(drawPointsRef.current.length);
    redrawRef.current(false);
  }

  function finishDrawing() {
    if (finishBlocked) return;
    const geometry = pointsToGeometry(drawPointsRef.current);
    onChange(JSON.stringify(geometry));
    setDrawing(false);
    drawPointsRef.current = [];
    setPointCount(0);
  }

  function cancelDrawing() {
    setDrawing(false);
    drawPointsRef.current = [];
    setPointCount(0);
    requestAnimationFrame(() => redrawRef.current(false));
  }

  function clearShape() {
    onChange("");
  }

  return (
    <div className="geo-map-input">
      <div className="geo-map-toolbar">
        {!drawing ? (
          <>
            <button type="button" className="button tiny" onClick={startDrawing}><Icon name="location" size={14} />Desenhar no mapa</button>
            <button type="button" className="button tiny secondary" disabled={locating} onClick={centerOnCurrentLocation}><Icon name="map" size={14} />{locating ? "Localizando…" : "Minha localização"}</button>
            {value.trim() && <button type="button" className="button tiny secondary" onClick={clearShape}><Icon name="close" size={14} />Limpar</button>}
            <span className="geo-map-hint">{provider === "GOOGLE" ? "Satélite Google" : provider === "LEAFLET" ? "Mapa de contingência" : "Preparando mapa…"}</span>
          </>
        ) : (
          <>
            <span className="geo-map-hint">Marque os vértices da área produtiva ({pointCount}).</span>
            <button type="button" className="button tiny secondary" disabled={pointCount === 0} onClick={undoLastPoint}>Desfazer último</button>
            <button type="button" className="button tiny" disabled={finishBlocked} onClick={finishDrawing}><Icon name="check" size={14} />Concluir contorno</button>
            <button type="button" className="button tiny secondary" onClick={cancelDrawing}>Cancelar</button>
          </>
        )}
      </div>

      {referencePoints.length > 0 && (
        <div className={`geo-map-point-coverage ${coverage.valid ? "ok" : "warning"}`}>
          <Icon name={coverage.valid ? "check" : "warning"} size={14} />
          <span>
            <strong>{coverage.inside} de {coverage.total} pontos dentro da área</strong>
            {!coverage.valid && <small>O contorno não pode ser confirmado enquanto algum ponto GPS ficar fora.</small>}
          </span>
        </div>
      )}
      {providerNote && <div className="geo-map-provider-note">{providerNote}</div>}
      <div ref={containerRef} className="geo-map-canvas" style={{ height }} />
    </div>
  );
}
