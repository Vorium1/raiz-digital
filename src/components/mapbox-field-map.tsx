"use client";

import { useEffect, useRef } from "react";
import {
  effectivePointCoordinates,
  spatialGeometryPositions,
  type FieldMapProps,
} from "@/components/spatial-map-types";
import { loadMapboxGl } from "@/lib/maps/mapbox-loader";

function defaultColor(collected: boolean) {
  return collected ? "#00C4D6" : "#B86F3E";
}

export function MapboxFieldMap({
  boundary,
  points,
  height = 360,
  colorFor,
  imageOverlay,
  hint = "Clique num ponto para ver os dados",
  boundaryFillColor,
  onProviderFailure,
}: FieldMapProps & { onProviderFailure?: (error: Error) => void }) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    let map: any = null;

    void loadMapboxGl()
      .then((mapboxgl) => {
        if (cancelled || !containerRef.current) return;

        const positions = spatialGeometryPositions(boundary);
        const first = positions[0] ?? [-52.4, -28.2];

        map = new mapboxgl.Map({
          container: containerRef.current,
          style: "mapbox://styles/mapbox/standard-satellite",
          center: first,
          zoom: positions.length ? 16 : 4,
          pitch: 32,
          bearing: 0,
          antialias: true,
          attributionControl: true,
          config: {
            basemap: {
              lightPreset: "day",
              showPlaceLabels: false,
              showPointOfInterestLabels: false,
              showRoadLabels: false,
              showTransitLabels: false,
            },
          },
        });

        map.addControl(new mapboxgl.NavigationControl({ visualizePitch: true }), "top-left");

        map.on("error", (event: any) => {
          const error = event?.error instanceof Error ? event.error : new Error("Falha no mapa Mapbox.");
          onProviderFailure?.(error);
        });

        map.on("load", () => {
          if (cancelled) return;

          map.addSource("raiz-boundary", {
            type: "geojson",
            data: { type: "Feature", properties: {}, geometry: boundary },
          });
          map.addLayer({
            id: "raiz-boundary-fill",
            type: "fill",
            source: "raiz-boundary",
            paint: {
              "fill-color": boundaryFillColor ?? "#00C4D6",
              "fill-opacity": imageOverlay ? 0.03 : 0.08,
            },
          });
          map.addLayer({
            id: "raiz-boundary-line",
            type: "line",
            source: "raiz-boundary",
            paint: {
              "line-color": boundaryFillColor ?? "#00C4D6",
              "line-width": 3,
            },
          });

          if (imageOverlay) {
            const [[south, west], [north, east]] = imageOverlay.bounds;
            map.addSource("raiz-raster", {
              type: "image",
              url: imageOverlay.url,
              coordinates: [
                [west, north],
                [east, north],
                [east, south],
                [west, south],
              ],
            });
            map.addLayer({
              id: "raiz-raster",
              type: "raster",
              source: "raiz-raster",
              paint: { "raster-opacity": imageOverlay.opacity ?? 0.62 },
            }, "raiz-boundary-line");
          }

          if (points.length) {
            const features = points.map((point) => {
              const effective = effectivePointCoordinates(point);
              const palette = colorFor
                ? colorFor(point)
                : { stroke: defaultColor(Boolean(point.collectedAt)), fill: defaultColor(Boolean(point.collectedAt)), fillOpacity: 0.9 };
              return {
                type: "Feature",
                geometry: { type: "Point", coordinates: [effective.longitude, effective.latitude] },
                properties: {
                  id: point.id,
                  code: point.code,
                  fill: palette.fill,
                  stroke: palette.stroke,
                  fillOpacity: palette.fillOpacity,
                  collectedAt: point.collectedAt ?? "",
                },
              };
            });
            map.addSource("raiz-points", {
              type: "geojson",
              data: { type: "FeatureCollection", features },
            });
            map.addLayer({
              id: "raiz-points",
              type: "circle",
              source: "raiz-points",
              paint: {
                "circle-radius": 7,
                "circle-color": ["get", "fill"],
                "circle-opacity": ["get", "fillOpacity"],
                "circle-stroke-color": ["get", "stroke"],
                "circle-stroke-width": 2,
              },
            });

            map.on("click", "raiz-points", (event: any) => {
              const feature = event.features?.[0];
              if (!feature) return;
              const coords = feature.geometry.coordinates;
              const code = String(feature.properties?.code ?? "Ponto");
              new mapboxgl.Popup({ closeButton: true, closeOnClick: true })
                .setLngLat(coords)
                .setHTML(`<strong>${code}</strong><br><small>${hint}</small>`)
                .addTo(map);
            });
            map.on("mouseenter", "raiz-points", () => { map.getCanvas().style.cursor = "pointer"; });
            map.on("mouseleave", "raiz-points", () => { map.getCanvas().style.cursor = ""; });
          }

          const all = [
            ...positions,
            ...points.map((point) => {
              const effective = effectivePointCoordinates(point);
              return [effective.longitude, effective.latitude] as [number, number];
            }),
          ];
          if (all.length) {
            const xs = all.map(([x]) => x);
            const ys = all.map(([, y]) => y);
            map.fitBounds(
              [[Math.min(...xs), Math.min(...ys)], [Math.max(...xs), Math.max(...ys)]],
              { padding: 34, maxZoom: 18, duration: 0 },
            );
          }
        });
      })
      .catch((caught) => {
        if (!cancelled) onProviderFailure?.(caught instanceof Error ? caught : new Error("Falha ao carregar Mapbox."));
      });

    return () => {
      cancelled = true;
      try { map?.remove?.(); } catch { /* noop */ }
    };
  }, [boundary, points, height, colorFor, imageOverlay, hint, boundaryFillColor, onProviderFailure]);

  return (
    <div className="real-field-map mapbox-field-map" data-map-provider="mapbox" data-has-image-overlay={imageOverlay ? "true" : "false"}>
      <div ref={containerRef} className="real-field-map-canvas" style={{ height }} />
      <div className="real-field-map-legend">
        <span className="real-field-map-hint">{hint}</span>
      </div>
    </div>
  );
}
