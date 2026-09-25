"use client";

import { useEffect, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";
import type * as Leaflet from "leaflet";
import { Icon } from "@/components/icon";
import {
  hasGoogleMapsBrowserKey,
  loadGoogleMaps,
  subscribeGoogleMapsAuthFailure,
} from "@/lib/maps/google-maps-loader";
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

type EditorProvider = "google" | "leaflet";

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

function validReferencePoints(points: GeoMapReferencePoint[]) {
  return points.filter((point) =>
    Number.isFinite(point.latitude)
    && Number.isFinite(point.longitude)
    && point.latitude >= -90 && point.latitude <= 90
    && point.longitude >= -180 && point.longitude <= 180
  );
}

export function GeoMapInput({ value, onChange, referenceBoundary, referencePoints = [], height = 320 }: GeoMapInputProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const providerRef = useRef<EditorProvider | null>(null);

  const leafletMapRef = useRef<Leaflet.Map | null>(null);
  const shapeLayerRef = useRef<Leaflet.LayerGroup | null>(null);
  const referenceLayerRef = useRef<Leaflet.LayerGroup | null>(null);
  const referencePointsLayerRef = useRef<Leaflet.LayerGroup | null>(null);

  const googleMapRef = useRef<any>(null);
  const googleMapsRef = useRef<any>(null);
  const googleOverlaysRef = useRef<any[]>([]);
  const googleClickListenerRef = useRef<any>(null);

  const valueRef = useRef(value);
  const referenceBoundaryRef = useRef(referenceBoundary);
  const referencePointsRef = useRef(referencePoints);
  valueRef.current = value;
  referenceBoundaryRef.current = referenceBoundary;
  referencePointsRef.current = referencePoints;

  const drawPointsRef = useRef<[number, number][]>([]);
  const drawingRef = useRef(false);
  const [drawing, setDrawing] = useState(false);
  const [pointCount, setPointCount] = useState(0);
  const [locating, setLocating] = useState(false);
  const [baseLabel, setBaseLabel] = useState("Preparando satélite…");

  function renderLeafletShape(L: typeof Leaflet, map: Leaflet.Map) {
    shapeLayerRef.current?.clearLayers();
    const geometry = parseGeometry(valueRef.current);
    if (!geometry || drawingRef.current) return;
    const rings = ringsToLatLngs(geometry);
    if (!rings.length) return;
    rings.forEach((ring) => {
      L.polygon(ring, { color: "#00C4D6", weight: 2, fillOpacity: 0.18 }).addTo(shapeLayerRef.current as Leaflet.LayerGroup);
    });
  }

  function renderLeafletReference(L: typeof Leaflet) {
    referenceLayerRef.current?.clearLayers();
    const boundary = referenceBoundaryRef.current;
    if (!boundary) return;
    const rings = ringsToLatLngs(boundary);
    rings.forEach((ring) => {
      L.polygon(ring, { color: "#B86F3E", weight: 1.5, dashArray: "4 4", fillOpacity: 0.05 })
        .addTo(referenceLayerRef.current as Leaflet.LayerGroup);
    });
  }

  function renderLeafletReferencePoints(L: typeof Leaflet) {
    referencePointsLayerRef.current?.clearLayers();
    for (const point of validReferencePoints(referencePointsRef.current)) {
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
  }

  function renderLeafletDrawing(L: typeof Leaflet) {
    shapeLayerRef.current?.clearLayers();
    const points = drawPointsRef.current;
    points.forEach((point) => {
      L.circleMarker(point, { radius: 5, color: "#00C4D6", fillColor: "#00C4D6", fillOpacity: 1 })
        .addTo(shapeLayerRef.current as Leaflet.LayerGroup);
    });
    if (points.length > 1) {
      L.polyline(points, { color: "#00C4D6", weight: 2 }).addTo(shapeLayerRef.current as Leaflet.LayerGroup);
    }
    if (points.length > 2) {
      L.polygon(points, { color: "#00C4D6", weight: 2, fillOpacity: 0.15, dashArray: "3 5" })
        .addTo(shapeLayerRef.current as Leaflet.LayerGroup);
    }
  }

  function fitLeafletMap(L: typeof Leaflet, map: Leaflet.Map) {
    if (drawingRef.current) return;
    const fitPositions: [number, number][] = [];
    const geometry = parseGeometry(valueRef.current);
    if (geometry) {
      fitPositions.push(...ringsToLatLngs(geometry).flat());
    } else if (referenceBoundaryRef.current) {
      fitPositions.push(...ringsToLatLngs(referenceBoundaryRef.current).flat());
    }
    for (const point of validReferencePoints(referencePointsRef.current)) {
      fitPositions.push([point.latitude, point.longitude]);
    }
    if (!fitPositions.length) return;
    const bounds = L.latLngBounds(fitPositions);
    if (bounds.isValid()) map.fitBounds(bounds, { padding: [36, 36], maxZoom: 18 });
  }

  function renderLeafletAll(L: typeof Leaflet, map: Leaflet.Map) {
    renderLeafletReference(L);
    renderLeafletReferencePoints(L);
    if (drawingRef.current) renderLeafletDrawing(L);
    else renderLeafletShape(L, map);
    fitLeafletMap(L, map);
  }

  function clearGoogleOverlays() {
    for (const overlay of googleOverlaysRef.current) {
      try { overlay?.setMap?.(null); } catch { /* noop */ }
    }
    googleOverlaysRef.current = [];
  }

  function addGoogleOverlay(overlay: any) {
    googleOverlaysRef.current.push(overlay);
    return overlay;
  }

  function googlePath(ring: [number, number][]) {
    return ring.map(([lat, lng]) => ({ lat, lng }));
  }

  function renderGoogleAll() {
    const maps = googleMapsRef.current;
    const map = googleMapRef.current;
    if (!maps || !map) return;

    clearGoogleOverlays();

    const reference = referenceBoundaryRef.current;
    if (reference) {
      for (const ring of ringsToLatLngs(reference)) {
        addGoogleOverlay(new maps.Polygon({
          map,
          paths: googlePath(ring),
          strokeColor: "#B86F3E",
          strokeOpacity: 0.9,
          strokeWeight: 2,
          fillColor: "#B86F3E",
          fillOpacity: 0.04,
          clickable: false,
        }));
      }
    }

    const current = parseGeometry(valueRef.current);
    if (current && !drawingRef.current) {
      for (const ring of ringsToLatLngs(current)) {
        addGoogleOverlay(new maps.Polygon({
          map,
          paths: googlePath(ring),
          strokeColor: "#00C4D6",
          strokeOpacity: 1,
          strokeWeight: 3,
          fillColor: "#00C4D6",
          fillOpacity: 0.16,
          clickable: false,
        }));
      }
    }

    for (const point of validReferencePoints(referencePointsRef.current)) {
      addGoogleOverlay(new maps.Circle({
        map,
        center: { lat: point.latitude, lng: point.longitude },
        radius: 5,
        strokeColor: "#ffffff",
        strokeOpacity: 1,
        strokeWeight: 2,
        fillColor: "#0E8A4B",
        fillOpacity: 1,
        clickable: false,
        zIndex: 6,
      }));
    }

    if (drawingRef.current) {
      const drawPath = googlePath(drawPointsRef.current);
      for (const [lat, lng] of drawPointsRef.current) {
        addGoogleOverlay(new maps.Circle({
          map,
          center: { lat, lng },
          radius: 3,
          strokeColor: "#ffffff",
          strokeOpacity: 1,
          strokeWeight: 1.5,
          fillColor: "#00C4D6",
          fillOpacity: 1,
          clickable: false,
          zIndex: 8,
        }));
      }
      if (drawPath.length > 1) {
        addGoogleOverlay(new maps.Polyline({
          map,
          path: drawPath,
          strokeColor: "#00C4D6",
          strokeOpacity: 1,
          strokeWeight: 3,
          clickable: false,
          zIndex: 7,
        }));
      }
      if (drawPath.length > 2) {
        addGoogleOverlay(new maps.Polygon({
          map,
          paths: drawPath,
          strokeColor: "#00C4D6",
          strokeOpacity: 1,
          strokeWeight: 3,
          fillColor: "#00C4D6",
          fillOpacity: 0.12,
          clickable: false,
          zIndex: 7,
        }));
      }
      return;
    }

    const fitPositions: [number, number][] = [];
    if (current) fitPositions.push(...ringsToLatLngs(current).flat());
    else if (reference) fitPositions.push(...ringsToLatLngs(reference).flat());
    for (const point of validReferencePoints(referencePointsRef.current)) {
      fitPositions.push([point.latitude, point.longitude]);
    }
    if (!fitPositions.length) return;

    const bounds = new maps.LatLngBounds();
    for (const [lat, lng] of fitPositions) bounds.extend({ lat, lng });
    if (!bounds.isEmpty()) {
      map.fitBounds(bounds, 36);
      maps.event.addListenerOnce(map, "idle", () => {
        const zoom = map.getZoom();
        if (typeof zoom === "number" && zoom > 19) map.setZoom(19);
      });
    }
  }

  function renderActiveMap() {
    if (providerRef.current === "google") {
      renderGoogleAll();
      return;
    }
    const map = leafletMapRef.current;
    if (!map) return;
    void import("leaflet").then((mod) => renderLeafletAll(mod.default, map));
  }

  useEffect(() => {
    drawingRef.current = drawing;
    renderActiveMap();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawing]);

  useEffect(() => {
    let cancelled = false;
    let cleanupResize: (() => void) | undefined;
    let unsubscribeAuthFailure: () => void = () => {};
    let leafletInitializing = false;

    const initializeLeaflet = async () => {
      if (cancelled || leafletInitializing || !containerRef.current || leafletMapRef.current) return;
      leafletInitializing = true;
      const mod = await import("leaflet");
      if (cancelled || !containerRef.current) return;
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

      providerRef.current = "leaflet";
      leafletMapRef.current = map;
      shapeLayerRef.current = L.layerGroup().addTo(map);
      referenceLayerRef.current = L.layerGroup().addTo(map);
      referencePointsLayerRef.current = L.layerGroup().addTo(map);

      containerRef.current.dataset.geoMapProvider = "leaflet";
      containerRef.current.dataset.geoMapBase = mapboxToken ? "satellite" : "street-fallback";
      setBaseLabel(mapboxToken ? "Satélite · Mapbox" : "Mapa de contingência");

      map.on("click", (event: Leaflet.LeafletMouseEvent) => {
        if (!drawingRef.current) return;
        drawPointsRef.current = [...drawPointsRef.current, [event.latlng.lat, event.latlng.lng]];
        setPointCount(drawPointsRef.current.length);
        renderLeafletDrawing(L);
      });

      const resizeObserver = new ResizeObserver(() => map.invalidateSize());
      resizeObserver.observe(containerRef.current);
      cleanupResize = () => resizeObserver.disconnect();

      renderLeafletAll(L, map);
    };

    const initializeGoogle = async () => {
      if (!containerRef.current) return;
      try {
        const maps = await loadGoogleMaps();
        if (cancelled || !containerRef.current) return;

        const map = new maps.Map(containerRef.current, {
          center: { lat: DEFAULT_CENTER[0], lng: DEFAULT_CENTER[1] },
          zoom: 4,
          mapTypeId: maps.MapTypeId?.SATELLITE ?? "satellite",
          mapTypeControl: true,
          mapTypeControlOptions: {
            mapTypeIds: [
              maps.MapTypeId?.SATELLITE ?? "satellite",
              maps.MapTypeId?.HYBRID ?? "hybrid",
              maps.MapTypeId?.ROADMAP ?? "roadmap",
            ],
          },
          streetViewControl: false,
          fullscreenControl: false,
          rotateControl: false,
          tilt: 0,
          gestureHandling: "greedy",
          backgroundColor: "#0c1512",
        });

        providerRef.current = "google";
        googleMapsRef.current = maps;
        googleMapRef.current = map;
        containerRef.current.dataset.geoMapProvider = "google";
        containerRef.current.dataset.geoMapBase = "satellite";
        setBaseLabel("Satélite · Google");

        googleClickListenerRef.current = map.addListener("click", (event: any) => {
          if (!drawingRef.current || !event?.latLng) return;
          const lat = Number(event.latLng.lat());
          const lng = Number(event.latLng.lng());
          if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
          drawPointsRef.current = [...drawPointsRef.current, [lat, lng]];
          setPointCount(drawPointsRef.current.length);
          renderGoogleAll();
        });

        renderGoogleAll();
      } catch {
        if (!cancelled) await initializeLeaflet();
      }
    };

    if (hasGoogleMapsBrowserKey()) {
      unsubscribeAuthFailure = subscribeGoogleMapsAuthFailure(() => {
        if (cancelled) return;
        try { googleClickListenerRef.current?.remove?.(); } catch { /* noop */ }
        clearGoogleOverlays();
        googleMapRef.current = null;
        googleMapsRef.current = null;
        providerRef.current = null;
        if (containerRef.current) containerRef.current.replaceChildren();
        void initializeLeaflet();
      });
      void initializeGoogle();
    } else {
      void initializeLeaflet();
    }

    return () => {
      cancelled = true;
      unsubscribeAuthFailure();
      cleanupResize?.();
      try { googleClickListenerRef.current?.remove?.(); } catch { /* noop */ }
      clearGoogleOverlays();
      if (googleMapsRef.current && googleMapRef.current) {
        try { googleMapsRef.current.event?.clearInstanceListeners?.(googleMapRef.current); } catch { /* noop */ }
      }
      googleMapRef.current = null;
      googleMapsRef.current = null;
      leafletMapRef.current?.remove();
      leafletMapRef.current = null;
      providerRef.current = null;
      if (containerRef.current) containerRef.current.replaceChildren();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    renderActiveMap();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, referenceBoundary, referencePoints]);

  function centerOnCurrentLocation() {
    if (!navigator.geolocation) return;
    if (!googleMapRef.current && !leafletMapRef.current) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const latitude = position.coords.latitude;
        const longitude = position.coords.longitude;
        if (providerRef.current === "google" && googleMapRef.current) {
          googleMapRef.current.setCenter({ lat: latitude, lng: longitude });
          googleMapRef.current.setZoom(17);
        } else {
          leafletMapRef.current?.setView([latitude, longitude], 17);
        }
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
  }

  function finishDrawing() {
    if (drawPointsRef.current.length < 3) return;
    const geometry = pointsToGeometry(drawPointsRef.current);
    onChange(JSON.stringify(geometry));
    drawPointsRef.current = [];
    setPointCount(0);
    setDrawing(false);
  }

  function cancelDrawing() {
    drawPointsRef.current = [];
    setPointCount(0);
    setDrawing(false);
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
            <span className="geo-map-base-badge"><Icon name="map" size={12}/>{baseLabel}</span>
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
