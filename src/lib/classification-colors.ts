/**
 * Cor de uma classificação agronômica, a partir do rótulo homologado
 * (ex.: "Muito baixo", "Baixo", "Adequado", "Alto", "Muito alto"). Nunca
 * calcula posição/severidade por conta própria — só reconhece o vocabulário
 * padrão de faixa de suficiência; qualquer rótulo fora desse vocabulário
 * cai no cinza neutro, nunca numa cor de "adequado" por padrão.
 */
export const CLASSIFICATION_PALETTE = {
  deficient: "#D9655A",
  low: "#D89943",
  adequate: "#29966F",
  high: "#3A86B8",
  excess: "#8B5CF6",
  neutral: "#9AA79F",
} as const;

export function classificationColor(label: string | null | undefined): string {
  if (!label) return CLASSIFICATION_PALETTE.neutral;
  const normalized = label
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
  if (normalized.includes("muito baixo") || normalized.includes("muito deficiente") || normalized === "deficiente") return CLASSIFICATION_PALETTE.deficient;
  if (normalized.includes("baixo")) return CLASSIFICATION_PALETTE.low;
  if (normalized.includes("adequad") || normalized.includes("ideal") || normalized.includes("otimo") || normalized.includes("suficiente")) return CLASSIFICATION_PALETTE.adequate;
  if (normalized.includes("muito alto") || normalized.includes("excesso") || normalized.includes("toxic")) return CLASSIFICATION_PALETTE.excess;
  if (normalized.includes("alto")) return CLASSIFICATION_PALETTE.high;
  return CLASSIFICATION_PALETTE.neutral;
}
