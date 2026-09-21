export type NdviBoundaryGeometry = { coordinates?: unknown } | null | undefined;

function collectCoordinatePairs(value: unknown, out: Array<[number, number]>) {
  if (!Array.isArray(value)) return;
  if (
    value.length >= 2
    && typeof value[0] === "number"
    && typeof value[1] === "number"
    && Number.isFinite(value[0])
    && Number.isFinite(value[1])
  ) {
    out.push([value[0], value[1]]);
    return;
  }
  for (const item of value) collectCoordinatePairs(item, out);
}

export function ndviBoundaryBbox(boundary: NdviBoundaryGeometry): [number, number, number, number] | null {
  const points: Array<[number, number]> = [];
  collectCoordinatePairs(boundary?.coordinates, points);
  if (points.length < 3) return null;

  let minLon = Infinity;
  let minLat = Infinity;
  let maxLon = -Infinity;
  let maxLat = -Infinity;
  for (const [lon, lat] of points) {
    minLon = Math.min(minLon, lon);
    minLat = Math.min(minLat, lat);
    maxLon = Math.max(maxLon, lon);
    maxLat = Math.max(maxLat, lat);
  }
  if (![minLon, minLat, maxLon, maxLat].every(Number.isFinite) || minLon >= maxLon || minLat >= maxLat) return null;
  return [minLon, minLat, maxLon, maxLat];
}

/**
 * Um raster NDVI só pode ser tratado como evidência espacial do contorno atual se seu envelope
 * contiver integralmente a geometria corrente. Isso invalida automaticamente artefatos gerados
 * antes de uma troca de contorno, sem confiar em datas, nomes de arquivos ou heurísticas.
 */
export function ndviRasterBboxContainsBoundary(
  rasterBbox: unknown,
  boundary: NdviBoundaryGeometry,
  tolerance = 1e-6,
) {
  if (!Array.isArray(rasterBbox) || rasterBbox.length !== 4) return false;
  const raster = rasterBbox.map(Number);
  if (!raster.every(Number.isFinite)) return false;
  const [minLon, minLat, maxLon, maxLat] = raster;
  if (minLon >= maxLon || minLat >= maxLat) return false;

  const boundaryBbox = ndviBoundaryBbox(boundary);
  if (!boundaryBbox) return false;
  const [boundaryMinLon, boundaryMinLat, boundaryMaxLon, boundaryMaxLat] = boundaryBbox;
  return (
    minLon <= boundaryMinLon + tolerance
    && minLat <= boundaryMinLat + tolerance
    && maxLon >= boundaryMaxLon - tolerance
    && maxLat >= boundaryMaxLat - tolerance
  );
}
