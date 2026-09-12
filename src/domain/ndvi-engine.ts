/**
 * Classificação de vigor vegetativo a partir de NDVI (Normalized Difference Vegetation Index).
 *
 * Regra de produto: NDVI é evidência de vigor/refletância, nunca produtividade. Este módulo só produz
 * leituras determinísticas a partir de valores medidos pelo provedor de satélite: faixa de vigor,
 * distribuição espacial agregada, variabilidade interna e comparação temporal descritiva. Não atribui
 * causa agronômica, não estima sacas/ha e não prescreve manejo.
 *
 * Zero import de propósito: roda em qualquer runtime (Next.js ou script standalone).
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
 * A partir de um histograma de NDVI por pixel, calcula o percentual de área do talhão em cada faixa.
 * O provedor já entrega o histograma agregado; este motor não inventa nem interpola pixel ausente.
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
 * Sinaliza quando o talhão tem parcelas relevantes em vigor baixo e alto ao mesmo tempo. É somente uma
 * pista de heterogeneidade espacial; não afirma causa e não recomenda dose diferenciada.
 */
export function detectWithinFieldVariability(breakdown: ZoneBreakdownPct): VariabilityFlag {
  const lowPct = (breakdown.SEM_VEGETACAO ?? 0) + (breakdown.BAIXO ?? 0);
  const highPct = (breakdown.ALTO ?? 0) + (breakdown.MUITO_ALTO ?? 0);

  if (lowPct >= VARIABILITY_THRESHOLD_PCT && highPct >= VARIABILITY_THRESHOLD_PCT) {
    return {
      hasSignificantVariability: true,
      note: `O talhão tem ${lowPct.toFixed(0)}% da área em vigor baixo/sem vegetação e ${highPct.toFixed(0)}% em vigor alto/muito alto na mesma imagem — variabilidade interna medida; o agrônomo pode avaliar se vale investigar zonas de manejo.`,
    };
  }
  return { hasSignificantVariability: false, note: "Sem variabilidade interna relevante detectada nesta imagem." };
}

export type NdviTemporalSnapshot = {
  capturedAt: string;
  meanNdvi: number;
  cloudCoverPct?: number | null;
};

export type NdviTemporalDirection = "INCREASE" | "DECREASE" | "UNCHANGED";

export type NdviTemporalComparison =
  | {
      hasComparison: false;
      reason: "INSUFFICIENT_HISTORY";
      note: string;
    }
  | {
      hasComparison: true;
      previousAt: string;
      latestAt: string;
      daysBetween: number;
      previousMeanNdvi: number;
      latestMeanNdvi: number;
      deltaMeanNdvi: number;
      direction: NdviTemporalDirection;
      previousZone: VigorZone;
      latestZone: VigorZone;
      zoneChanged: boolean;
      previousNoDataPct: number | null;
      latestNoDataPct: number | null;
      note: string;
    };

function validTemporalSnapshot(snapshot: NdviTemporalSnapshot) {
  return Number.isFinite(snapshot.meanNdvi) && Number.isFinite(new Date(snapshot.capturedAt).getTime());
}

/**
 * Compara as duas aquisições válidas MAIS RECENTES em datas diferentes.
 *
 * Importante: não existe limiar agronômico de “anomalia” aqui. O motor devolve o delta medido, intervalo,
 * mudança (ou não) de faixa e qualidade/no-data das duas cenas. Assim a RAIZ ganha um sinal temporal útil
 * sem transformar uma diferença de NDVI em diagnóstico de doença, fertilidade ou produtividade.
 */
export function compareLatestNdviSnapshots(history: NdviTemporalSnapshot[]): NdviTemporalComparison {
  const byDate = [...history]
    .filter(validTemporalSnapshot)
    .sort((a, b) => new Date(a.capturedAt).getTime() - new Date(b.capturedAt).getTime());

  // Mantém uma aquisição por instante/data textual. Se o mesmo snapshot foi lido duas vezes do banco/API,
  // ele não pode virar sua própria referência temporal.
  const distinct: NdviTemporalSnapshot[] = [];
  for (const snapshot of byDate) {
    const previous = distinct[distinct.length - 1];
    if (previous?.capturedAt === snapshot.capturedAt) distinct[distinct.length - 1] = snapshot;
    else distinct.push(snapshot);
  }

  if (distinct.length < 2) {
    return {
      hasComparison: false,
      reason: "INSUFFICIENT_HISTORY",
      note: "São necessárias pelo menos duas aquisições válidas em datas diferentes para comparar a evolução temporal do vigor.",
    };
  }

  const previous = distinct[distinct.length - 2];
  const latest = distinct[distinct.length - 1];
  const previousTime = new Date(previous.capturedAt).getTime();
  const latestTime = new Date(latest.capturedAt).getTime();
  const daysBetween = Math.max(0, Math.round((latestTime - previousTime) / 86_400_000));
  const delta = latest.meanNdvi - previous.meanNdvi;
  const roundedDelta = Math.round(delta * 1000) / 1000;
  const direction: NdviTemporalDirection = roundedDelta > 0 ? "INCREASE" : roundedDelta < 0 ? "DECREASE" : "UNCHANGED";
  const previousZone = classifyNdviValue(previous.meanNdvi);
  const latestZone = classifyNdviValue(latest.meanNdvi);
  const signedDelta = `${roundedDelta > 0 ? "+" : ""}${roundedDelta.toFixed(3)}`;
  const movement = direction === "INCREASE" ? "subiu" : direction === "DECREASE" ? "caiu" : "permaneceu estável na precisão exibida";
  const zoneText = previousZone === latestZone
    ? `A faixa permaneceu em ${VIGOR_ZONE_LABELS[latestZone].toLowerCase()}.`
    : `A faixa mudou de ${VIGOR_ZONE_LABELS[previousZone].toLowerCase()} para ${VIGOR_ZONE_LABELS[latestZone].toLowerCase()}.`;

  return {
    hasComparison: true,
    previousAt: previous.capturedAt,
    latestAt: latest.capturedAt,
    daysBetween,
    previousMeanNdvi: previous.meanNdvi,
    latestMeanNdvi: latest.meanNdvi,
    deltaMeanNdvi: roundedDelta,
    direction,
    previousZone,
    latestZone,
    zoneChanged: previousZone !== latestZone,
    previousNoDataPct: previous.cloudCoverPct ?? null,
    latestNoDataPct: latest.cloudCoverPct ?? null,
    note: `O NDVI médio ${movement} de ${previous.meanNdvi.toFixed(2)} para ${latest.meanNdvi.toFixed(2)} (${signedDelta}) em ${daysBetween} dia${daysBetween === 1 ? "" : "s"}. ${zoneText} Sinal temporal descritivo: não identifica causa agronômica nem estima produtividade.`,
  };
}
