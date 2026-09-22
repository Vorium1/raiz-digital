/**
 * Resumo descritivo de valores observados de um parâmetro nos pontos de uma ordem de coleta. Puramente
 * derivado dos valores reais já carregados (nunca busca nem infere dado novo) -- usado pela sub-aba
 * "Solo e Fertilidade" do Talhão 360° e pelo explorador de mapas, pra nunca esconder os valores brutos só
 * porque falta faixa homologada (Fase 2, Bloco B).
 */
export type ParameterDistribution = {
  parameterCode: string;
  unit: string | null;
  sampleCount: number;
  observedCount: number;
  missingCount: number;
  min: number | null;
  max: number | null;
  mean: number | null;
  median: number | null;
};

export function computeParameterDistribution(
  parameterCode: string,
  points: Array<{ value?: number | null; unit?: string | null; collectedAt: string | null }>,
): ParameterDistribution {
  const collected = points.filter((point) => point.collectedAt);
  const observedValues = collected
    .map((point) => point.value)
    .filter((value): value is number => value != null && Number.isFinite(value));
  const sorted = [...observedValues].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length === 0 ? null : sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
  const unit = collected.find((point) => point.value != null)?.unit ?? null;

  return {
    parameterCode,
    unit,
    sampleCount: collected.length,
    observedCount: observedValues.length,
    missingCount: collected.length - observedValues.length,
    min: sorted.length ? sorted[0] : null,
    max: sorted.length ? sorted[sorted.length - 1] : null,
    mean: observedValues.length ? observedValues.reduce((sum, value) => sum + value, 0) / observedValues.length : null,
    median,
  };
}
