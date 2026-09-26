"use client";

import { useEffect, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";
import type * as Leaflet from "leaflet";
import { Icon } from "@/components/icon";
import {
  MAP_NEUTRAL_COLOR as NEUTRAL,
  effectivePointCoordinates,
  pointPositionKind,
  spatialGeometryPositions,
  type FieldMapProps,
  type MapLegendEntry,
  type MapPoint,
  type PointPositionKind,
} from "@/components/spatial-map-types";

function positionDescription(point: MapPoint) {
  const kind = pointPositionKind(point);
  if (kind === "OBSERVED") return "GPS observado em campo";
  if (kind === "AUDITED_SOURCE") return "Coordenada real importada e auditada";
  return "Posição planejada";
}

function isMeasuredOrAudited(kind: PointPositionKind) {
  return kind !== "PLANNED";
}

export function LeafletFieldMap({
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
  providerNote,
}: FieldMapProps & { providerNote?: string | null }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<Leaflet.Map | null>(null);
  const layersRef = useRef<Record<string, Leaflet.LayerGroup>>({});
  const latestRef = useRef({ boundary, points, colorFor, boundaryFillColor, imageOverlay });
  const onSelectRef = useRef<(point: MapPoint) => void>(() => {});
  const onPointSelectRef = useRef(onPointSelect);
  const [selectedPoint, setSelectedPoint] = useState<MapPoint | null>(null);
  latestRef.current = { boundary, points, colorFor, boundaryFillColor, imageOverlay };
  onPointSelectRef.current = onPointSelect;
  onSelectRef.current = (point) => {
    setSelectedPoint(point);
    onPointSelectRef.current?.(point);
  };

  function defaultColor(point: MapPoint) {
    const collected = Boolean(point.collectedAt);
    return { stroke: collected ? "#00C4D6" : "#B86F3E", fill: collected ? "#00C4D6" : "#F2C879", fillOpacity: collected ? 0.9 : 0.6 };
  }

  function drawLayers(L: typeof Leaflet, map: Leaflet.Map) {
    const rasterLayer = layersRef.current.raster;
    const boundaryLayer = layersRef.current.boundary;
    const pointsLayer = layersRef.current.points;
    if (!rasterLayer || !boundaryLayer || !pointsLayer) return;
    rasterLayer.clearLayers();
    boundaryLayer.clearLayers();
    pointsLayer.clearLayers();

    const current = latestRef.current;
    const boundaryPositions = spatialGeometryPositions(current.boundary);

    if (current.imageOverlay) {
      L.imageOverlay(current.imageOverlay.url, current.imageOverlay.bounds, {
        opacity: current.imageOverlay.opacity ?? 0.78,
        interactive: false,
      }).addTo(rasterLayer);
    }

    L.geoJSON({ type: "Feature", properties: {}, geometry: current.boundary } as any, {
      style: {
        color: current.boundaryFillColor ?? "#00C4D6",
        weight: 3,
        fillColor: current.boundaryFillColor ?? "#00C4D6",
        fillOpacity: current.imageOverlay ? 0 : current.boundaryFillColor ? 0.35 : 0.08,
      },
    }).addTo(boundaryLayer);

    const bounds: [number, number][] = boundaryPositions.map(([longitude, latitude]) => [latitude, longitude]);
    current.points.forEach((point) => {
      const palette = current.colorFor ? current.colorFor(point) : defaultColor(point);
      const positionKind = pointPositionKind(point);
      const trustedPosition = isMeasuredOrAudited(positionKind);
      const effective = effectivePointCoordinates(point);
      const marker = L.circleMarker([effective.latitude, effective.longitude], {
        radius: trustedPosition ? 7 : 6,
        color: palette.stroke,
        fillColor: palette.fill,
        fillOpacity: trustedPosition ? palette.fillOpacity : Math.min(palette.fillOpacity, 0.55),
        weight: 2,
        dashArray: positionKind === "PLANNED" ? "4 3" : undefined,
      }).addTo(pointsLayer);
      marker.on("click", () => onSelectRef.current(point));
      marker.bindTooltip(`${point.code} · ${positionDescription(point)}`, { direction: "top", offset: [0, -8] });
      bounds.push([effective.latitude, effective.longitude]);
    });

    if (bounds.length) {
      const latLngBounds = L.latLngBounds(bounds);
      if (latLngBounds.isValid()) map.fitBounds(latLngBounds, { padding: [28, 28], maxZoom: 18 });
    }
  }

  useEffect(() => {
    let cancelled = false;
    let cleanupResize: (() => void) | undefined;
    let delayedInvalidate: ReturnType<typeof setTimeout> | undefined;

    void import("leaflet").then((mod) => {
      if (cancelled || !containerRef.current || mapRef.current) return;
      const L = mod.default;
      const map = L.map(containerRef.current, { attributionControl: true, preferCanvas: true }).setView([-15.7797, -47.9297], 4);

      // Contingência deliberadamente SEM Esri. O bug histórico de quadrantes pretos ocorre em qualquer
      // viewport e pode vir de tile opaco inválido (HTTP 200), caso em que uma camada inferior não aparece.
      // O fallback precisa priorizar disponibilidade, não manter imagem aérea a qualquer custo.
      // Enquanto Google Satellite não estiver configurado, usamos relevo/topografia como base visual.
      // Isso evita o "mapa branco" do OSM padrão e mantém o contexto do terreno sem fingir imagem aérea.
      L.tileLayer(
        "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png",
        {
          maxZoom: 17,
          attribution: "Map data &copy; OpenStreetMap contributors, SRTM | Map style &copy; OpenTopoMap (CC-BY-SA)",
        },
      ).addTo(map);

      layersRef.current.raster = L.layerGroup().addTo(map);
      layersRef.current.boundary = L.layerGroup().addTo(map);
      layersRef.current.points = L.layerGroup().addTo(map);
      mapRef.current = map;
      drawLayers(L, map);

      requestAnimationFrame(() => map.invalidateSize({ pan: false }));
      delayedInvalidate = setTimeout(() => map.invalidateSize({ pan: false }), 250);
      const resizeObserver = new ResizeObserver(() => map.invalidateSize({ pan: false }));
      resizeObserver.observe(containerRef.current);
      cleanupResize = () => resizeObserver.disconnect();
    });

    return () => {
      cancelled = true;
      if (delayedInvalidate) clearTimeout(delayedInvalidate);
      cleanupResize?.();
      mapRef.current?.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseLayer]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    setSelectedPoint(selectedPointId ? points.find((point) => point.id === selectedPointId) ?? null : null);
    void import("leaflet").then((mod) => {
      drawLayers(mod.default, map);
      requestAnimationFrame(() => map.invalidateSize({ pan: false }));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boundary, points, colorFor, boundaryFillColor, imageOverlay, selectedPointId]);

  const defaultLegend: MapLegendEntry[] = [{ label: "Coletado", color: "#00C4D6" }, { label: "Pendente", color: "#B86F3E" }];
  const activeLegend = legend ?? defaultLegend;
  const showAgronomicFields = selectedPoint && selectedPoint.value !== undefined;
  const hasPlannedOnlyPoints = points.some((point) => pointPositionKind(point) === "PLANNED");
  const hasAuditedSourcePoints = points.some((point) => pointPositionKind(point) === "AUDITED_SOURCE");
  const selectedCoordinates = selectedPoint ? effectivePointCoordinates(selectedPoint) : null;

  return (
    <div className="real-field-map" data-map-provider="leaflet" data-has-image-overlay={imageOverlay ? "true" : "false"}>
      {providerNote && <p className="ndvi-panel-limitation"><Icon name="warning" size={13}/>{providerNote}</p>}
      <div ref={containerRef} className="real-field-map-canvas" style={{ height }} />
      <div className="real-field-map-legend">
        {activeLegend.map((entry) => <span key={entry.label}><i style={{ background: entry.color }}/>{entry.label}</span>)}
        {hasAuditedSourcePoints && <span className="portfolio-map-note">Fonte espacial auditada = coordenada real preservada no banco</span>}
        {hasPlannedOnlyPoints && <span className="portfolio-map-note">Círculo tracejado = posição planejada, sem GPS/fonte real auditada</span>}
        <span className="real-field-map-hint">{hint}</span>
      </div>
      {selectedPoint && selectedCoordinates && (
        <div className="real-field-map-panel">
          <div className="real-field-map-panel-head">
            <strong>{selectedPoint.code}</strong>
            <button type="button" className="icon-button" aria-label="Fechar" onClick={() => { setSelectedPoint(null); onPointSelectRef.current?.(null); }}><Icon name="close" size={13}/></button>
          </div>
          <dl>
            <div><dt>Status</dt><dd>{selectedPoint.collectedAt ? "Coletado" : "Pendente"}</dd></div>
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
            {pointPositionKind(selectedPoint) === "PLANNED" && <div><dt>Validação</dt><dd className="real-field-map-reason">Sem captura GPS observada nem fonte espacial real auditada. A posição exibida é de planejamento e não deve ser tratada como coordenada medida em campo.</dd></div>}
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

export { NEUTRAL as MAP_NEUTRAL_COLOR };
