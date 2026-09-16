"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";
import type * as Leaflet from "leaflet";
import { spatialGeometryPositions, type PortfolioCanvasField } from "@/components/spatial-map-types";
import { loadGoogleMaps } from "@/lib/maps/google-maps-loader";
import { resolveSpatialMapProvider } from "@/lib/maps/spatial-map-provider";

function LeafletPortfolioCanvas({ fields, height, onFieldClick, providerNote }: {
  fields: PortfolioCanvasField[];
  height: number;
  onFieldClick: (fieldId: string) => void;
  providerNote?: string | null;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    let map: Leaflet.Map | null = null;
    let resizeObserver: ResizeObserver | null = null;
    let delayedInvalidate: ReturnType<typeof setTimeout> | undefined;

    void import("leaflet").then((mod) => {
      if (cancelled || !containerRef.current) return;
      const L = mod.default;
      map = L.map(containerRef.current, { attributionControl: true, preferCanvas: true }).setView([-15.7797, -47.9297], 4);

      // Fundo de contingência sob a imagem aérea: evita quadrantes vazios/pretos quando um tile Esri falha.
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: "&copy; OpenStreetMap contributors",
      }).addTo(map);
      L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
        maxZoom: 19,
        attribution: "Tiles &copy; Esri",
      }).addTo(map);
      L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager_only_labels/{z}/{x}/{y}{r}.png", {
        maxZoom: 19,
        opacity: 0.85,
        attribution: "&copy; OpenStreetMap contributors &copy; CARTO",
      }).addTo(map);

      const bounds: [number, number][] = [];
      for (const field of fields) {
        if (field.rasterOverlay) {
          L.imageOverlay(field.rasterOverlay.url, field.rasterOverlay.bounds, {
            opacity: field.rasterOverlay.opacity ?? 0.82,
            interactive: false,
          }).addTo(map);
        }
        const positions = spatialGeometryPositions(field.boundary);
        if (!positions.length) continue;
        const polygon = L.geoJSON({ type: "Feature", properties: {}, geometry: field.boundary } as any, {
          style: {
            color: field.strokeColor,
            weight: 2.5,
            fillColor: field.fillColor,
            fillOpacity: field.rasterOverlay ? 0 : field.fillOpacity,
          },
        }).addTo(map);
        polygon.bindTooltip(`${field.name} — ${field.label}`, { direction: "top" });
        polygon.on("click", () => onFieldClick(field.id));
        bounds.push(...positions.map(([longitude, latitude]) => [latitude, longitude] as [number, number]));
      }
      if (bounds.length) {
        const latLngBounds = L.latLngBounds(bounds);
        if (latLngBounds.isValid()) map.fitBounds(latLngBounds, { padding: [28, 28], maxZoom: 16 });
      }

      requestAnimationFrame(() => map?.invalidateSize({ pan: false }));
      delayedInvalidate = setTimeout(() => map?.invalidateSize({ pan: false }), 250);
      resizeObserver = new ResizeObserver(() => map?.invalidateSize({ pan: false }));
      resizeObserver.observe(containerRef.current);
    });

    return () => {
      cancelled = true;
      if (delayedInvalidate) clearTimeout(delayedInvalidate);
      resizeObserver?.disconnect();
      map?.remove();
    };
  }, [fields, height, onFieldClick]);

  return (
    <>
      {providerNote && <p className="ndvi-panel-limitation">{providerNote}</p>}
      <div ref={containerRef} className="portfolio-map-canvas" style={{ height }} />
    </>
  );
}

function GooglePortfolioCanvas({ fields, height, onFieldClick, onProviderFailure }: {
  fields: PortfolioCanvasField[];
  height: number;
  onFieldClick: (fieldId: string) => void;
  onProviderFailure: () => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    let maps: any = null;
    let map: any = null;
    const groundOverlays: any[] = [];
    let clickListener: any = null;

    void loadGoogleMaps()
      .then((loadedMaps) => {
        if (cancelled || !containerRef.current) return;
        maps = loadedMaps;
        const firstPosition = fields.flatMap((field) => spatialGeometryPositions(field.boundary)).at(0) ?? [-47.9297, -15.7797];
        map = new maps.Map(containerRef.current, {
          center: { lat: firstPosition[1], lng: firstPosition[0] },
          zoom: fields.length ? 14 : 4,
          mapTypeId: maps.MapTypeId?.SATELLITE ?? "satellite",
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
          rotateControl: false,
          tilt: 0,
          gestureHandling: "greedy",
          backgroundColor: "#0c1512",
        });

        const features = fields.map((field) => ({
          type: "Feature",
          properties: {
            fieldId: field.id,
            name: field.name,
            label: field.label,
            strokeColor: field.strokeColor,
            fillColor: field.fillColor,
            fillOpacity: field.rasterOverlay ? 0 : field.fillOpacity,
          },
          geometry: field.boundary,
        }));
        map.data.addGeoJson({ type: "FeatureCollection", features });
        map.data.setStyle((feature: any) => ({
          strokeColor: String(feature.getProperty("strokeColor") ?? "#00C4D6"),
          strokeWeight: 2.5,
          fillColor: String(feature.getProperty("fillColor") ?? "#00C4D6"),
          fillOpacity: Number(feature.getProperty("fillOpacity") ?? 0.1),
        }));
        clickListener = map.data.addListener("click", (event: any) => {
          const fieldId = String(event.feature.getProperty("fieldId") ?? "");
          if (fieldId) onFieldClick(fieldId);
        });

        for (const field of fields) {
          if (!field.rasterOverlay) continue;
          const [[south, west], [north, east]] = field.rasterOverlay.bounds;
          const overlay = new maps.GroundOverlay(
            field.rasterOverlay.url,
            { south, west, north, east },
            { opacity: field.rasterOverlay.opacity ?? 0.82, clickable: false },
          );
          overlay.setMap(map);
          groundOverlays.push(overlay);
        }

        const bounds = new maps.LatLngBounds();
        for (const field of fields) {
          for (const [longitude, latitude] of spatialGeometryPositions(field.boundary)) bounds.extend({ lat: latitude, lng: longitude });
        }
        if (!bounds.isEmpty()) {
          map.fitBounds(bounds, 28);
          maps.event.addListenerOnce(map, "idle", () => {
            const zoom = map.getZoom();
            if (typeof zoom === "number" && zoom > 18) map.setZoom(18);
          });
        }
      })
      .catch(() => {
        if (!cancelled) onProviderFailure();
      });

    return () => {
      cancelled = true;
      try { clickListener?.remove?.(); } catch { /* noop */ }
      for (const overlay of groundOverlays) {
        try { overlay.setMap?.(null); } catch { /* noop */ }
      }
      try { if (maps && map) maps.event?.clearInstanceListeners?.(map); } catch { /* noop */ }
      if (containerRef.current) containerRef.current.replaceChildren();
    };
  }, [fields, height, onFieldClick, onProviderFailure]);

  return <div ref={containerRef} className="portfolio-map-canvas" style={{ height }} />;
}

export function SpatialPortfolioMapCanvas({ fields, height = 420, onFieldClick }: {
  fields: PortfolioCanvasField[];
  height?: number;
  onFieldClick: (fieldId: string) => void;
}) {
  const resolution = useMemo(() => resolveSpatialMapProvider(), []);
  const [googleFailed, setGoogleFailed] = useState(false);
  const failGoogle = useCallback(() => setGoogleFailed(true), []);

  if (resolution.provider === "GOOGLE" && !googleFailed) {
    return <GooglePortfolioCanvas fields={fields} height={height} onFieldClick={onFieldClick} onProviderFailure={failGoogle} />;
  }

  const providerNote = googleFailed
    ? "Google Satellite ficou indisponível nesta sessão; a RAIZ ativou o mapa-base de contingência sem alterar o raster NDVI nem as geometrias."
    : resolution.reason === "GOOGLE_KEY_MISSING"
      ? "Google Satellite está selecionado, mas a chave pública ainda não foi vinculada; usando mapa-base de contingência."
      : null;
  return <LeafletPortfolioCanvas fields={fields} height={height} onFieldClick={onFieldClick} providerNote={providerNote} />;
}
