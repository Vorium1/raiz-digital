/**
 * Classificação de vigor vegetativo a partir de NDVI (Normalized Difference Vegetation Index),
 * aprovado pelo diretor como ferramenta de apoio. Este motor NUNCA converte NDVI em produtividade:
 * só classifica vigor qualitativo e sinais temporais operacionais, que precisam ser contextualizados
 * pelo agrônomo responsável com cultura, fenologia, manejo e clima.
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

function isComparableQuality(quality: NdviObservationQuality): boolean {
  return quality === "ALTA" || quality === "MODERADA";
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

export const NDVI_NDVI_TEMPORAL_CHANGE_THRESHOLD = 0.12;
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
 * Compara a leitura mais recente com a última aquisição COMPARÁVEL e, quando há histórico suficiente,
 * com a mediana de até cinco aquisições anteriores de qualidade alta/moderada. Leituras de qualidade
 * baixa OU indeterminada permanecem no histórico para inspeção, mas não entram no baseline. A leitura
 * atual também só pode disparar `hasRelevantTemporalChange` quando sua qualidade é alta/moderada.
 *
 * O limiar absoluto de 0,12 é somente um sinal OPERACIONAL conservador para priorização de inspeção;
 * não é limiar de deficiência, não conhece cultura/fenologia e nunca autoriza prescrição.
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
  const comparablePrior = ordered
    .slice(0, -1)
    .filter((point) => isComparableQuality(classifyNdviObservationQuality(point)));
  const previous = comparablePrior.at(-1) ?? null;
  const prior = comparablePrior.slice(-MAX_BASELINE_POINTS);
  const baselineMedian = prior.length >= MIN_BASELINE_POINTS ? median(prior.map((point) => point.meanNdvi)) : null;
  const deltaFromPrevious = previous ? round3(latest.meanNdvi - previous.meanNdvi) : null;
  const deltaFromBaseline = baselineMedian == null ? null : round3(latest.meanNdvi - baselineMedian);
  const rawRelevantChange = deltaFromBaseline != null && Math.abs(deltaFromBaseline) >= NDVI_TEMPORAL_CHANGE_THRESHOLD;
  const hasRelevantTemporalChange = isComparableQuality(latestQuality) && rawRelevantChange;

  let direction: NdviTemporalDirection = "SEM_BASELINE";
  if (deltaFromBaseline != null) {
    if (deltaFromBaseline >= NDVI_TEMPORAL_CHANGE_THRESHOLD) direction = "ALTA";
    else if (deltaFromBaseline <= -NDVI_TEMPORAL_CHANGE_THRESHOLD) direction = "QUEDA";
    else direction = "ESTAVEL";
  } else if (deltaFromPrevious != null) {
    if (deltaFromPrevious >= NDVI_TEMPORAL_CHANGE_THRESHOLD) direction = "ALTA";
    else if (deltaFromPrevious <= -NDVI_TEMPORAL_CHANGE_THRESHOLD) direction = "QUEDA";
    else direction = "ESTAVEL";
  }

  let note = "Histórico ainda curto para comparar a leitura atual com uma linha de base do próprio talhão.";
  if (latestQuality === "BAIXA") {
    const masked = latest.cloudCoverPct == null ? "mais de 25%" : `${Math.round(latest.cloudCoverPct)}%`;
    note = `A leitura atual tem qualidade baixa (${masked} da área sem pixel válido). Ela permanece disponível para inspeção visual, mas não dispara sinal temporal acionável; use uma aquisição de melhor qualidade antes de concluir tendência.`;
  } else if (latestQuality === "INDETERMINADA") {
    note = "A leitura atual não tem informação suficiente de qualidade espacial para validar um sinal temporal. Ela permanece visível, mas não dispara alerta de alta/queda até que exista uma aquisição com qualidade mensurável.";
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


export type NdviPairwisePoint = NdviHistoryPoint & {
  id?: string | null;
  source?: string | null;
  rasterAlgorithm?: string | null;
  zoneBreakdownPct?: ZoneBreakdownPct;
};

export type NdviPairwiseDirection = "ALTA" | "QUEDA" | "ESTAVEL" | "NAO_COMPARAVEL";

export type NdviPairwiseComparison = {
  earlier: NdviPairwisePoint;
  later: NdviPairwisePoint;
  inputOrderReversed: boolean;
  daysBetween: number;
  deltaMeanNdvi: number;
  direction: NdviPairwiseDirection;
  hasRelevantTemporalChange: boolean;
  comparable: boolean;
  earlierQuality: NdviObservationQuality;
  laterQuality: NdviObservationQuality;
  comparabilityReason: string | null;
  lowVigorDeltaPct: number | null;
  highVigorDeltaPct: number | null;
  note: string;
};

function sumZonePct(breakdown: ZoneBreakdownPct | undefined, zones: VigorZone[]): number | null {
  if (!breakdown) return null;
  return round3(zones.reduce((total, zone) => total + (breakdown[zone] ?? 0), 0));
}

function parseCapturedAt(value: string): number | null {
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
}

/**
 * Compara duas aquisições REAIS escolhidas pelo usuário.
 *
 * A ordem cronológica é normalizada antes do cálculo. Uma comparação só produz direção operacional
 * quando as duas leituras têm qualidade alta/moderada e, quando declarados em ambos os snapshots,
 * fonte e versão do algoritmo são compatíveis. Leituras não comparáveis continuam visíveis para
 * inspeção, mas não recebem sinal acionável.
 *
 * O mesmo limiar operacional de 0,12 usado na série temporal é reutilizado. Ele NÃO é limiar
 * agronômico, não conhece fenologia e não autoriza inferência causal ou prescrição.
 */
export function compareNdviSnapshots(a: NdviPairwisePoint, b: NdviPairwisePoint): NdviPairwiseComparison {
  const aTime = parseCapturedAt(a.capturedAt);
  const bTime = parseCapturedAt(b.capturedAt);
  const aValid = aTime != null && Number.isFinite(a.meanNdvi);
  const bValid = bTime != null && Number.isFinite(b.meanNdvi);

  const ordered = aTime != null && bTime != null && aTime > bTime
    ? { earlier: b, later: a, earlierTime: bTime, laterTime: aTime, reversed: true }
    : { earlier: a, later: b, earlierTime: aTime, laterTime: bTime, reversed: false };

  const earlierQuality = classifyNdviObservationQuality(ordered.earlier);
  const laterQuality = classifyNdviObservationQuality(ordered.later);
  const sameAcquisition = Boolean(
    (a.id && b.id && a.id === b.id)
    || (a.capturedAt === b.capturedAt && a.source === b.source && a.rasterAlgorithm === b.rasterAlgorithm),
  );
  const sourceMismatch = Boolean(a.source && b.source && a.source !== b.source);
  const algorithmMismatch = Boolean(a.rasterAlgorithm && b.rasterAlgorithm && a.rasterAlgorithm !== b.rasterAlgorithm);
  const qualityComparable = isComparableQuality(earlierQuality) && isComparableQuality(laterQuality);

  let comparabilityReason: string | null = null;
  if (!aValid || !bValid) {
    comparabilityReason = "Uma das aquisições não possui data/NDVI médio válido.";
  } else if (sameAcquisition) {
    comparabilityReason = "Selecione duas aquisições diferentes para calcular evolução.";
  } else if (sourceMismatch) {
    comparabilityReason = "As aquisições usam fontes diferentes; a RAIZ preserva a inspeção, mas não classifica a variação.";
  } else if (algorithmMismatch) {
    comparabilityReason = "As aquisições usam versões diferentes do algoritmo NDVI; a RAIZ não classifica a variação entre versões.";
  } else if (!qualityComparable) {
    const labels = [NDVI_QUALITY_LABELS[earlierQuality], NDVI_QUALITY_LABELS[laterQuality]].join(" × ");
    comparabilityReason = `A qualidade das duas aquisições não sustenta um sinal temporal acionável (${labels}).`;
  }

  const comparable = comparabilityReason == null;
  const deltaMeanNdvi = round3(ordered.later.meanNdvi - ordered.earlier.meanNdvi);
  const hasRelevantTemporalChange = comparable && Math.abs(deltaMeanNdvi) >= NDVI_TEMPORAL_CHANGE_THRESHOLD;
  let direction: NdviPairwiseDirection = "NAO_COMPARAVEL";
  if (comparable) {
    if (deltaMeanNdvi >= NDVI_TEMPORAL_CHANGE_THRESHOLD) direction = "ALTA";
    else if (deltaMeanNdvi <= -NDVI_TEMPORAL_CHANGE_THRESHOLD) direction = "QUEDA";
    else direction = "ESTAVEL";
  }

  const lowEarlier = sumZonePct(ordered.earlier.zoneBreakdownPct, ["SEM_VEGETACAO", "BAIXO"]);
  const lowLater = sumZonePct(ordered.later.zoneBreakdownPct, ["SEM_VEGETACAO", "BAIXO"]);
  const highEarlier = sumZonePct(ordered.earlier.zoneBreakdownPct, ["ALTO", "MUITO_ALTO"]);
  const highLater = sumZonePct(ordered.later.zoneBreakdownPct, ["ALTO", "MUITO_ALTO"]);
  const lowVigorDeltaPct = lowEarlier == null || lowLater == null ? null : round3(lowLater - lowEarlier);
  const highVigorDeltaPct = highEarlier == null || highLater == null ? null : round3(highLater - highEarlier);
  const daysBetween = ordered.earlierTime == null || ordered.laterTime == null
    ? 0
    : Math.max(0, Math.round((ordered.laterTime - ordered.earlierTime) / 86_400_000));

  let note: string;
  if (!comparable) {
    note = `${comparabilityReason} As duas imagens podem ser inspecionadas, mas esta comparação não deve ser usada para concluir tendência.`;
  } else if (hasRelevantTemporalChange) {
    const movement = direction === "ALTA" ? "aumento" : "queda";
    note = `Houve ${movement} de ${Math.abs(deltaMeanNdvi).toFixed(2)} ponto de NDVI entre as aquisições, acima do limiar operacional de ${NDVI_TEMPORAL_CHANGE_THRESHOLD.toFixed(2)}. É um sinal para investigação, não uma causa agronômica: estágio da cultura, manejo, clima e demais evidências precisam ser conferidos.`;
  } else {
    note = `A diferença de ${Math.abs(deltaMeanNdvi).toFixed(2)} ponto de NDVI ficou abaixo do limiar operacional de ${NDVI_TEMPORAL_CHANGE_THRESHOLD.toFixed(2)}. A RAIZ classifica o par como estável para triagem temporal; isso não significa ausência de mudança agronômica.`;
  }

  return {
    earlier: ordered.earlier,
    later: ordered.later,
    inputOrderReversed: ordered.reversed,
    daysBetween,
    deltaMeanNdvi,
    direction,
    hasRelevantTemporalChange,
    comparable,
    earlierQuality,
    laterQuality,
    comparabilityReason,
    lowVigorDeltaPct,
    highVigorDeltaPct,
    note,
  };
}
