import { fromUrl } from "geotiff";
import proj4 from "proj4";
import sharp from "sharp";
import {
  fieldGeometryBbox,
  type FetchFieldNdviInput,
  type FieldGeometry,
  type NdviHistogramBucket,
  type NdviMapResult,
  type NdviSceneResult,
  type SatelliteNdviProvider,
} from "./copernicus-ndvi-provider.ts";

export const EARTH_SEARCH_STAC_URL = "https://earth-search.aws.element84.com/v1/search";
export const EARTH_SEARCH_COLLECTION = "sentinel-2-l2a";
export const EARTH_SEARCH_NDVI_MOSAICKING_ORDER = "leastCC" as const;

const MAX_SCENES_PER_QUERY = 12;
const STATS_RESOLUTION_METERS = 10;
const MAX_STATS_SIDE = 512;

type RasterBandMetadata = {
  scale?: number;
  offset?: number;
  nodata?: number | string | null;
};

type EarthSearchAsset = {
  href?: string;
  type?: string;
  roles?: string[];
  "proj:epsg"?: number;
  "proj:code"?: string;
  "raster:bands"?: RasterBandMetadata[];
};

export type EarthSearchItem = {
  id: string;
  bbox?: number[];
  properties?: {
    datetime?: string;
    "eo:cloud_cover"?: number;
    "proj:epsg"?: number;
    "proj:code"?: string;
  };
  assets?: Record<string, EarthSearchAsset>;
};

type EarthSearchResponse = {
  features?: EarthSearchItem[];
};

type ProjectedGeometry = Array<Array<Array<[number, number]>>>;

type SceneAssets = {
  red: EarthSearchAsset;
  nir: EarthSearchAsset;
  scl: EarthSearchAsset;
  epsg: number;
};

function assetByAliases(item: EarthSearchItem, aliases: string[]) {
  const assets = item.assets ?? {};
  for (const alias of aliases) {
    const asset = assets[alias];
    if (asset?.href) return asset;
  }
  return null;
}

function parseEpsg(value: unknown): number | null {
  if (typeof value === "number" && Number.isInteger(value)) return value;
  if (typeof value === "string") {
    const match = value.match(/EPSG:(\d+)/i);
    if (match) return Number(match[1]);
  }
  return null;
}

function sceneAssets(item: EarthSearchItem): SceneAssets | null {
  const red = assetByAliases(item, ["red", "B04", "b04"]);
  const nir = assetByAliases(item, ["nir", "nir08", "B08", "b08"]);
  const scl = assetByAliases(item, ["scl", "SCL"]);
  if (!red || !nir || !scl) return null;

  const epsg = parseEpsg(red["proj:epsg"])
    ?? parseEpsg(red["proj:code"])
    ?? parseEpsg(item.properties?.["proj:epsg"])
    ?? parseEpsg(item.properties?.["proj:code"]);
  if (!epsg) return null;
  return { red, nir, scl, epsg };
}

function stacDate(item: EarthSearchItem) {
  const value = item.properties?.datetime;
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : null;
}

function cloudCover(item: EarthSearchItem) {
  const value = item.properties?.["eo:cloud_cover"];
  return typeof value === "number" && Number.isFinite(value) ? value : 100;
}

function bboxContains(container: number[] | undefined, target: [number, number, number, number]) {
  if (!Array.isArray(container) || container.length < 4) return false;
  const epsilon = 1e-5;
  return (
    container[0] <= target[0] + epsilon
    && container[1] <= target[1] + epsilon
    && container[2] >= target[2] - epsilon
    && container[3] >= target[3] - epsilon
  );
}

/**
 * Uma data pode ter mais de um tile. Para talhões pequenos, só aceitamos um tile que contenha
 * integralmente o envelope do talhão e escolhemos o de menor cobertura de nuvem declarada.
 * Se nenhum tile cobrir o talhão inteiro, a data é ignorada em vez de produzir mosaico parcial.
 */
export function selectEarthSearchScenes(
  features: EarthSearchItem[],
  fieldBbox: [number, number, number, number],
  maxCloudCoverPct = 30,
) {
  const byDate = new Map<string, EarthSearchItem>();
  for (const item of features) {
    const date = stacDate(item);
    if (!date || !sceneAssets(item) || !bboxContains(item.bbox, fieldBbox)) continue;
    if (cloudCover(item) > maxCloudCoverPct) continue;
    const current = byDate.get(date);
    if (!current || cloudCover(item) < cloudCover(current)) byDate.set(date, item);
  }
  return Array.from(byDate.values())
    .sort((a, b) => (stacDate(a) ?? "").localeCompare(stacDate(b) ?? ""))
    .slice(-MAX_SCENES_PER_QUERY);
}

function publicCogUrl(href: string) {
  if (href.startsWith("https://") || href.startsWith("http://")) return href;
  if (!href.startsWith("s3://")) throw new Error(`Asset Sentinel-2 possui URL não suportada: ${href.slice(0, 80)}`);
  const withoutScheme = href.slice(5);
  const slash = withoutScheme.indexOf("/");
  if (slash <= 0) throw new Error("Asset S3 público do Sentinel-2 possui chave inválida.");
  const bucket = withoutScheme.slice(0, slash);
  const key = withoutScheme.slice(slash + 1).split("/").map(encodeURIComponent).join("/");
  return `https://${bucket}.s3.us-west-2.amazonaws.com/${key}`;
}

function utmDefinition(epsg: number) {
  if (epsg >= 32601 && epsg <= 32660) {
    return `+proj=utm +zone=${epsg - 32600} +datum=WGS84 +units=m +no_defs`;
  }
  if (epsg >= 32701 && epsg <= 32760) {
    return `+proj=utm +zone=${epsg - 32700} +south +datum=WGS84 +units=m +no_defs`;
  }
  throw new Error(`CRS Sentinel-2 EPSG:${epsg} não é UTM e ainda não é suportado pelo provider público.`);
}

function geometryPolygons(geometry: FieldGeometry): Array<Array<Array<[number, number]>>> {
  if (geometry.type === "Polygon" && Array.isArray(geometry.coordinates)) {
    return [geometry.coordinates as Array<Array<[number, number]>>];
  }
  if (geometry.type === "MultiPolygon" && Array.isArray(geometry.coordinates)) {
    return geometry.coordinates as Array<Array<Array<[number, number]>>>;
  }
  throw new Error(`Geometria ${geometry.type} ainda não é suportada para NDVI público.`);
}

function projectGeometry(geometry: FieldGeometry, epsg: number): ProjectedGeometry {
  const projection = utmDefinition(epsg);
  return geometryPolygons(geometry).map((polygon) =>
    polygon.map((ring) =>
      ring.map(([lon, lat]) => {
        const [x, y] = proj4("EPSG:4326", projection, [lon, lat]);
        return [x, y] as [number, number];
      }),
    ),
  );
}

function projectedBbox(polygons: ProjectedGeometry): [number, number, number, number] {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const polygon of polygons) {
    for (const ring of polygon) {
      for (const [x, y] of ring) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
  }
  if (![minX, minY, maxX, maxY].every(Number.isFinite) || minX >= maxX || minY >= maxY) {
    throw new Error("Não foi possível projetar o limite do talhão para a grade Sentinel-2.");
  }
  return [minX, minY, maxX, maxY];
}

function pointInRing(point: [number, number], ring: Array<[number, number]>) {
  const [x, y] = point;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const intersects = ((yi > y) !== (yj > y))
      && (x < ((xj - xi) * (y - yi)) / ((yj - yi) || Number.EPSILON) + xi);
    if (intersects) inside = !inside;
  }
  return inside;
}

function pointInProjectedGeometry(point: [number, number], polygons: ProjectedGeometry) {
  for (const polygon of polygons) {
    const outer = polygon[0];
    if (!outer || !pointInRing(point, outer)) continue;
    const insideHole = polygon.slice(1).some((hole) => pointInRing(point, hole));
    if (!insideHole) return true;
  }
  return false;
}

function outputSize(
  bbox: [number, number, number, number],
  resolution: number,
  maxSide: number,
) {
  const width = Math.max(1, Math.min(maxSide, Math.ceil((bbox[2] - bbox[0]) / resolution)));
  const height = Math.max(1, Math.min(maxSide, Math.ceil((bbox[3] - bbox[1]) / resolution)));
  return { width, height };
}

function mapRenderSize(bbox: [number, number, number, number]) {
  const [minLon, minLat, maxLon, maxLat] = bbox;
  const midLatRad = ((minLat + maxLat) / 2) * Math.PI / 180;
  const physicalWidth = Math.max((maxLon - minLon) * Math.cos(midLatRad), 1e-9);
  const physicalHeight = Math.max(maxLat - minLat, 1e-9);
  const maxSide = 768;
  const minSide = 128;
  if (physicalWidth >= physicalHeight) {
    return { width: maxSide, height: Math.max(minSide, Math.round(maxSide * physicalHeight / physicalWidth)) };
  }
  return { width: Math.max(minSide, Math.round(maxSide * physicalWidth / physicalHeight)), height: maxSide };
}

function rasterBand(asset: EarthSearchAsset) {
  return asset["raster:bands"]?.[0] ?? {};
}

function physicalValue(raw: number, asset: EarthSearchAsset) {
  const meta = rasterBand(asset);
  const scale = typeof meta.scale === "number" ? meta.scale : 1;
  const offset = typeof meta.offset === "number" ? meta.offset : 0;
  return raw * scale + offset;
}

function isNoData(raw: number, asset: EarthSearchAsset) {
  const nodata = rasterBand(asset).nodata;
  return typeof nodata === "number" && raw === nodata;
}

async function readCogBand(
  asset: EarthSearchAsset,
  bbox: [number, number, number, number],
  width: number,
  height: number,
  resampleMethod: "nearest" | "bilinear",
) {
  if (!asset.href) throw new Error("Asset Sentinel-2 sem URL.");
  const tiff = await fromUrl(publicCogUrl(asset.href));
  const values = await tiff.readRasters({
    bbox,
    width,
    height,
    samples: [0],
    interleave: true,
    resampleMethod,
  });
  return values as unknown as ArrayLike<number>;
}

function histogram(values: number[]): NdviHistogramBucket[] {
  const counts = Array.from({ length: 10 }, () => 0);
  for (const value of values) {
    const index = Math.max(0, Math.min(9, Math.floor((value + 1) / 0.2)));
    counts[index] += 1;
  }
  return counts.flatMap((count, index) =>
    count > 0 ? [{ ndvi: -0.9 + index * 0.2, pixelCount: count }] : [],
  );
}

function rgbaForNdvi(ndvi: number): [number, number, number, number] {
  if (ndvi < 0.2) return [154, 132, 104, 255];
  if (ndvi < 0.4) return [217, 101, 90, 255];
  if (ndvi < 0.6) return [216, 153, 67, 255];
  if (ndvi < 0.8) return [143, 191, 107, 255];
  return [41, 150, 111, 255];
}

async function sceneArrays(
  item: EarthSearchItem,
  geometry: FieldGeometry,
  width: number,
  height: number,
) {
  const assets = sceneAssets(item);
  if (!assets) throw new Error(`Cena ${item.id} não possui red/nir/scl COG + CRS suficientes.`);
  const polygons = projectGeometry(geometry, assets.epsg);
  const bbox = projectedBbox(polygons);
  const [red, nir, scl] = await Promise.all([
    readCogBand(assets.red, bbox, width, height, "bilinear"),
    readCogBand(assets.nir, bbox, width, height, "bilinear"),
    readCogBand(assets.scl, bbox, width, height, "nearest"),
  ]);
  return { assets, polygons, bbox, red, nir, scl };
}

function pixelPoint(
  index: number,
  width: number,
  height: number,
  bbox: [number, number, number, number],
): [number, number] {
  const row = Math.floor(index / width);
  const col = index % width;
  const x = bbox[0] + (col + 0.5) * (bbox[2] - bbox[0]) / width;
  const y = bbox[3] - (row + 0.5) * (bbox[3] - bbox[1]) / height;
  return [x, y];
}

function validScl(value: number) {
  const rounded = Math.round(value);
  return rounded === 4 || rounded === 5 || rounded === 6;
}

function ndviAt(
  index: number,
  arrays: Awaited<ReturnType<typeof sceneArrays>>,
) {
  const rawRed = Number(arrays.red[index]);
  const rawNir = Number(arrays.nir[index]);
  if (!Number.isFinite(rawRed) || !Number.isFinite(rawNir)) return null;
  if (isNoData(rawRed, arrays.assets.red) || isNoData(rawNir, arrays.assets.nir)) return null;
  if (!validScl(Number(arrays.scl[index]))) return null;
  const red = physicalValue(rawRed, arrays.assets.red);
  const nir = physicalValue(rawNir, arrays.assets.nir);
  const denominator = nir + red;
  if (!Number.isFinite(red) || !Number.isFinite(nir) || Math.abs(denominator) < 1e-12) return null;
  const ndvi = (nir - red) / denominator;
  return Number.isFinite(ndvi) ? Math.max(-1, Math.min(1, ndvi)) : null;
}

async function searchItems(input: FetchFieldNdviInput) {
  const response = await fetch(EARTH_SEARCH_STAC_URL, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/geo+json, application/json" },
    body: JSON.stringify({
      collections: [EARTH_SEARCH_COLLECTION],
      intersects: input.fieldBoundaryGeoJson,
      datetime: `${input.fromDate}T00:00:00Z/${input.toDate}T23:59:59Z`,
      query: { "eo:cloud_cover": { lte: input.maxCloudCoverPct ?? 30 } },
      limit: 100,
    }),
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Earth Search STAC respondeu ${response.status}: ${body.slice(0, 300)}`);
  }
  const payload = await response.json() as EarthSearchResponse;
  return selectEarthSearchScenes(
    payload.features ?? [],
    fieldGeometryBbox(input.fieldBoundaryGeoJson),
    input.maxCloudCoverPct ?? 30,
  );
}

async function sceneStatistics(item: EarthSearchItem, geometry: FieldGeometry): Promise<NdviSceneResult | null> {
  const assets = sceneAssets(item);
  const capturedAt = stacDate(item);
  if (!assets || !capturedAt) return null;
  const polygons = projectGeometry(geometry, assets.epsg);
  const bbox = projectedBbox(polygons);
  const { width, height } = outputSize(bbox, STATS_RESOLUTION_METERS, MAX_STATS_SIDE);
  const arrays = await sceneArrays(item, geometry, width, height);

  const values: number[] = [];
  let insideCount = 0;
  for (let index = 0; index < width * height; index += 1) {
    if (!pointInProjectedGeometry(pixelPoint(index, width, height, arrays.bbox), arrays.polygons)) continue;
    insideCount += 1;
    const ndvi = ndviAt(index, arrays);
    if (ndvi !== null) values.push(ndvi);
  }
  if (insideCount === 0 || values.length === 0) return null;

  let sum = 0;
  let sumSquares = 0;
  let min = Infinity;
  let max = -Infinity;
  for (const value of values) {
    sum += value;
    sumSquares += value * value;
    min = Math.min(min, value);
    max = Math.max(max, value);
  }
  const mean = sum / values.length;
  const variance = Math.max(0, sumSquares / values.length - mean * mean);

  return {
    capturedAt,
    meanNdvi: mean,
    minNdvi: min,
    maxNdvi: max,
    stddevNdvi: Math.sqrt(variance),
    cloudCoverPct: ((insideCount - values.length) / insideCount) * 100,
    pixelCount: values.length,
    histogram: histogram(values),
    sceneId: item.id,
  };
}

async function sceneMap(
  item: EarthSearchItem,
  geometry: FieldGeometry,
  capturedAt: string,
): Promise<NdviMapResult> {
  const geographicBbox = fieldGeometryBbox(geometry);
  const { width, height } = mapRenderSize(geographicBbox);
  const arrays = await sceneArrays(item, geometry, width, height);
  const rgba = Buffer.alloc(width * height * 4);

  for (let index = 0; index < width * height; index += 1) {
    const offset = index * 4;
    if (!pointInProjectedGeometry(pixelPoint(index, width, height, arrays.bbox), arrays.polygons)) {
      rgba[offset + 3] = 0;
      continue;
    }
    const ndvi = ndviAt(index, arrays);
    if (ndvi === null) {
      rgba[offset + 3] = 0;
      continue;
    }
    const [r, g, b, a] = rgbaForNdvi(ndvi);
    rgba[offset] = r;
    rgba[offset + 1] = g;
    rgba[offset + 2] = b;
    rgba[offset + 3] = a;
  }

  const png = await sharp(rgba, { raw: { width, height, channels: 4 } })
    .png({ compressionLevel: 9 })
    .toBuffer();

  const bytes = png.buffer.slice(png.byteOffset, png.byteOffset + png.byteLength) as ArrayBuffer;
  return { bytes, bbox: geographicBbox, width, height, capturedAt };
}

export const earthSearchNdviProvider: SatelliteNdviProvider = {
  async fetchFieldNdviSeries(input) {
    const items = await searchItems(input);
    const scenes: NdviSceneResult[] = [];
    let lastError: Error | null = null;
    for (const item of items) {
      try {
        const scene = await sceneStatistics(item, input.fieldBoundaryGeoJson);
        if (scene) scenes.push(scene);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error("Falha ao processar cena Sentinel-2 pública.");
      }
    }
    if (scenes.length === 0 && lastError) throw lastError;
    return scenes.sort((a, b) => a.capturedAt.localeCompare(b.capturedAt));
  },

  async fetchFieldNdvi(input) {
    const scenes = await this.fetchFieldNdviSeries(input);
    return scenes.at(-1) ?? null;
  },

  async fetchFieldNdviMap(input) {
    const searchInput: FetchFieldNdviInput = {
      fieldBoundaryGeoJson: input.fieldBoundaryGeoJson,
      fromDate: input.capturedAt,
      toDate: input.capturedAt,
      maxCloudCoverPct: input.maxCloudCoverPct,
    };
    const items = await searchItems(searchInput);
    const item = items.find((candidate) => stacDate(candidate) === input.capturedAt);
    if (!item) throw new Error(`Earth Search não encontrou cena Sentinel-2 completa para ${input.capturedAt}.`);
    return sceneMap(item, input.fieldBoundaryGeoJson, input.capturedAt);
  },
};
