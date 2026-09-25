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

export type SoilSatelliteTemporalStatus =
  | "SAME_DATE"
  | "DATE_GAP"
  | "SOIL_DATE_MISSING"
  | "SATELLITE_DATE_MISSING"
  | "SATELLITE_QUALITY_LIMITED";

export type SoilSatelliteTemporalRelation = {
  status: SoilSatelliteTemporalStatus;
  soilCollectedAt: string | null;
  satelliteCapturedAt: string | null;
  satelliteQuality: NdviObservationQuality;
  daysApart: number | null;
  sequence: "SOIL_BEFORE_SATELLITE" | "SATELLITE_BEFORE_SOIL" | "SAME_DATE" | "UNKNOWN";
  note: string;
};

function calendarDayStamp(value: string | null | undefined): number | null {
  if (!value) return null;
  const isoDay = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (isoDay) {
    const year = Number(isoDay[1]);
    const month = Number(isoDay[2]);
    const day = Number(isoDay[3]);
    const stamp = Date.UTC(year, month - 1, day);
    return Number.isFinite(stamp) ? stamp : null;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate());
}

/**
 * Contexto temporal para a sobreposição Solo × Satélite.
 *
 * Deliberadamente NÃO existe um corte do tipo “até X dias é comparável”. O RAIZ não possui uma
 * regra agronômica homologada que transforme distância de calendário, sozinha, em comparabilidade
 * entre solo e resposta espectral. A função só registra fatos: datas, ordem, distância em dias e
 * qualidade operacional da imagem. Datas diferentes permanecem como cruzamento espacial/descritivo
 * que exige cultura, fenologia, manejo e clima antes de qualquer interpretação agronômica.
 */
export function assessSoilSatelliteTemporalRelation(input: {
  soilCollectedAt: string | null | undefined;
  satelliteCapturedAt: string | null | undefined;
  satelliteCloudCoverPct?: number | null;
}): SoilSatelliteTemporalRelation {
  const soilStamp = calendarDayStamp(input.soilCollectedAt);
  const satelliteStamp = calendarDayStamp(input.satelliteCapturedAt);
  const satelliteQuality = classifyNdviObservationQuality({ cloudCoverPct: input.satelliteCloudCoverPct ?? null });

  if (satelliteStamp == null) {
    return {
      status: "SATELLITE_DATE_MISSING",
      soilCollectedAt: input.soilCollectedAt ?? null,
      satelliteCapturedAt: input.satelliteCapturedAt ?? null,
      satelliteQuality,
      daysApart: null,
      sequence: "UNKNOWN",
      note: "Sem data de aquisição NDVI válida. A relação temporal Solo × Satélite não pode ser avaliada.",
    };
  }

  if (soilStamp == null) {
    return {
      status: "SOIL_DATE_MISSING",
      soilCollectedAt: input.soilCollectedAt ?? null,
      satelliteCapturedAt: input.satelliteCapturedAt ?? null,
      satelliteQuality,
      daysApart: null,
      sequence: "UNKNOWN",
      note: "A data de coleta do solo não está registrada para este ponto. A sobreposição espacial continua visível, mas a evidência temporal é insuficiente.",
    };
  }

  const signedDays = Math.round((satelliteStamp - soilStamp) / 86_400_000);
  const daysApart = Math.abs(signedDays);
  const sequence: SoilSatelliteTemporalRelation["sequence"] = signedDays === 0
    ? "SAME_DATE"
    : signedDays > 0
      ? "SOIL_BEFORE_SATELLITE"
      : "SATELLITE_BEFORE_SOIL";

  if (!isComparableQuality(satelliteQuality)) {
    return {
      status: "SATELLITE_QUALITY_LIMITED",
      soilCollectedAt: input.soilCollectedAt ?? null,
      satelliteCapturedAt: input.satelliteCapturedAt ?? null,
      satelliteQuality,
      daysApart,
      sequence,
      note: `A imagem NDVI tem ${NDVI_QUALITY_LABELS[satelliteQuality].toLowerCase()}. As datas e a distância temporal podem ser inspecionadas, mas o satélite não sustenta um sinal temporal acionável.`,
    };
  }

  if (daysApart === 0) {
    return {
      status: "SAME_DATE",
      soilCollectedAt: input.soilCollectedAt ?? null,
      satelliteCapturedAt: input.satelliteCapturedAt ?? null,
      satelliteQuality,
      daysApart: 0,
      sequence,
      note: "Solo e satélite têm a mesma data civil. Isso reduz a distância temporal conhecida, mas não prova correlação, causalidade ou resposta agronômica.",
    };
  }

  const orderText = sequence === "SOIL_BEFORE_SATELLITE"
    ? "a coleta de solo ocorreu antes da imagem"
    : "a imagem ocorreu antes da coleta de solo";
  return {
    status: "DATE_GAP",
    soilCollectedAt: input.soilCollectedAt ?? null,
    satelliteCapturedAt: input.satelliteCapturedAt ?? null,
    satelliteQuality,
    daysApart,
    sequence,
    note: `${daysApart} ${daysApart === 1 ? "dia" : "dias"} de separação; ${orderText}. A RAIZ não usa esse intervalo, sozinho, para declarar comparabilidade agronômica: o cruzamento permanece espacial e descritivo.`,
  };
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
  const rawRelevantChange = deltaFromBaseline != null && Math.abs(deltaFromBaseline) >= TEMPORAL_CHANGE_THRESHOLD;
  const hasRelevantTemporalChange = isComparableQuality(latestQuality) && rawRelevantChange;

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
