/**
 * Classificação de vigor vegetativo a partir de NDVI (Normalized Difference Vegetation Index),
 * aprovado pelo diretor como ferramenta de apoio -- ele mesmo enquadrou como "não é exatamente
 * preciso, mas já dá uma ajuda grande a entender as faixas de produtividade". Por isso este motor
 * NUNCA converte NDVI em número de produtividade (isso seria dado fabricado, contra a regra do
 * projeto) -- só classifica em faixas de vigor qualitativas, a mesma disciplina já usada no alerta
 * climático (orientação de manejo, nunca estimativa numérica inventada).
 *
 * Faixas usadas abaixo são as bandas de interpretação de NDVI mais citadas na literatura de
 * sensoriamento remoto agrícola (a mesma escala geral usada por USGS/EROS e pela maioria das
 * plataformas de agricultura de precisão que oferecem NDVI) -- não são específicas de nenhuma
 * cultura ou fase fenológica, por isso ficam como uma leitura geral de vigor, a ser cruzada pelo
 * agrônomo responsável com o estágio da cultura antes de virar recomendação.
 *
 * Zero import de propósito, mesma disciplina dos outros motores agronômicos (phosphorus-engine.ts,
 * fertilizer-dose-engine.ts) -- roda em qualquer runtime (Next.js ou script standalone) sem
 * depender de alias de path.
 */

export type VigorZone = "SEM_VEGETACAO" | "BAIXO" | "MODERADO" | "ALTO" | "MUITO_ALTO";

export const VIGOR_ZONE_LABELS: Record<VigorZone, string> = {
  SEM_VEGETACAO: "Sem vegetação / solo exposto",
  BAIXO: "Vigor baixo",
  MODERADO: "Vigor moderado",
  ALTO: "Vigor alto",
  MUITO_ALTO: "Vigor muito alto",
};

/** Classifica um valor pontual de NDVI (-1 a 1) em uma faixa de vigor. */
export function classifyNdviValue(ndvi: number): VigorZone {
  if (ndvi < 0.2) return "SEM_VEGETACAO";
  if (ndvi < 0.4) return "BAIXO";
  if (ndvi < 0.6) return "MODERADO";
  if (ndvi < 0.8) return "ALTO";
  return "MUITO_ALTO";
}

export type ZoneBreakdownPct = Partial<Record<VigorZone, number>>;

/**
 * A partir de um histograma de NDVI por pixel (devolvido pelo provedor de satélite), calcula o
 * percentual de área do talhão em cada faixa de vigor. `histogram` é uma lista de {ndvi, pixelCount}
 * -- o provedor real (Sentinel Hub Statistical API) já devolve os dados agregados nesse formato,
 * então este motor nunca processa pixel bruto.
 */
export function computeZoneBreakdownPct(histogram: Array<{ ndvi: number; pixelCount: number }>): ZoneBreakdownPct {
  const totalPixels = histogram.reduce((sum, bucket) => sum + bucket.pixelCount, 0);
  if (totalPixels === 0) return {};

  const pixelsByZone: Record<VigorZone, number> = {
    SEM_VEGETACAO: 0,
    BAIXO: 0,
    MODERADO: 0,
    ALTO: 0,
    MUITO_ALTO: 0,
  };
  for (const bucket of histogram) {
    const zone = classifyNdviValue(bucket.ndvi);
    pixelsByZone[zone] += bucket.pixelCount;
  }

  const breakdown: ZoneBreakdownPct = {};
  for (const zone of Object.keys(pixelsByZone) as VigorZone[]) {
    const pct = (pixelsByZone[zone] / totalPixels) * 100;
    if (pct > 0) breakdown[zone] = Math.round(pct * 100) / 100;
  }
  return breakdown;
}

export type VariabilityFlag = {
  hasSignificantVariability: boolean;
  note: string;
};

const VARIABILITY_THRESHOLD_PCT = 20;

/**
 * Sinaliza (nunca calcula número novo) quando o talhão tem variabilidade interna relevante --
 * parcelas relevantes tanto em vigor baixo quanto em vigor alto/muito alto ao mesmo tempo. Isso é
 * uma pista de que pode haver mais de uma zona de manejo dentro do mesmo talhão (ex.: parte com
 * restrição de solo, parte não) -- a decisão de investigar ou não fica com o agrônomo responsável,
 * este motor só aponta o padrão, nunca diz a causa nem recomenda uma dose diferenciada.
 */
export function detectWithinFieldVariability(breakdown: ZoneBreakdownPct): VariabilityFlag {
  const lowPct = (breakdown.SEM_VEGETACAO ?? 0) + (breakdown.BAIXO ?? 0);
  const highPct = (breakdown.ALTO ?? 0) + (breakdown.MUITO_ALTO ?? 0);

  if (lowPct >= VARIABILITY_THRESHOLD_PCT && highPct >= VARIABILITY_THRESHOLD_PCT) {
    return {
      hasSignificantVariability: true,
      note: `O talhão tem ${lowPct.toFixed(0)}% da área em vigor baixo/sem vegetação e ${highPct.toFixed(0)}% em vigor alto/muito alto na mesma imagem -- variabilidade interna real, pode valer a pena o agrônomo responsável avaliar se faz sentido dividir o talhão em zonas de manejo.`,
    };
  }
  return { hasSignificantVariability: false, note: "Sem variabilidade interna relevante detectada nesta imagem." };
}

export type NdviObservationQuality = "ALTA" | "MODERADA" | "BAIXA" | "INDETERMINADA";

export const NDVI_QUALITY_LABELS: Record<NdviObservationQuality, string> = {
  ALTA: "Qualidade alta",
  MODERADA: "Qualidade moderada",
  BAIXA: "Qualidade baixa",
  INDETERMINADA: "Qualidade não determinada",
};

export type NdviHistoryPoint = {
  capturedAt: string;
  meanNdvi: number;
  cloudCoverPct?: number | null;
  pixelCount?: number | null;
};

/**
 * Qualidade operacional da observação com base na fração sem pixel válido DENTRO do talhão.
 * `cloudCoverPct` é o nome histórico da coluna; no pipeline atual ele representa a fração mascarada
 * pelo provedor (nuvem/sombra/pixel inválido), e não uma medição meteorológica de nebulosidade.
 * Os cortes 10%/25% são somente um gate de qualidade de produto para triagem visual; não têm valor de
 * diagnóstico agronômico e não alteram a classificação determinística do NDVI.
 */
export function classifyNdviObservationQuality(point: Pick<NdviHistoryPoint, "cloudCoverPct">): NdviObservationQuality {
  const invalidPct = point.cloudCoverPct;
  if (invalidPct == null || !Number.isFinite(invalidPct)) return "INDETERMINADA";
  if (invalidPct <= 10) return "ALTA";
  if (invalidPct <= 25) return "MODERADA";
  return "BAIXA";
}

export type NdviTemporalDirection = "ALTA" | "QUEDA" | "ESTAVEL" | "SEM_BASELINE";

export type NdviTemporalAnalysis = {
  direction: NdviTemporalDirection;
  latestCapturedAt: string | null;
  latestMeanNdvi: number | null;
  latestQuality: NdviObservationQuality;
  previousCapturedAt: string | null;
  previousMeanNdvi: number | null;
  deltaFromPrevious: number | null;
  baselineMedian: number | null;
  deltaFromBaseline: number | null;
  baselineCount: number;
  hasRelevantTemporalChange: boolean;
  note: string;
};

const TEMPORAL_CHANGE_THRESHOLD = 0.12;
const MIN_BASELINE_POINTS = 3;
const MAX_BASELINE_POINTS = 5;

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/**
 * Compara a leitura mais recente com a anterior e, quando há histórico suficiente, com a mediana das
 * até cinco leituras anteriores. O limiar absoluto de 0,12 é um sinal OPERACIONAL conservador para
 * priorização de inspeção; não é limiar agronômico de deficiência e não considera cultura/fenologia.
 * Portanto a função nunca atribui causa, produtividade ou prescrição.
 */
export function analyzeNdviTemporalHistory(history: NdviHistoryPoint[]): NdviTemporalAnalysis {
  const ordered = history
    .filter((point) => Number.isFinite(point.meanNdvi) && Boolean(point.capturedAt))
    .sort((a, b) => new Date(a.capturedAt).getTime() - new Date(b.capturedAt).getTime());

  if (ordered.length === 0) {
    return {
      direction: "SEM_BASELINE",
      latestCapturedAt: null,
      latestMeanNdvi: null,
      latestQuality: "INDETERMINADA",
      previousCapturedAt: null,
      previousMeanNdvi: null,
      deltaFromPrevious: null,
      baselineMedian: null,
      deltaFromBaseline: null,
      baselineCount: 0,
      hasRelevantTemporalChange: false,
      note: "Sem leituras suficientes para análise temporal.",
    };
  }

  const latest = ordered[ordered.length - 1];
  const previous = ordered.length > 1 ? ordered[ordered.length - 2] : null;
  const prior = ordered.slice(0, -1).slice(-MAX_BASELINE_POINTS);
  const baselineMedian = prior.length >= MIN_BASELINE_POINTS ? median(prior.map((point) => point.meanNdvi)) : null;
  const deltaFromPrevious = previous ? round3(latest.meanNdvi - previous.meanNdvi) : null;
  const deltaFromBaseline = baselineMedian == null ? null : round3(latest.meanNdvi - baselineMedian);
  const hasRelevantTemporalChange = deltaFromBaseline != null && Math.abs(deltaFromBaseline) >= TEMPORAL_CHANGE_THRESHOLD;

  let direction: NdviTemporalDirection = "SEM_BASELINE";
  if (deltaFromBaseline != null) {
    if (deltaFromBaseline >= TEMPORAL_CHANGE_THRESHOLD) direction = "ALTA";
    else if (deltaFromBaseline <= -TEMPORAL_CHANGE_THRESHOLD) direction = "QUEDA";
    else direction = "ESTAVEL";
  } else if (deltaFromPrevious != null) {
    if (deltaFromPrevious >= TEMPORAL_CHANGE_THRESHOLD) direction = "ALTA";
    else if (deltaFromPrevious <= -TEMPORAL_CHANGE_THRESHOLD) direction = "QUEDA";
    else direction = "ESTAVEL";
  }

  let note = "Histórico ainda curto para comparar a leitura atual com uma linha de base do próprio talhão.";
  if (baselineMedian != null && deltaFromBaseline != null) {
    if (hasRelevantTemporalChange) {
      const verb = deltaFromBaseline > 0 ? "acima" : "abaixo";
      note = `A leitura atual está ${Math.abs(deltaFromBaseline).toFixed(2)} ponto de NDVI ${verb} da mediana das ${prior.length} leituras anteriores. É um sinal temporal para investigação, não uma causa agronômica: estágio da cultura, manejo, clima e qualidade da imagem precisam ser conferidos antes de qualquer conclusão.`;
    } else {
      note = `A leitura atual permanece próxima da mediana das ${prior.length} leituras anteriores (diferença de ${Math.abs(deltaFromBaseline).toFixed(2)} ponto de NDVI).`;
    }
  } else if (previous && deltaFromPrevious != null) {
    note = `Comparação disponível apenas com a leitura anterior: variação de ${deltaFromPrevious >= 0 ? "+" : ""}${deltaFromPrevious.toFixed(2)} ponto de NDVI. Ainda não há linha de base suficiente para sinal temporal robusto.`;
  }

  return {
    direction,
    latestCapturedAt: latest.capturedAt,
    latestMeanNdvi: latest.meanNdvi,
    latestQuality: classifyNdviObservationQuality(latest),
    previousCapturedAt: previous?.capturedAt ?? null,
    previousMeanNdvi: previous?.meanNdvi ?? null,
    deltaFromPrevious,
    baselineMedian: baselineMedian == null ? null : round3(baselineMedian),
    deltaFromBaseline,
    baselineCount: prior.length,
    hasRelevantTemporalChange,
    note,
  };
}
