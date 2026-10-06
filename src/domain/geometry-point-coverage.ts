export type CoverageGeometry = {
  type: "Polygon" | "MultiPolygon";
  coordinates: unknown;
};

export type CoveragePoint = {
  latitude: number;
  longitude: number;
};

const EPSILON = 1e-10;

function validCoordinate(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function pointOnSegment(
  x: number,
  y: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
) {
  const cross = (x - ax) * (by - ay) - (y - ay) * (bx - ax);
  if (Math.abs(cross) > EPSILON) return false;
  const dot = (x - ax) * (bx - ax) + (y - ay) * (by - ay);
  if (dot < -EPSILON) return false;
  const squaredLength = (bx - ax) ** 2 + (by - ay) ** 2;
  return dot <= squaredLength + EPSILON;
}

function pointInRing(longitude: number, latitude: number, ring: unknown) {
  if (!Array.isArray(ring) || ring.length < 3) return false;
  let inside = false;

  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const a = ring[i];
    const b = ring[j];
    if (!Array.isArray(a) || !Array.isArray(b)) continue;
    const ax = a[0];
    const ay = a[1];
    const bx = b[0];
    const by = b[1];
    if (![ax, ay, bx, by].every(validCoordinate)) continue;

    if (pointOnSegment(longitude, latitude, ax, ay, bx, by)) return true;

    const intersects = (ay > latitude) !== (by > latitude)
      && longitude < ((bx - ax) * (latitude - ay)) / (by - ay) + ax;
    if (intersects) inside = !inside;
  }

  return inside;
}

function pointInPolygon(longitude: number, latitude: number, polygon: unknown) {
  if (!Array.isArray(polygon) || polygon.length === 0) return false;
  if (!pointInRing(longitude, latitude, polygon[0])) return false;
  for (let i = 1; i < polygon.length; i += 1) {
    if (pointInRing(longitude, latitude, polygon[i])) return false;
  }
  return true;
}

export function pointCoveredByGeometry(
  geometry: CoverageGeometry,
  point: CoveragePoint,
) {
  if (!validCoordinate(point.latitude) || !validCoordinate(point.longitude)) return false;
  if (!Array.isArray(geometry.coordinates)) return false;

  if (geometry.type === "Polygon") {
    return pointInPolygon(point.longitude, point.latitude, geometry.coordinates);
  }

  if (geometry.type === "MultiPolygon") {
    return geometry.coordinates.some((polygon) =>
      pointInPolygon(point.longitude, point.latitude, polygon)
    );
  }

  return false;
}

export function summarizePointCoverage(
  geometry: CoverageGeometry | null,
  points: CoveragePoint[],
) {
  if (!geometry) return { validGeometry: false, inside: 0, total: points.length };
  const inside = points.filter((point) => pointCoveredByGeometry(geometry, point)).length;
  return { validGeometry: true, inside, total: points.length };
}
