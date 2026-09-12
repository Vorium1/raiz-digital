/**
 * NDVI real por satélite (Sentinel-2) via Copernicus Data Space Ecosystem.
 *
 * Statistical API: série temporal e estatísticas agregadas do talhão.
 * Process API: visualização PNG espacial da aquisição, recortada pela geometria real do talhão.
 * A interpretação de vigor continua determinística em `src/domain/ndvi-engine.ts`; o provedor externo
 * só entrega reflectância medida / imagem derivada dessas bandas, nunca produtividade ou prescrição.
 */

const TOKEN_URL = "https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token";
const STATISTICS_URL = "https://sh.dataspace.copernicus.eu/api/v1/statistics";
const PROCESS_URL = "https://sh.dataspace.copernicus.eu/api/v1/process";
const CRS84 = "http://www.opengis.net/def/crs/OGC/1.3/CRS84";

const NDVI_EVALSCRIPT = `//VERSION=3
function setup() {
  return {
    input: [{ bands: ["B04", "B08", "SCL", "dataMask"] }],
    output: [
      { id: "default", bands: 1, sampleType: "FLOAT32" },
      { id: "dataMask", bands: 1 },
    ],
  };
}
function evaluatePixel(sample) {
  let ndvi = (sample.B08 - sample.B04) / (sample.B08 + sample.B04 + 1e-9);
  let clear = sample.dataMask === 1 && (sample.SCL === 4 || sample.SCL === 5 || sample.SCL === 6);
  return { default: [ndvi], dataMask: [clear ? 1 : 0] };
}`;

/**
 * Visualização categórica com as MESMAS faixas do motor determinístico. O quarto canal é alpha:
 * pixels fora do talhão, sem dado, nuvem, cirrus, sombra, neve/gelo e classes inválidas ficam
 * transparentes. A imagem serve para leitura espacial, não para criar uma nova classificação.
 */
const NDVI_MAP_EVALSCRIPT = `//VERSION=3
function setup() {
  return {
    input: [{ bands: ["B04", "B08", "SCL", "dataMask"] }],
    output: { id: "default", bands: 4, sampleType: "AUTO" },
  };
}
function evaluatePixel(sample) {
  let clear = sample.dataMask === 1 && (sample.SCL === 4 || sample.SCL === 5 || sample.SCL === 6);
  if (!clear) return [0, 0, 0, 0];
  let ndvi = (sample.B08 - sample.B04) / (sample.B08 + sample.B04 + 1e-9);
  if (ndvi < 0.2) return [0.604, 0.518, 0.408, 1];
  if (ndvi < 0.4) return [0.851, 0.396, 0.353, 1];
  if (ndvi < 0.6) return [0.847, 0.600, 0.263, 1];
  if (ndvi < 0.8) return [0.561, 0.749, 0.420, 1];
  return [0.161, 0.588, 0.435, 1];
}`;

function toFloatJson(body: string): string {
  return body.replace('"lowEdge":-1,"highEdge":1', '"lowEdge":-1.0,"highEdge":1.0');
}

export type NdviHistogramBucket = { ndvi: number; pixelCount: number };

export type NdviSceneResult = {
  capturedAt: string;
  meanNdvi: number;
  minNdvi: number;
  maxNdvi: number;
  stddevNdvi: number | null;
  /** Compatibilidade de banco/API: representa % mascarado/sem dado válido dentro do talhão. */
  cloudCoverPct: number | null;
  pixelCount: number;
  histogram: NdviHistogramBucket[];
  sceneId: string | null;
};

export type FieldGeometry = { type: string; coordinates: unknown };

export type FetchFieldNdviInput = {
  fieldBoundaryGeoJson: FieldGeometry;
  fromDate: string;
  toDate: string;
  maxCloudCoverPct?: number;
};

export type NdviMapResult = {
  bytes: ArrayBuffer;
  bbox: [number, number, number, number];
  width: number;
  height: number;
  capturedAt: string;
};

export interface SatelliteNdviProvider {
  fetchFieldNdvi(input: FetchFieldNdviInput): Promise<NdviSceneResult | null>;
  fetchFieldNdviSeries(input: FetchFieldNdviInput): Promise<NdviSceneResult[]>;
  fetchFieldNdviMap(input: { fieldBoundaryGeoJson: FieldGeometry; capturedAt: string; maxCloudCoverPct?: number }): Promise<NdviMapResult>;
}

let cachedToken: { value: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string> {
  const clientId = process.env.COPERNICUS_CLIENT_ID;
  const clientSecret = process.env.COPERNICUS_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error(
      "COPERNICUS_CLIENT_ID / COPERNICUS_CLIENT_SECRET não configurados -- leitura de NDVI por satélite indisponível nesta instância.",
    );
  }
  if (cachedToken && cachedToken.expiresAt > Date.now() + 30_000) return cachedToken.value;

  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "client_credentials", client_id: clientId, client_secret: clientSecret }),
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Copernicus (autenticação) respondeu ${response.status}: ${body.slice(0, 300)}`);
  }
  const payload = (await response.json()) as { access_token: string; expires_in: number };
  cachedToken = { value: payload.access_token, expiresAt: Date.now() + payload.expires_in * 1000 };
  return payload.access_token;
}

type StatisticsEntry = {
  interval?: { from?: string; to?: string };
  outputs?: {
    default?: {
      bands?: {
        B0?: {
          stats?: { mean?: number; min?: number; max?: number; stDev?: number; sampleCount?: number; noDataCount?: number };
          histogram?: { bins?: Array<{ lowEdge: number; highEdge: number; count: number }> };
        };
      };
    };
  };
};

type StatisticsApiResponse = { data?: StatisticsEntry[] };

function toHistogram(bins: Array<{ lowEdge: number; highEdge: number; count: number }> | undefined): NdviHistogramBucket[] {
  if (!bins) return [];
  return bins
    .filter((bin) => bin.count > 0)
    .map((bin) => ({ ndvi: (bin.lowEdge + bin.highEdge) / 2, pixelCount: bin.count }));
}

function toSceneResult(entry: StatisticsEntry, fallbackDate: string): NdviSceneResult | null {
  const stats = entry.outputs?.default?.bands?.B0?.stats;
  const sampleCount = stats?.sampleCount ?? 0;
  if (!stats || sampleCount <= 0 || stats.mean === undefined || stats.min === undefined || stats.max === undefined) return null;

  const noDataCount = stats.noDataCount ?? 0;
  const totalPixels = sampleCount + noDataCount;
  const maskedPixelPct = totalPixels > 0 ? (noDataCount / totalPixels) * 100 : null;

  return {
    capturedAt: (entry.interval?.from ?? fallbackDate).slice(0, 10),
    meanNdvi: stats.mean,
    minNdvi: stats.min,
    maxNdvi: stats.max,
    stddevNdvi: stats.stDev ?? null,
    cloudCoverPct: maskedPixelPct,
    pixelCount: sampleCount,
    histogram: toHistogram(entry.outputs?.default?.bands?.B0?.histogram?.bins),
    sceneId: null,
  };
}

function collectPositions(value: unknown, positions: Array<[number, number]>) {
  if (!Array.isArray(value)) return;
  if (value.length >= 2 && typeof value[0] === "number" && typeof value[1] === "number") {
    positions.push([value[0], value[1]]);
    return;
  }
  for (const item of value) collectPositions(item, positions);
}

export function fieldGeometryBbox(geometry: FieldGeometry): [number, number, number, number] {
  const positions: Array<[number, number]> = [];
  collectPositions(geometry.coordinates, positions);
  if (positions.length < 3) throw new Error("Geometria do talhão sem coordenadas suficientes para gerar o raster NDVI.");
  let minLon = Infinity;
  let minLat = Infinity;
  let maxLon = -Infinity;
  let maxLat = -Infinity;
  for (const [lon, lat] of positions) {
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue;
    minLon = Math.min(minLon, lon);
    minLat = Math.min(minLat, lat);
    maxLon = Math.max(maxLon, lon);
    maxLat = Math.max(maxLat, lat);
  }
  if (![minLon, minLat, maxLon, maxLat].every(Number.isFinite) || minLon >= maxLon || minLat >= maxLat) {
    throw new Error("Geometria do talhão inválida para gerar o raster NDVI.");
  }
  return [minLon, minLat, maxLon, maxLat];
}

function mapRenderSize(bbox: [number, number, number, number]): { width: number; height: number } {
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

async function fetchSeries(input: FetchFieldNdviInput): Promise<NdviSceneResult[]> {
  const token = await getAccessToken();
  const RESOLUTION_DEGREES = 0.0001;

  let requestBody = JSON.stringify({
    input: {
      bounds: {
        geometry: input.fieldBoundaryGeoJson,
        properties: { crs: CRS84 },
      },
      data: [
        {
          type: "sentinel-2-l2a",
          dataFilter: { maxCloudCoverage: input.maxCloudCoverPct ?? 30 },
        },
      ],
    },
    aggregation: {
      timeRange: { from: `${input.fromDate}T00:00:00Z`, to: `${input.toDate}T23:59:59Z` },
      aggregationInterval: { of: "P1D" },
      evalscript: NDVI_EVALSCRIPT,
      resx: RESOLUTION_DEGREES,
      resy: RESOLUTION_DEGREES,
    },
    calculations: {
      default: { histograms: { default: { binWidth: 0.2, lowEdge: -1, highEdge: 1 } } },
    },
  });
  requestBody = toFloatJson(requestBody);

  const response = await fetch(STATISTICS_URL, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: requestBody,
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Copernicus (estatística) respondeu ${response.status}: ${body.slice(0, 300)}`);
  }

  const payload = (await response.json()) as StatisticsApiResponse;
  return (payload.data ?? [])
    .map((entry) => toSceneResult(entry, input.toDate))
    .filter((scene): scene is NdviSceneResult => scene !== null)
    .sort((a, b) => a.capturedAt.localeCompare(b.capturedAt));
}

async function fetchMap(input: { fieldBoundaryGeoJson: FieldGeometry; capturedAt: string; maxCloudCoverPct?: number }): Promise<NdviMapResult> {
  const token = await getAccessToken();
  const bbox = fieldGeometryBbox(input.fieldBoundaryGeoJson);
  const { width, height } = mapRenderSize(bbox);

  const requestBody = {
    input: {
      bounds: {
        geometry: input.fieldBoundaryGeoJson,
        properties: { crs: CRS84 },
      },
      data: [
        {
          type: "sentinel-2-l2a",
          dataFilter: {
            timeRange: { from: `${input.capturedAt}T00:00:00Z`, to: `${input.capturedAt}T23:59:59Z` },
            mosaickingOrder: "leastCC",
            maxCloudCoverage: input.maxCloudCoverPct ?? 30,
          },
        },
      ],
    },
    output: {
      width,
      height,
      responses: [{ identifier: "default", format: { type: "image/png" } }],
    },
    evalscript: NDVI_MAP_EVALSCRIPT,
  };

  const response = await fetch(PROCESS_URL, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify(requestBody),
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Copernicus (raster NDVI) respondeu ${response.status}: ${body.slice(0, 300)}`);
  }
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("image/png")) {
    throw new Error(`Copernicus (raster NDVI) devolveu formato inesperado: ${contentType || "sem content-type"}.`);
  }

  return { bytes: await response.arrayBuffer(), bbox, width, height, capturedAt: input.capturedAt };
}

export const copernicusNdviProvider: SatelliteNdviProvider = {
  async fetchFieldNdviSeries(input) {
    return fetchSeries(input);
  },

  async fetchFieldNdvi(input) {
    const scenes = await fetchSeries(input);
    return scenes.at(-1) ?? null;
  },

  async fetchFieldNdviMap(input) {
    return fetchMap(input);
  },
};
