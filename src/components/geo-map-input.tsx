"use client";

import { useEffect, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";
import type * as Leaflet from "leaflet";
import { Icon } from "@/components/icon";
import { mapboxBrowserToken } from "@/lib/maps/mapbox-loader";

type Geometry = { type: "Polygon" | "MultiPolygon"; coordinates: unknown };

type GeoMapReferencePoint = {
  id: string;
  code: string;
  latitude: number;
  longitude: number;
};

type GeoMapInputProps = {
  value: string;
  onChange: (value: string) => void;
  referenceBoundary?: Geometry | null;
  referencePoints?: GeoMapReferencePoint[];
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

export function GeoMapInput({ value, onChange, referenceBoundary, referencePoints = [], height = 320 }: GeoMapInputProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<Leaflet.Map | null>(null);
  const shapeLayerRef = useRef<Leaflet.LayerGroup | null>(null);
  const referenceLayerRef = useRef<Leaflet.LayerGroup | null>(null);
  const referencePointsLayerRef = useRef<Leaflet.LayerGroup | null>(null);
  const drawPointsRef = useRef<[number, number][]>([]);
  const drawingRef = useRef(false);
  const [drawing, setDrawing] = useState(false);
  const [pointCount, setPointCount] = useState(0);
  const [locating, setLocating] = useState(false);

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
      L.polygon(ring, { color: "#00C4D6", weight: 2, fillOpacity: 0.18 }).addTo(shapeLayerRef.current as Leaflet.LayerGroup);
    });
    const bounds = L.latLngBounds(rings.flat());
    if (bounds.isValid()) map.fitBounds(bounds, { padding: [24, 24], maxZoom: 17 });
  }

  function renderReference(L: typeof Leaflet, map: Leaflet.Map) {
    referenceLayerRef.current?.clearLayers();
    const fitPositions: [number, number][] = [];
    if (referenceBoundary) {
      const rings = ringsToLatLngs(referenceBoundary);
      rings.forEach((ring) => {
        L.polygon(ring, { color: "#B86F3E", weight: 1.5, dashArray: "4 4", fillOpacity: 0.05 }).addTo(referenceLayerRef.current as Leaflet.LayerGroup);
        fitPositions.push(...ring);
      });
    }
    if (!parseGeometry(value) && fitPositions.length) {
      const bounds = L.latLngBounds(fitPositions);
      if (bounds.isValid()) map.fitBounds(bounds, { padding: [24, 24], maxZoom: 17 });
    }
  }

  function renderReferencePoints(L: typeof Leaflet, map: Leaflet.Map) {
    referencePointsLayerRef.current?.clearLayers();
    const validPoints = referencePoints.filter((point) =>
      Number.isFinite(point.latitude)
      && Number.isFinite(point.longitude)
      && point.latitude >= -90 && point.latitude <= 90
      && point.longitude >= -180 && point.longitude <= 180
    );
    for (const point of validPoints) {
      L.circleMarker([point.latitude, point.longitude], {
        radius: 7,
        color: "#ffffff",
        weight: 2,
        fillColor: "#0E8A4B",
        fillOpacity: 1,
      })
        .bindTooltip(`${point.code} · ponto fixo`, { direction: "top", offset: [0, -8] })
        .addTo(referencePointsLayerRef.current as Leaflet.LayerGroup);
    }
    if (!parseGeometry(value) && validPoints.length) {
      const bounds = L.latLngBounds(validPoints.map((point) => [point.latitude, point.longitude] as [number, number]));
      if (bounds.isValid()) map.fitBounds(bounds, { padding: [36, 36], maxZoom: 18 });
    }
  }

  function renderDrawing(L: typeof Leaflet) {
    shapeLayerRef.current?.clearLayers();
    const points = drawPointsRef.current;
    points.forEach((point) => {
      L.circleMarker(point, { radius: 5, color: "#00C4D6", fillColor: "#00C4D6", fillOpacity: 1 }).addTo(shapeLayerRef.current as Leaflet.LayerGroup);
    });
    if (points.length > 1) {
      L.polyline(points, { color: "#00C4D6", weight: 2 }).addTo(shapeLayerRef.current as Leaflet.LayerGroup);
    }
    if (points.length > 2) {
      L.polygon(points, { color: "#00C4D6", weight: 2, fillOpacity: 0.15, dashArray: "3 5" }).addTo(shapeLayerRef.current as Leaflet.LayerGroup);
    }
  }

  useEffect(() => {
    let cancelled = false;
    let cleanupResize: (() => void) | undefined;

    void import("leaflet").then((mod) => {
      if (cancelled || !containerRef.current || mapRef.current) return;
      const L = mod.default;
      const map = L.map(containerRef.current, { attributionControl: true }).setView(DEFAULT_CENTER, 4);
      const mapboxToken = mapboxBrowserToken();
      const tileLayer = mapboxToken
        ? L.tileLayer(
            "https://api.mapbox.com/styles/v1/mapbox/satellite-streets-v12/tiles/256/{z}/{x}/{y}@2x?access_token={accessToken}",
            {
              maxZoom: 20,
              tileSize: 256,
              zoomOffset: 0,
              attribution: "&copy; Mapbox &copy; OpenStreetMap",
              accessToken: mapboxToken,
            } as Leaflet.TileLayerOptions & { accessToken: string },
          )
        : L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
            maxZoom: 19,
            attribution: "&copy; OpenStreetMap contributors",
          });
      tileLayer.addTo(map);
      if (containerRef.current) {
        containerRef.current.dataset.geoMapBase = mapboxToken ? "satellite" : "street-fallback";
      }
      shapeLayerRef.current = L.layerGroup().addTo(map);
      referenceLayerRef.current = L.layerGroup().addTo(map);
      referencePointsLayerRef.current = L.layerGroup().addTo(map);
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
      renderReferencePoints(L, map);
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

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    void import("leaflet").then((mod) => renderReferencePoints(mod.default, map));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [referencePoints]);

  function centerOnCurrentLocation() {
    if (!navigator.geolocation || !mapRef.current) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        mapRef.current?.setView([position.coords.latitude, position.coords.longitude], 15);
        setLocating(false);
      },
      () => setLocating(false),
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 300000 },
    );
  }

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
            <span className="geo-map-base-badge"><Icon name="map" size={12}/>Satélite quando disponível</span>
            <button type="button" className="button tiny secondary" disabled={locating} onClick={centerOnCurrentLocation}><Icon name="map" size={14} />{locating ? "Localizando…" : "Minha localização"}</button>
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
      {referencePoints.length > 0 && (
        <div className="geo-map-reference-note">
          <Icon name="location" size={13} />
          {referencePoints.length} ponto{referencePoints.length === 1 ? "" : "s"} de coleta fixo{referencePoints.length === 1 ? "" : "s"} · desenhe o limite produtivo ao redor deles
        </div>
      )}
    </div>
  );
}
