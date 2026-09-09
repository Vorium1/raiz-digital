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
