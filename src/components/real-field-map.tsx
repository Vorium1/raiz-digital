"use client";

import { useEffect, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";
import type * as Leaflet from "leaflet";
import { Icon } from "@/components/icon";

type Geometry = { type: "Polygon" | "MultiPolygon"; coordinates: unknown };

export type MapPoint = {
  id: string; code: string; sequence: number | null; latitude: number; longitude: number;
  observedLatitude: number | null; observedLongitude: number | null; collectedAt: string | null;
  depthFromCm: number; depthToCm: number; subsampleCount: number | null; accuracyM: number | null; gpsSource: string | null;
  notes: string | null; labResultCount: number;
  /** Presentes só quando o mapa está mostrando um parâmetro agronômico (não no uso simples de coleta). */
  value?: number | null; unit?: string | null; method?: string | null;
  interpretable?: boolean | null; classification?: string | null; notInterpretableReason?: string | null;
};

export type MapLegendEntry = { label: string; color: string };

function geometryRings(geometry: Geometry): [number, number][][] {
  const toLatLng = (ring: number[][]) => ring.map(([lon, lat]) => [lat, lon] as [number, number]);
  if (geometry.type === "Polygon") return (geometry.coordinates as number[][][]).map(toLatLng);
  return (geometry.coordinates as number[][][][]).flatMap((polygon) => polygon.map(toLatLng));
}

const NEUTRAL = "#9AA79F";

/**
 * Mapa geográfico real: PostGIS -> GeoJSON -> Leaflet + OpenStreetMap.
 * Nenhuma forma abstrata -- o polígono é o limite real do talhão
 * (fields.boundary) e cada marcador é a coordenada real do ponto de
 * amostragem (sample_points.position). `layersRef` guarda os grupos de
 * camada por nome para que uma futura camada de fertilidade só precise
 * adicionar um novo grupo, sem reestruturar o mapa.
 *
 * Por padrão colore por status de coleta. Quando o chamador passa
 * `colorFor`/`legend` (painel de Inteligência Agronômica), a mesma
 * geometria passa a ser colorida pela classificação determinística do
 * parâmetro escolhido -- nunca uma cor inventada, sempre derivada do que
 * o motor já calculou.
 */
export function RealFieldMap({
  boundary,
  points,
  height = 360,
  colorFor,
  legend,
  hint = "Clique num ponto para ver os dados",
}: {
  boundary: Geometry;
  points: MapPoint[];
  height?: number;
  colorFor?: (point: MapPoint) => { stroke: string; fill: string; fillOpacity: number };
  legend?: MapLegendEntry[];
  hint?: string;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<Leaflet.Map | null>(null);
  const layersRef = useRef<Record<string, Leaflet.LayerGroup>>({});
  const latestRef = useRef({ boundary, points, colorFor });
  const onSelectRef = useRef<(point: MapPoint) => void>(() => {});
  const [selectedPoint, setSelectedPoint] = useState<MapPoint | null>(null);
  latestRef.current = { boundary, points, colorFor };
  onSelectRef.current = setSelectedPoint;

  function defaultColor(point: MapPoint) {
    const collected = Boolean(point.collectedAt);
    return { stroke: collected ? "#00C4D6" : "#B86F3E", fill: collected ? "#00C4D6" : "#F2C879", fillOpacity: collected ? 0.9 : 0.6 };
  }

  function drawLayers(L: typeof Leaflet, map: Leaflet.Map) {
    const boundaryLayer = layersRef.current.boundary;
    const pointsLayer = layersRef.current.points;
    if (!boundaryLayer || !pointsLayer) return;
    boundaryLayer.clearLayers();
    pointsLayer.clearLayers();

    const { boundary, points, colorFor } = latestRef.current;
    const rings = geometryRings(boundary);
    rings.forEach((ring) => {
      L.polygon(ring, { color: "#00C4D6", weight: 2, fillOpacity: 0.08 }).addTo(boundaryLayer);
    });

    const bounds: [number, number][] = [...rings.flat()];
    points.forEach((point) => {
      const palette = colorFor ? colorFor(point) : defaultColor(point);
      const marker = L.circleMarker([point.latitude, point.longitude], {
        radius: 7,
        color: palette.stroke,
        fillColor: palette.fill,
        fillOpacity: palette.fillOpacity,
        weight: 2,
      }).addTo(pointsLayer);
      marker.on("click", () => onSelectRef.current(point));
      marker.bindTooltip(point.code, { direction: "top", offset: [0, -8] });
      bounds.push([point.latitude, point.longitude]);
    });

    if (bounds.length) {
      const latLngBounds = L.latLngBounds(bounds);
      if (latLngBounds.isValid()) map.fitBounds(latLngBounds, { padding: [28, 28], maxZoom: 18 });
    }
  }

  useEffect(() => {
    let cancelled = false;
    let cleanupResize: (() => void) | undefined;

    void import("leaflet").then((mod) => {
      if (cancelled || !containerRef.current || mapRef.current) return;
      const L = mod.default;
      const map = L.map(containerRef.current, { attributionControl: true }).setView([-15.7797, -47.9297], 4);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "&copy; OpenStreetMap contributors" }).addTo(map);
      layersRef.current.boundary = L.layerGroup().addTo(map);
      layersRef.current.points = L.layerGroup().addTo(map);
      mapRef.current = map;
      drawLayers(L, map);

      const resizeObserver = new ResizeObserver(() => map.invalidateSize());
      resizeObserver.observe(containerRef.current);
      cleanupResize = () => resizeObserver.disconnect();
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
    setSelectedPoint(null);
    void import("leaflet").then((mod) => drawLayers(mod.default, map));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boundary, points, colorFor]);

  const defaultLegend: MapLegendEntry[] = [{ label: "Coletado", color: "#00C4D6" }, { label: "Pendente", color: "#B86F3E" }];
  const activeLegend = legend ?? defaultLegend;
  const showAgronomicFields = selectedPoint && selectedPoint.value !== undefined;

  return (
    <div className="real-field-map">
      <div ref={containerRef} className="real-field-map-canvas" style={{ height }} />
      <div className="real-field-map-legend">
        {activeLegend.map((entry) => <span key={entry.label}><i style={{ background: entry.color }}/>{entry.label}</span>)}
        <span className="real-field-map-hint">{hint}</span>
      </div>
      {selectedPoint && (
        <div className="real-field-map-panel">
          <div className="real-field-map-panel-head">
            <strong>{selectedPoint.code}</strong>
            <button type="button" className="icon-button" aria-label="Fechar" onClick={() => setSelectedPoint(null)}><Icon name="close" size={13}/></button>
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
            <div><dt>Coordenadas</dt><dd>{selectedPoint.latitude.toFixed(6)}, {selectedPoint.longitude.toFixed(6)}</dd></div>
            <div><dt>Profundidade</dt><dd>{selectedPoint.depthFromCm}–{selectedPoint.depthToCm} cm</dd></div>
            {selectedPoint.collectedAt && <div><dt>Coletado em</dt><dd>{new Date(selectedPoint.collectedAt).toLocaleString("pt-BR")}</dd></div>}
            {selectedPoint.gpsSource && <div><dt>Origem GPS</dt><dd>{selectedPoint.gpsSource}</dd></div>}
            {selectedPoint.accuracyM != null && <div><dt>Precisão</dt><dd>±{selectedPoint.accuracyM} m</dd></div>}
            <div><dt>Resultados de laudo</dt><dd>{selectedPoint.labResultCount}</dd></div>
            {selectedPoint.notes && <div><dt>Observação</dt><dd>{selectedPoint.notes}</dd></div>}
          </dl>
        </div>
      )}
    </div>
  );
}

export { NEUTRAL as MAP_NEUTRAL_COLOR };
