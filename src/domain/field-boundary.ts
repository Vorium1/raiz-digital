export type FieldBoundaryGeometry = {
  type: "Polygon" | "MultiPolygon";
  coordinates: unknown;
};

export type BoundaryReferencePoint = {
  id?: string;
  code: string;
  latitude: number;
  longitude: number;
};

function pointOnSegment(
  longitude: number,
  latitude: number,
  [x1, y1]: [number, number],
  [x2, y2]: [number, number],
) {
  const epsilon = 1e-10;
  const cross = (longitude - x1) * (y2 - y1) - (latitude - y1) * (x2 - x1);
  if (Math.abs(cross) > epsilon) return false;
  const dot = (longitude - x1) * (longitude - x2) + (latitude - y1) * (latitude - y2);
  return dot <= epsilon;
}

function ringCoversPoint(ring: unknown, latitude: number, longitude: number) {
  if (!Array.isArray(ring) || ring.length < 4) return false;
  const points = ring.filter(
    (pair): pair is [number, number] =>
      Array.isArray(pair)
      && pair.length >= 2
      && Number.isFinite(pair[0])
      && Number.isFinite(pair[1]),
  );
  if (points.length < 4) return false;

  let inside = false;
  for (let current = 0, previous = points.length - 1; current < points.length; previous = current++) {
    const a = points[current]!;
    const b = points[previous]!;
    if (pointOnSegment(longitude, latitude, a, b)) return true;
    const intersects =
      (a[1] > latitude) !== (b[1] > latitude)
      && longitude < ((b[0] - a[0]) * (latitude - a[1])) / (b[1] - a[1]) + a[0];
    if (intersects) inside = !inside;
  }
  return inside;
}

function polygonCoversPoint(polygon: unknown, latitude: number, longitude: number) {
  if (!Array.isArray(polygon) || polygon.length === 0) return false;
  const [outer, ...holes] = polygon;
  if (!ringCoversPoint(outer, latitude, longitude)) return false;
  return !holes.some((hole) => ringCoversPoint(hole, latitude, longitude));
}

export function boundaryCoversPoint(
  geometry: FieldBoundaryGeometry | null | undefined,
  latitude: number,
  longitude: number,
) {
  if (!geometry || !Number.isFinite(latitude) || !Number.isFinite(longitude)) return false;
  if (geometry.type === "Polygon") return polygonCoversPoint(geometry.coordinates, latitude, longitude);
  if (!Array.isArray(geometry.coordinates)) return false;
  return geometry.coordinates.some((polygon) => polygonCoversPoint(polygon, latitude, longitude));
}

export function boundaryPointCoverage(
  geometry: FieldBoundaryGeometry | null | undefined,
  points: BoundaryReferencePoint[],
) {
  const inside = points.filter((point) => boundaryCoversPoint(geometry, point.latitude, point.longitude));
  return {
    total: points.length,
    inside: inside.length,
    outside: points.length - inside.length,
    valid: points.length === 0 || inside.length === points.length,
  };
}
