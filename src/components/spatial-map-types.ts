export type SpatialGeometry = { type: "Polygon" | "MultiPolygon"; coordinates: unknown };

export type MapPoint = {
  id: string;
  code: string;
  sequence: number | null;
  latitude: number;
  longitude: number;
  observedLatitude: number | null;
  observedLongitude: number | null;
  /** Posição originalmente planejada, quando a fonte real substituiu/confirmou o ponto de campo. */
  plannedLatitude?: number | null;
  plannedLongitude?: number | null;
  collectedAt: string | null;
  depthFromCm: number;
  depthToCm: number;
  subsampleCount: number | null;
  accuracyM: number | null;
  gpsSource: string | null;
  notes: string | null;
  labResultCount: number;
  value?: number | null;
  unit?: string | null;
  method?: string | null;
  interpretable?: boolean | null;
  classification?: string | null;
  notInterpretableReason?: string | null;
};

export type MapLegendEntry = { label: string; color: string };

export type MapImageOverlay = {
  url: string;
  /** [[sul, oeste], [norte, leste]] */
  bounds: [[number, number], [number, number]];
  opacity?: number;
};

export type FieldMapBaseLayer = "default" | "terrain";

export type FieldMapProps = {
  boundary: SpatialGeometry;
  points: MapPoint[];
  height?: number;
  colorFor?: (point: MapPoint) => { stroke: string; fill: string; fillOpacity: number };
  legend?: MapLegendEntry[];
  hint?: string;
  boundaryFillColor?: string;
  imageOverlay?: MapImageOverlay | null;
  baseLayer?: FieldMapBaseLayer;
};

export type PortfolioCanvasField = {
  id: string;
  name: string;
  boundary: SpatialGeometry;
  strokeColor: string;
  fillColor: string;
  fillOpacity: number;
  label: string;
  rasterOverlay?: MapImageOverlay | null;
};

export type PointPositionKind = "OBSERVED" | "AUDITED_SOURCE" | "PLANNED";

const AUDITED_REAL_SOURCES = new Set([
  "SHAPEFILE_REAL_GPS_LONLAT",
  "SHAPEFILE_REAL_EPSG4326",
]);

export function collectSpatialPositions(value: unknown, positions: Array<[number, number]>) {
  if (!Array.isArray(value)) return;
  if (value.length >= 2 && typeof value[0] === "number" && typeof value[1] === "number") {
    positions.push([value[0], value[1]]);
    return;
  }
  for (const item of value) collectSpatialPositions(item, positions);
}

export function spatialGeometryPositions(geometry: SpatialGeometry): Array<[number, number]> {
  const positions: Array<[number, number]> = [];
  collectSpatialPositions(geometry.coordinates, positions);
  return positions.filter(([longitude, latitude]) => Number.isFinite(longitude) && Number.isFinite(latitude));
}

/**
 * Coordenada efetivamente renderizada. `observed_position` é autoridade quando existe;
 * `latitude/longitude` permanecem como posição-base (planejada ou importada/auditada).
 * Centralizar esta escolha impede que uma tela mostre o ponto planejado enquanto outra
 * mostra a captura GPS do mesmo ponto.
 */
export function effectivePointCoordinates(point: MapPoint): { latitude: number; longitude: number } {
  if (point.observedLatitude != null && point.observedLongitude != null) {
    return { latitude: point.observedLatitude, longitude: point.observedLongitude };
  }
  return { latitude: point.latitude, longitude: point.longitude };
}

/**
 * `observed_position` é a captura feita durante a coleta corrente. Alguns datasets históricos/auditados,
 * como Cabeda, preservam a coordenada real diretamente em `position` e registram a proveniência em
 * `gps_source`; nesses casos não podemos rebaixar a coordenada para "planejada" só porque
 * `observed_position` é nulo. A fonte precisa corresponder exatamente ao vocabulário aprovado pelo
 * auditor de proveniência; prefixos/sufixos arbitrários não promovem a coordenada a evidência auditada.
 */
export function pointPositionKind(point: MapPoint): PointPositionKind {
  if (point.observedLatitude != null && point.observedLongitude != null) return "OBSERVED";
  const source = (point.gpsSource ?? "").trim().toUpperCase();
  if (AUDITED_REAL_SOURCES.has(source)) return "AUDITED_SOURCE";
  return "PLANNED";
}
export const MAP_NEUTRAL_COLOR = "#9AA79F";
