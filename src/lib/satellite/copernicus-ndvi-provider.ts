/**
 * NDVI real por satélite (Sentinel-2) via Copernicus Data Space Ecosystem -- item 4 do checklist do
 * diretor (2026-09-08), aprovado por ele como ferramenta de apoio, não como número de produtividade.
 * Fonte é gratuita (tier grátis do Copernicus Data Space Ecosystem, sucessor oficial do antigo
 * Copernicus Open Access Hub), a mesma preferência por self-serve/gratuito já usada no resto do
 * projeto (clima via INMET/CPTEC, por exemplo).
 *
 * Usa a Statistical API do Sentinel Hub (a mesma API, hospedada agora sob o domínio da Copernicus
 * Data Space Ecosystem) -- ela já devolve estatística agregada (média/mín/máx/desvio padrão) e um
 * histograma de NDVI por polígono e intervalo de datas, sem a aplicação precisar baixar nem
 * processar imagem/raster bruto. Igual ao `gemini-lab-extraction-provider.ts`: a IA/API externa aqui
 * só devolve NÚMERO MEDIDO (reflectância das bandas do satélite) -- a classificação em faixa de
 * vigor é sempre feita depois, de forma determinística, por `src/domain/ndvi-engine.ts`.
 *
 * A máscara usa SCL (Scene Classification Layer) do Sentinel-2 L2A. Classes de nuvem, cirrus,
 * sombra, neve/gelo, pixel defeituoso e não classificado são excluídas do cálculo; só pixels SCL 4
 * (vegetação), 5 (não vegetado) e 6 (água) entram no NDVI. Isso é mais seguro do que usar apenas
 * `dataMask`, que indica validade/cobertura mas não é, sozinho, uma máscara de nuvens.
 */

const TOKEN_URL = "https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token";
const STATISTICS_URL = "https://sh.dataspace.copernicus.eu/api/v1/statistics";

// NDVI = (B08 - B04) / (B08 + B04). SCL garante que nuvem/sombra/pixel defeituoso não contamine
// média, extremos e histograma do talhão.
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

// A Statistical API valida o TIPO JSON de lowEdge/highEdge contra o tipo do binWidth -- um número
// inteiro (`-1`) e um float (`0.2`) são tratados como tipos diferentes e a API recusa com 400. JSON.stringify
// nunca escreve ".0" pra um float de valor inteiro, então reescrevemos só esses limites serializados.
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
  /** Nome mantido por compatibilidade com banco/API. Representa % de pixels mascarados/sem dado válido dentro do talhão. */
  cloudCoverPct: number | null;
  pixelCount: number;
  histogram: NdviHistogramBucket[];
  sceneId: string | null;
};

export type FetchFieldNdviInput = {
  fieldBoundaryGeoJson: { type: string; coordinates: unknown };
  fromDate: string;
  toDate: string;
  maxCloudCoverPct?: number;
};

/** Contrato pequeno pra permitir trocar a fonte de satélite sem tocar no restante da aplicação. */
export interface SatelliteNdviProvider {
  /** `null` quando não há cena válida no intervalo -- nunca inventa leitura. */
  fetchFieldNdvi(input: FetchFieldNdviInput): Promise<NdviSceneResult | null>;
  /** Série diária válida do intervalo, em ordem cronológica. */
  fetchFieldNdviSeries(input: FetchFieldNdviInput): Promise<NdviSceneResult[]>;
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

async function fetchSeries(input: FetchFieldNdviInput): Promise<NdviSceneResult[]> {
  const token = await getAccessToken();

  // resx/resy são interpretados na unidade do CRS dos limites (graus, WGS84), não em metros.
  // ~0,0001° mantém granularidade próxima da resolução nativa de 10 m das bandas B04/B08.
  const RESOLUTION_DEGREES = 0.0001;

  let requestBody = JSON.stringify({
    input: {
      bounds: {
        geometry: input.fieldBoundaryGeoJson,
        properties: { crs: "http://www.opengis.net/def/crs/EPSG/0/4326" },
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

export const copernicusNdviProvider: SatelliteNdviProvider = {
  async fetchFieldNdviSeries(input) {
    return fetchSeries(input);
  },

  async fetchFieldNdvi(input) {
    const scenes = await fetchSeries(input);
    return scenes.at(-1) ?? null;
  },
};
