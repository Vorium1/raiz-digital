"use client";

import { useEffect, useMemo, useRef } from "react";
import { spatialGeometryPositions, type SpatialGeometry } from "@/components/spatial-map-types";
import { loadGoogleMaps, subscribeGoogleMapsAuthFailure } from "@/lib/maps/google-maps-loader";
import { monitorGoogle3DHealth } from "@/lib/maps/google-3d-health";

function outerRings(geometry: SpatialGeometry): Array<Array<[number, number]>> {
  const raw = geometry.coordinates as any;
  if (geometry.type === "Polygon") {
    const ring = Array.isArray(raw?.[0]) ? raw[0] : [];
    return ring.length ? [ring] : [];
  }
  if (geometry.type === "MultiPolygon") {
    return Array.isArray(raw)
      ? raw.map((polygon: any) => Array.isArray(polygon?.[0]) ? polygon[0] : []).filter((ring: any[]) => ring.length)
      : [];
  }
  return [];
}

function cameraFor(geometry: SpatialGeometry) {
  const positions = spatialGeometryPositions(geometry);
  if (!positions.length) {
    return { center: { lat: -28.25, lng: -52.4, altitude: 0 }, range: 2200 };
  }
  const xs = positions.map(([x]) => x);
  const ys = positions.map(([, y]) => y);
  const west = Math.min(...xs);
  const east = Math.max(...xs);
  const south = Math.min(...ys);
  const north = Math.max(...ys);
  const lat = (south + north) / 2;
  const lng = (west + east) / 2;
  const latMeters = Math.max(1, (north - south) * 111_320);
  const lngMeters = Math.max(1, (east - west) * 111_320 * Math.cos((lat * Math.PI) / 180));
  const span = Math.max(latMeters, lngMeters);
  return {
    center: { lat, lng, altitude: 0 },
    range: Math.min(5000, Math.max(650, span * 3.2)),
  };
}

export function GoogleFieldTerrain3D({
  boundary,
  height = 390,
  onFailure,
}: {
  boundary: SpatialGeometry;
  height?: number;
  onFailure?: (error: Error) => void;
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const camera = useMemo(() => cameraFor(boundary), [boundary]);

  useEffect(() => {
    let cancelled = false;
    let mapElement: any = null;
    let stopHealthCheck = () => {};
    let failed = false;
    const fail = (error: Error) => {
      if (cancelled || failed) return;
      failed = true;
      clearTimeout(loadTimeout);
      stopHealthCheck();
      onFailure?.(error);
    };
    // Includes a hanging importLibrary(), not only a missing script.
    const loadTimeout = setTimeout(() => fail(new Error("Tempo limite ao abrir o relevo 3D.")), 30_000);
    const unsubscribeAuth = subscribeGoogleMapsAuthFailure(fail);

    void loadGoogleMaps()
      .then(async (maps) => {
        if (cancelled || failed || !hostRef.current) return;
        if (typeof maps.importLibrary !== "function") throw new Error("Google Maps 3D indisponível nesta sessão.");

        const library = await maps.importLibrary("maps3d") as any;
        if (cancelled || failed || !hostRef.current) return;

        const { Map3DElement, Polygon3DElement } = library;
        if (!Map3DElement || !Polygon3DElement) throw new Error("Biblioteca Google Maps 3D não foi carregada.");

        mapElement = new Map3DElement({
          center: camera.center,
          range: camera.range,
          tilt: 67.5,
          heading: 330,
          mode: "SATELLITE",
          gestureHandling: "COOPERATIVE",
          defaultUIHidden: false,
        });
        mapElement.style.width = "100%";
        mapElement.style.height = `${height}px`;
        mapElement.style.display = "block";

        for (const ring of outerRings(boundary)) {
          const polygon = new Polygon3DElement({
            strokeColor: "#00E5C6E6",
            strokeWidth: 5,
            fillColor: "#00E5C624",
            drawsOccludedSegments: false,
          });
          polygon.path = ring.map(([lng, lat]) => ({ lat, lng }));
          mapElement.append(polygon);
        }

        stopHealthCheck = monitorGoogle3DHealth(mapElement, fail);
        clearTimeout(loadTimeout);
        hostRef.current.replaceChildren(mapElement);
      })
      .catch((caught) => {
        fail(caught instanceof Error ? caught : new Error("Não foi possível abrir o relevo 3D."));
      });

    return () => {
      cancelled = true;
      clearTimeout(loadTimeout);
      stopHealthCheck();
      unsubscribeAuth();
      try { mapElement?.remove?.(); } catch { /* noop */ }
      if (hostRef.current) hostRef.current.replaceChildren();
    };
  }, [boundary, camera, height, onFailure]);

  return (
    <div className="google-field-terrain-3d" data-map-provider="google-3d">
      <div ref={hostRef} className="google-field-terrain-3d-canvas" style={{ height }} />
      <div className="google-field-terrain-3d-note">Satélite 3D · arraste para girar e incline para enxergar o relevo</div>
    </div>
  );
}
