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
 * *** Não testado com credencial real -- ver docs/PROJECT_STATE.md, item 4 do checklist. *** A forma
 * da API (OAuth2 client-credentials + endpoint /api/v1/statistics) segue a documentação pública da
 * Copernicus Data Space Ecosystem / Sentinel Hub, mas nenhuma chamada real foi feita nesta sessão
 * porque a instância não tem `COPERNICUS_CLIENT_ID`/`COPERNICUS_CLIENT_SECRET` configurados.
 */

const TOKEN_URL = "https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token";
const STATISTICS_URL = "https://sh.dataspace.copernicus.eu/api/v1/statistics";

// NDVI = (B08 - B04) / (B08 + B04). dataMask exclui pixel de nuvem/sombra (já filtrado pelo Sentinel
// Hub a partir do SCL da cena L2A) do cálculo de média/histograma.
const NDVI_EVALSCRIPT = `//VERSION=3
function setup() {
  return {
    input: [{ bands: ["B04", "B08", "dataMask"] }],
    output: [{ id: "default", bands: 1 }],
  };
}
function evaluatePixel(sample) {
  let ndvi = (sample.B08 - sample.B04) / (sample.B08 + sample.B04 + 1e-9);
  return [sample.dataMask === 1 ? ndvi : NaN];
}`;

export type NdviHistogramBucket = { ndvi: number; pixelCount: number };

export type NdviSceneResult = {
  capturedAt: string;
  meanNdvi: number;
  minNdvi: number;
  maxNdvi: number;
  stddevNdvi: number | null;
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

/** Contrato do provedor -- deliberadamente pequeno, pra permitir trocar de fonte de satélite no futuro sem tocar no resto da aplicação (mesmo padrão do `PaymentProvider` em `src/domain/billing.ts`). */
export interface SatelliteNdviProvider {
  /** `null` quando não há nenhuma cena com nuvem aceitável no intervalo pedido -- nunca inventa leitura. */
  fetchFieldNdvi(input: FetchFieldNdviInput): Promise<NdviSceneResult | null>;
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

type StatisticsApiResponse = {
  data?: Array<{
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
  }>;
};

function toHistogram(bins: Array<{ lowEdge: number; highEdge: number; count: number }> | undefined): NdviHistogramBucket[] {
  if (!bins) return [];
  return bins
    .filter((bin) => bin.count > 0)
    .map((bin) => ({ ndvi: (bin.lowEdge + bin.highEdge) / 2, pixelCount: bin.count }));
}

export const copernicusNdviProvider: SatelliteNdviProvider = {
  async fetchFieldNdvi(input) {
    const token = await getAccessToken();

    const response = await fetch(STATISTICS_URL, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({
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
          resx: 10,
          resy: 10,
        },
        calculations: {
          default: { histograms: { default: { nBins: 10, lowEdge: -1, highEdge: 1 } } },
        },
      }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`Copernicus (estatística) respondeu ${response.status}: ${body.slice(0, 300)}`);
    }

    const payload = (await response.json()) as StatisticsApiResponse;
    // A API devolve uma entrada por dia com cena disponível dentro do intervalo -- pega a mais
    // recente com dado válido (sampleCount > 0); dias sem passagem de satélite ou 100% nuvem não
    // aparecem, ou aparecem com sampleCount 0.
    const scenes = (payload.data ?? []).filter((entry) => (entry.outputs?.default?.bands?.B0?.stats?.sampleCount ?? 0) > 0);
    if (scenes.length === 0) return null;

    const latest = scenes[scenes.length - 1];
    const stats = latest.outputs?.default?.bands?.B0?.stats;
    if (!stats || stats.mean === undefined || stats.min === undefined || stats.max === undefined) return null;

    const sampleCount = stats.sampleCount ?? 0;
    const noDataCount = stats.noDataCount ?? 0;
    const cloudCoverPct = sampleCount + noDataCount > 0 ? (noDataCount / (sampleCount + noDataCount)) * 100 : null;

    return {
      capturedAt: (latest.interval?.from ?? input.toDate).slice(0, 10),
      meanNdvi: stats.mean,
      minNdvi: stats.min,
      maxNdvi: stats.max,
      stddevNdvi: stats.stDev ?? null,
      cloudCoverPct,
      pixelCount: sampleCount,
      histogram: toHistogram(latest.outputs?.default?.bands?.B0?.histogram?.bins),
      sceneId: null,
    };
  },
};
