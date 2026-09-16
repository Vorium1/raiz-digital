export type SpatialGeometry = { type: "Polygon" | "MultiPolygon"; coordinates: unknown };

export type MapPoint = {
  id: string;
  code: string;
  sequence: number | null;
  latitude: number;
  longitude: number;
  observedLatitude: number | null;
  observedLongitude: number | null;
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

export type FieldMapProps = {
  boundary: SpatialGeometry;
  points: MapPoint[];
  height?: number;
  colorFor?: (point: MapPoint) => { stroke: string; fill: string; fillOpacity: number };
  legend?: MapLegendEntry[];
  hint?: string;
  boundaryFillColor?: string;
  imageOverlay?: MapImageOverlay | null;
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

export function pointPositionKind(point: MapPoint): "OBSERVED" | "PLANNED" {
  return point.observedLatitude != null && point.observedLongitude != null ? "OBSERVED" : "PLANNED";
}
