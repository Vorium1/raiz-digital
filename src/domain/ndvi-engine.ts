/**
 * Classificação de vigor vegetativo a partir de NDVI (Normalized Difference Vegetation Index),
 * aprovado pelo diretor como ferramenta de apoio -- ele mesmo enquadrou como "não é exatamente
 * preciso, mas já dá uma ajuda grande a entender as faixas de produtividade". Por isso este motor
 * NUNCA converte NDVI em número de produtividade (isso seria dado fabricado, contra a regra do
 * projeto) -- só classifica em faixas de vigor qualitativas, a mesma disciplina já usada no alerta
 * climático (orientação de manejo, nunca estimativa numérica inventada).
 *
 * Faixas usadas abaixo são as bandas de interpretação de NDVI mais citadas na literatura de
 * sensoriamento remoto agrícola -- não são específicas de nenhuma cultura ou fase fenológica, por
 * isso ficam como uma leitura geral de vigor, a ser contextualizada pelo agrônomo responsável.
 *
 * Zero import de propósito, mesma disciplina dos outros motores agronômicos -- roda em qualquer
 * runtime (Next.js ou script standalone) sem depender de alias de path.
 */

export type VigorZone = "SEM_VEGETACAO" | "BAIXO" | "MODERADO" | "ALTO" | "MUITO_ALTO";

export const VIGOR_ZONE_LABELS: Record<VigorZone, string> = {
  SEM_VEGETACAO: "Sem vegetação / solo exposto",
  BAIXO: "Vigor baixo",
  MODERADO: "Vigor moderado",
  ALTO: "Vigor alto",
  MUITO_ALTO: "Vigor muito alto",
};

export function classifyNdviValue(ndvi: number): VigorZone {
  if (ndvi < 0.2) return "SEM_VEGETACAO";
  if (ndvi < 0.4) return "BAIXO";
  if (ndvi < 0.6) return "MODERADO";
  if (ndvi < 0.8) return "ALTO";
  return "MUITO_ALTO";
}

export type ZoneBreakdownPct = Partial<Record<VigorZone, number>>;

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
  for (const bucket of histogram) pixelsByZone[classifyNdviValue(bucket.ndvi)] += bucket.pixelCount;

  const breakdown: ZoneBreakdownPct = {};
  for (const zone of Object.keys(pixelsByZone) as VigorZone[]) {
    const pct = (pixelsByZone[zone] / totalPixels) * 100;
    if (pct > 0) breakdown[zone] = Math.round(pct * 100) / 100;
  }
  return breakdown;
}

export type VariabilityFlag = { hasSignificantVariability: boolean; note: string };
const VARIABILITY_THRESHOLD_PCT = 20;

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
 * Qualidade operacional com base na fração sem pixel válido DENTRO do talhão. `cloudCoverPct` é o
 * nome histórico da coluna; no pipeline atual significa fração mascarada (nuvem/sombra/pixel
 * inválido), não nebulosidade meteorológica. Os cortes 10%/25% são um gate de produto para triagem
 * visual, não limiares agronômicos.
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
 * Compara a leitura mais recente com a última leitura COMPARÁVEL e, quando há histórico suficiente,
 * com a mediana de até cinco aquisições anteriores de qualidade não-baixa. Leituras com >25% da área
 * sem pixel válido são preservadas no histórico, mas não entram no baseline; se a leitura atual tiver
 * qualidade baixa, ela também não pode disparar `hasRelevantTemporalChange`.
 *
 * O limiar absoluto de 0,12 continua sendo somente um sinal OPERACIONAL conservador para priorização
 * de inspeção; não é limiar de deficiência, não conhece cultura/fenologia e nunca autoriza prescrição.
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
  const latestQuality = classifyNdviObservationQuality(latest);
  const comparablePrior = ordered.slice(0, -1).filter((point) => classifyNdviObservationQuality(point) !== "BAIXA");
  const previous = comparablePrior.at(-1) ?? null;
  const prior = comparablePrior.slice(-MAX_BASELINE_POINTS);
  const baselineMedian = prior.length >= MIN_BASELINE_POINTS ? median(prior.map((point) => point.meanNdvi)) : null;
  const deltaFromPrevious = previous ? round3(latest.meanNdvi - previous.meanNdvi) : null;
  const deltaFromBaseline = baselineMedian == null ? null : round3(latest.meanNdvi - baselineMedian);
  const rawRelevantChange = deltaFromBaseline != null && Math.abs(deltaFromBaseline) >= TEMPORAL_CHANGE_THRESHOLD;
  const hasRelevantTemporalChange = latestQuality !== "BAIXA" && rawRelevantChange;

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
  if (latestQuality === "BAIXA") {
    const masked = latest.cloudCoverPct == null ? "mais de 25%" : `${Math.round(latest.cloudCoverPct)}%`;
    note = `A leitura atual tem qualidade baixa (${masked} da área sem pixel válido). Ela permanece disponível para inspeção visual, mas não dispara sinal temporal acionável; use uma aquisição de melhor qualidade antes de concluir tendência.`;
  } else if (baselineMedian != null && deltaFromBaseline != null) {
    if (hasRelevantTemporalChange) {
      const verb = deltaFromBaseline > 0 ? "acima" : "abaixo";
      note = `A leitura atual está ${Math.abs(deltaFromBaseline).toFixed(2)} ponto de NDVI ${verb} da mediana das ${prior.length} aquisições anteriores comparáveis. É um sinal temporal para investigação, não uma causa agronômica: estágio da cultura, manejo e clima precisam ser conferidos antes de qualquer conclusão.`;
    } else {
      note = `A leitura atual permanece próxima da mediana das ${prior.length} aquisições anteriores comparáveis (diferença de ${Math.abs(deltaFromBaseline).toFixed(2)} ponto de NDVI).`;
    }
  } else if (previous && deltaFromPrevious != null) {
    note = `Comparação disponível apenas com a última aquisição comparável: variação de ${deltaFromPrevious >= 0 ? "+" : ""}${deltaFromPrevious.toFixed(2)} ponto de NDVI. Ainda não há linha de base suficiente para sinal temporal robusto.`;
  }

  return {
    direction,
    latestCapturedAt: latest.capturedAt,
    latestMeanNdvi: latest.meanNdvi,
    latestQuality,
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
