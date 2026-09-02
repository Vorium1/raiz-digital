"use client";

import { useEffect, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";
import type * as Leaflet from "leaflet";
import { Icon } from "@/components/icon";

type Geometry = { type: "Polygon" | "MultiPolygon"; coordinates: unknown };

type GeoMapInputProps = {
  value: string;
  onChange: (value: string) => void;
  referenceBoundary?: Geometry | null;
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
  ring.push(ring[0]);
  return { type: "Polygon", coordinates: [ring] };
}

export function GeoMapInput({ value, onChange, referenceBoundary, height = 320 }: GeoMapInputProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<Leaflet.Map | null>(null);
  const shapeLayerRef = useRef<Leaflet.LayerGroup | null>(null);
  const referenceLayerRef = useRef<Leaflet.LayerGroup | null>(null);
  const drawPointsRef = useRef<[number, number][]>([]);
  const drawingRef = useRef(false);
  const [drawing, setDrawing] = useState(false);
  const [pointCount, setPointCount] = useState(0);

  useEffect(() => {
    drawingRef.current = drawing;
  }, [drawing]);

  function renderShape(L: typeof Leaflet, map: Leaflet.Map) {
    shapeLayerRef.current?.clearLayers();
    const geometry = parseGeometry(value);
    if (!geometry) return;
    const rings = ringsToLatLngs(geometry);
    if (!rings.length) return;
    rings.forEach((ring) => {
      L.polygon(ring, { color: "#00BFA6", weight: 2, fillOpacity: 0.18 }).addTo(shapeLayerRef.current as Leaflet.LayerGroup);
    });
    const bounds = L.latLngBounds(rings.flat());
    if (bounds.isValid()) map.fitBounds(bounds, { padding: [24, 24], maxZoom: 17 });
  }

  function renderReference(L: typeof Leaflet, map: Leaflet.Map) {
    referenceLayerRef.current?.clearLayers();
    if (!referenceBoundary) return;
    const rings = ringsToLatLngs(referenceBoundary);
    if (!rings.length) return;
    rings.forEach((ring) => {
      L.polygon(ring, { color: "#B86F3C", weight: 1.5, dashArray: "4 4", fillOpacity: 0.05 }).addTo(referenceLayerRef.current as Leaflet.LayerGroup);
    });
    if (!parseGeometry(value)) {
      const bounds = L.latLngBounds(rings.flat());
      if (bounds.isValid()) map.fitBounds(bounds, { padding: [24, 24], maxZoom: 17 });
    }
  }

  function renderDrawing(L: typeof Leaflet) {
    shapeLayerRef.current?.clearLayers();
    const points = drawPointsRef.current;
    points.forEach((point) => {
      L.circleMarker(point, { radius: 5, color: "#00BFA6", fillColor: "#00BFA6", fillOpacity: 1 }).addTo(shapeLayerRef.current as Leaflet.LayerGroup);
    });
    if (points.length > 1) {
      L.polyline(points, { color: "#00BFA6", weight: 2 }).addTo(shapeLayerRef.current as Leaflet.LayerGroup);
    }
    if (points.length > 2) {
      L.polygon(points, { color: "#00BFA6", weight: 2, fillOpacity: 0.15, dashArray: "3 5" }).addTo(shapeLayerRef.current as Leaflet.LayerGroup);
    }
  }

  useEffect(() => {
    let cancelled = false;
    let cleanupResize: (() => void) | undefined;

    void import("leaflet").then((mod) => {
      if (cancelled || !containerRef.current || mapRef.current) return;
      const L = mod.default;
      const map = L.map(containerRef.current, { attributionControl: true }).setView(DEFAULT_CENTER, 4);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: "&copy; OpenStreetMap contributors",
      }).addTo(map);
      shapeLayerRef.current = L.layerGroup().addTo(map);
      referenceLayerRef.current = L.layerGroup().addTo(map);
      mapRef.current = map;

      map.on("click", (event: Leaflet.LeafletMouseEvent) => {
        if (!drawingRef.current) return;
        drawPointsRef.current = [...drawPointsRef.current, [event.latlng.lat, event.latlng.lng]];
        setPointCount(drawPointsRef.current.length);
        renderDrawing(L);
      });

      const resizeObserver = new ResizeObserver(() => map.invalidateSize());
      resizeObserver.observe(containerRef.current);
      cleanupResize = () => resizeObserver.disconnect();

      renderShape(L, map);
      renderReference(L, map);
    });

    return () => {
      cancelled = true;
      cleanupResize?.();
      mapRef.current?.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    void import("leaflet").then((mod) => renderShape(mod.default, map));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    void import("leaflet").then((mod) => renderReference(mod.default, map));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [referenceBoundary]);

  function startDrawing() {
    drawPointsRef.current = [];
    setPointCount(0);
    setDrawing(true);
  }

  function finishDrawing() {
    if (drawPointsRef.current.length < 3) return;
    const geometry = pointsToGeometry(drawPointsRef.current);
    onChange(JSON.stringify(geometry));
    setDrawing(false);
    drawPointsRef.current = [];
  }

  function cancelDrawing() {
    setDrawing(false);
    drawPointsRef.current = [];
    const map = mapRef.current;
    if (map) void import("leaflet").then((mod) => renderShape(mod.default, map));
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
            {value.trim() && <button type="button" className="button tiny secondary" onClick={clearShape}><Icon name="close" size={14} />Limpar</button>}
          </>
        ) : (
          <>
            <span className="geo-map-hint">Clique no mapa para marcar cada vértice ({pointCount} ponto{pointCount === 1 ? "" : "s"}).</span>
            <button type="button" className="button tiny" disabled={pointCount < 3} onClick={finishDrawing}><Icon name="check" size={14} />Concluir polígono</button>
            <button type="button" className="button tiny secondary" onClick={cancelDrawing}>Cancelar</button>
          </>
        )}
      </div>
      <div ref={containerRef} className="geo-map-canvas" style={{ height }} />
    </div>
  );
}
