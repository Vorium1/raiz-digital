"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/icon";
import {
  effectivePointCoordinates,
  pointPositionKind,
  spatialGeometryPositions,
  type FieldMapProps,
  type MapLegendEntry,
  type MapPoint,
  type PointPositionKind,
} from "@/components/spatial-map-types";
import {
  GOOGLE_MAPS_TILE_HEALTH_TIMEOUT_MS,
  loadGoogleMaps,
  subscribeGoogleMapsAuthFailure,
} from "@/lib/maps/google-maps-loader";

function positionDescription(point: MapPoint) {
  const kind = pointPositionKind(point);
  if (kind === "OBSERVED") return "GPS observado em campo";
  if (kind === "AUDITED_SOURCE") return "Coordenada real importada e auditada";
  return "Posição planejada";
}

function isMeasuredOrAudited(kind: PointPositionKind) {
  return kind !== "PLANNED";
}

export function GoogleFieldMap({
  boundary,
  points,
  height = 360,
  colorFor,
  legend,
  hint = "Clique num ponto para ver os dados",
  boundaryFillColor,
  imageOverlay,
  baseLayer = "default",
  selectedPointId = null,
  onPointSelect,
  onProviderFailure,
}: FieldMapProps & { onProviderFailure?: (error: Error) => void }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const onPointSelectRef = useRef(onPointSelect);
  const [selectedPoint, setSelectedPoint] = useState<MapPoint | null>(null);
  const [tilesReady, setTilesReady] = useState(false);
  onPointSelectRef.current = onPointSelect;

  useEffect(() => {
    setSelectedPoint(selectedPointId ? points.find((point) => point.id === selectedPointId) ?? null : null);
  }, [selectedPointId, points]);

  function defaultColor(point: MapPoint) {
    const collected = Boolean(point.collectedAt);
    return { stroke: collected ? "#00C4D6" : "#B86F3E", fill: collected ? "#00C4D6" : "#F2C879", fillOpacity: collected ? 0.9 : 0.6 };
  }

  useEffect(() => {
    let cancelled = false;
    let maps: any = null;
    let map: any = null;
    let groundOverlay: any = null;
    let clickListener: any = null;
    let tilesLoadedListener: any = null;
    let tileHealthTimer: ReturnType<typeof setTimeout> | undefined;
    let unsubscribeAuthFailure: () => void = () => {};

    const failProvider = (error: Error) => {
      if (!cancelled) onProviderFailure?.(error);
    };

    setTilesReady(false);
    unsubscribeAuthFailure = subscribeGoogleMapsAuthFailure(failProvider);

    void loadGoogleMaps()
      .then((loadedMaps) => {
        if (cancelled || !containerRef.current) return;
        maps = loadedMaps;
        const positions = spatialGeometryPositions(boundary);
        const first = positions[0] ?? [-47.9297, -15.7797];
        map = new maps.Map(containerRef.current, {
          center: { lat: first[1], lng: first[0] },
          zoom: positions.length ? 16 : 4,
          mapTypeId: baseLayer === "terrain"
            ? (maps.MapTypeId?.TERRAIN ?? "terrain")
            : (maps.MapTypeId?.SATELLITE ?? "satellite"),
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
          rotateControl: false,
          tilt: 0,
          gestureHandling: "greedy",
          backgroundColor: "#0c1512",
        });

        let tilesConfirmed = false;
        tilesLoadedListener = maps.event.addListenerOnce(map, "tilesloaded", () => {
          tilesConfirmed = true;
          if (tileHealthTimer) clearTimeout(tileHealthTimer);
          if (!cancelled) setTilesReady(true);
        });
        tileHealthTimer = setTimeout(() => {
          if (!tilesConfirmed) {
            failProvider(new Error("Google Satellite não confirmou o carregamento dos tiles dentro do limite; usando contingência."));
          }
        }, GOOGLE_MAPS_TILE_HEALTH_TIMEOUT_MS);

        const featureCollection = {
          type: "FeatureCollection",
          features: [
            { type: "Feature", properties: { kind: "boundary" }, geometry: boundary },
            ...points.map((point) => {
              const effective = effectivePointCoordinates(point);
              return {
                type: "Feature",
                properties: { kind: "point", pointId: point.id },
                geometry: { type: "Point", coordinates: [effective.longitude, effective.latitude] },
              };
            }),
          ],
        };
        map.data.addGeoJson(featureCollection);
        const pointsById = new Map(points.map((point) => [point.id, point]));
        map.data.setStyle((feature: any) => {
          const kind = feature.getProperty("kind");
          if (kind === "boundary") {
            return {
              strokeColor: boundaryFillColor ?? "#00C4D6",
              strokeWeight: 3,
              fillColor: boundaryFillColor ?? "#00C4D6",
              fillOpacity: imageOverlay ? 0 : boundaryFillColor ? 0.35 : 0.08,
              clickable: false,
            };
          }
          const pointId = String(feature.getProperty("pointId") ?? "");
          const point = pointsById.get(pointId);
          if (!point) return { visible: false };
          const palette = colorFor ? colorFor(point) : defaultColor(point);
          const positionKind = pointPositionKind(point);
          const trustedPosition = isMeasuredOrAudited(positionKind);
          return {
            icon: {
              path: maps.SymbolPath.CIRCLE,
              scale: trustedPosition ? 7 : 6,
              fillColor: palette.fill,
              fillOpacity: trustedPosition ? palette.fillOpacity : Math.min(palette.fillOpacity, 0.55),
              strokeColor: palette.stroke,
              strokeOpacity: 1,
              strokeWeight: trustedPosition ? 2 : 3,
            },
            zIndex: positionKind === "OBSERVED" ? 5 : positionKind === "AUDITED_SOURCE" ? 4 : 3,
          };
        });

        clickListener = map.data.addListener("click", (event: any) => {
          const pointId = String(event.feature.getProperty("pointId") ?? "");
          const point = pointsById.get(pointId);
          if (point) {
            setSelectedPoint(point);
            onPointSelectRef.current?.(point);
          }
        });

        if (imageOverlay) {
          const [[south, west], [north, east]] = imageOverlay.bounds;
          groundOverlay = new maps.GroundOverlay(
            imageOverlay.url,
            { south, west, north, east },
            { opacity: imageOverlay.opacity ?? 0.78, clickable: false },
          );
          groundOverlay.setMap(map);
        }

        const bounds = new maps.LatLngBounds();
        for (const [longitude, latitude] of positions) bounds.extend({ lat: latitude, lng: longitude });
        for (const point of points) {
          const effective = effectivePointCoordinates(point);
          bounds.extend({ lat: effective.latitude, lng: effective.longitude });
        }
        if (!bounds.isEmpty()) {
          map.fitBounds(bounds, 28);
          maps.event.addListenerOnce(map, "idle", () => {
            const zoom = map.getZoom();
            if (typeof zoom === "number" && zoom > 19) map.setZoom(19);
          });
        }
      })
      .catch((caught) => {
        failProvider(caught instanceof Error ? caught : new Error("Falha ao carregar Google Maps."));
      });

    return () => {
      cancelled = true;
      if (tileHealthTimer) clearTimeout(tileHealthTimer);
      unsubscribeAuthFailure();
      try { tilesLoadedListener?.remove?.(); } catch { /* noop */ }
      try { clickListener?.remove?.(); } catch { /* noop */ }
      try { groundOverlay?.setMap?.(null); } catch { /* noop */ }
      try { if (maps && map) maps.event?.clearInstanceListeners?.(map); } catch { /* noop */ }
      if (containerRef.current) containerRef.current.replaceChildren();
    };
  }, [boundary, points, colorFor, boundaryFillColor, imageOverlay, baseLayer, onProviderFailure]);

  const defaultLegend: MapLegendEntry[] = [{ label: "Coletado", color: "#00C4D6" }, { label: "Pendente", color: "#B86F3E" }];
  const activeLegend = legend ?? defaultLegend;
  const showAgronomicFields = selectedPoint && selectedPoint.value !== undefined;
  const hasPlannedOnlyPoints = points.some((point) => pointPositionKind(point) === "PLANNED");
  const hasAuditedSourcePoints = points.some((point) => pointPositionKind(point) === "AUDITED_SOURCE");
  const selectedCoordinates = selectedPoint ? effectivePointCoordinates(selectedPoint) : null;

  return (
    <div
      className="real-field-map"
      data-map-provider="google"
      data-map-ready={tilesReady ? "true" : "false"}
      data-has-image-overlay={imageOverlay ? "true" : "false"}
    >
      <div style={{ position: "relative" }}>
        <div ref={containerRef} className="real-field-map-canvas" style={{ height }} />
        {!tilesReady && (
          <div
            role="status"
            className="real-field-map-loading"
            style={{
              position: "absolute",
              inset: 0,
              display: "grid",
              placeItems: "center",
              background: "#edf0f3",
              zIndex: 2,
              fontWeight: 700,
            }}
          >
            {baseLayer === "terrain" ? "Preparando base topográfica…" : "Preparando mapa de satélite…"}
          </div>
        )}
      </div>
      <div className="real-field-map-legend">
        {activeLegend.map((entry) => <span key={entry.label}><i style={{ background: entry.color }}/>{entry.label}</span>)}
        {hasAuditedSourcePoints && <span className="portfolio-map-note">Fonte espacial auditada = coordenada real preservada no banco</span>}
        {hasPlannedOnlyPoints && <span className="portfolio-map-note">Ponto sem GPS/fonte real = posição planejada</span>}
        <span className="real-field-map-hint">{hint}</span>
      </div>
      {selectedPoint && selectedCoordinates && (
        <div className="real-field-map-panel">
          <div className="real-field-map-panel-head">
            <strong>{selectedPoint.code}</strong>
            <button type="button" className="icon-button" aria-label="Fechar" onClick={() => { setSelectedPoint(null); onPointSelectRef.current?.(null); }}><Icon name="close" size={13}/></button>
          </div>
          <dl>
            <div><dt>Status</dt><dd>{pointPositionKind(selectedPoint) === "PLANNED" ? "Planejado" : selectedPoint.collectedAt ? "Coletado" : "Coordenada real"}</dd></div>
            {showAgronomicFields && (
              <>
                <div><dt>Valor</dt><dd>{selectedPoint.value != null ? `${selectedPoint.value} ${selectedPoint.unit ?? ""}` : "Sem resultado"}</dd></div>
                <div><dt>Classificação</dt><dd>{selectedPoint.classification ?? (selectedPoint.notInterpretableReason ? "Não interpretável" : "—")}</dd></div>
                {selectedPoint.notInterpretableReason && <div><dt>Motivo</dt><dd className="real-field-map-reason">{selectedPoint.notInterpretableReason}</dd></div>}
                {selectedPoint.method && <div><dt>Método</dt><dd>{selectedPoint.method}</dd></div>}
              </>
            )}
            <div><dt>Posição exibida</dt><dd>{positionDescription(selectedPoint)}</dd></div>
            <div><dt>Coordenadas</dt><dd>{selectedCoordinates.latitude.toFixed(7)}, {selectedCoordinates.longitude.toFixed(7)}</dd></div>
            {pointPositionKind(selectedPoint) === "PLANNED" && <div><dt>Validação</dt><dd className="real-field-map-reason">Sem captura GPS observada nem fonte espacial real auditada. Esta coordenada é de planejamento e não deve ser tratada como posição medida em campo.</dd></div>}
            {pointPositionKind(selectedPoint) === "AUDITED_SOURCE" && <div><dt>Proveniência</dt><dd>Coordenada real importada de fonte espacial auditada; a origem declarada permanece registrada em “Origem GPS”.</dd></div>}
            <div><dt>Profundidade</dt><dd>{selectedPoint.depthFromCm}–{selectedPoint.depthToCm} cm</dd></div>
            {selectedPoint.collectedAt && <div><dt>Coletado em</dt><dd>{new Date(selectedPoint.collectedAt).toLocaleString("pt-BR")}</dd></div>}
            {selectedPoint.gpsSource && <div><dt>Origem GPS</dt><dd>{selectedPoint.gpsSource}</dd></div>}
            {selectedPoint.accuracyM != null && <div><dt>Precisão registrada</dt><dd>±{selectedPoint.accuracyM} m</dd></div>}
            <div><dt>Resultados de laudo</dt><dd>{selectedPoint.labResultCount}</dd></div>
            {selectedPoint.notes && <div><dt>Observação</dt><dd>{selectedPoint.notes}</dd></div>}
          </dl>
        </div>
      )}
    </div>
  );
}
