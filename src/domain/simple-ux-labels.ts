const CLASSIFICATION_LABELS: Record<string, string> = {
  VERY_LOW: "Muito baixo",
  MUITO_BAIXO: "Muito baixo",
  LOW: "Baixo",
  BAIXO: "Baixo",
  MEDIUM: "Médio",
  MEDIO: "Médio",
  MÉDIO: "Médio",
  ADEQUATE: "Adequado",
  ADEQUADO: "Adequado",
  SUFFICIENT: "Suficiente",
  SUFICIENTE: "Suficiente",
  OPTIMAL: "Ótimo",
  OTIMO: "Ótimo",
  ÓTIMO: "Ótimo",
  HIGH: "Alto",
  ALTO: "Alto",
  VERY_HIGH: "Muito alto",
  MUITO_ALTO: "Muito alto",
  DEFICIENT: "Deficiente",
  DEFICIENTE: "Deficiente",
  CRITICAL: "Crítico",
  CRITICO: "Crítico",
  CRÍTICO: "Crítico",
  TOXIC: "Tóxico",
  TOXICO: "Tóxico",
  TÓXICO: "Tóxico",
};

/** Apenas apresentação: nunca altera o valor persistido ou usado pelo motor. */
export function humanClassification(value: string | null | undefined): string {
  if (!value) return "Sem classificação";
  const normalized = value.trim().toUpperCase().replace(/[\s-]+/g, "_");
  const known = CLASSIFICATION_LABELS[normalized];
  if (known) return known;

  // Códigos ainda não mapeados deixam de aparecer em SNAKE_CASE, mas preservamos as palavras originais.
  return value.replace(/_/g, " ").replace(/\s+/g, " ").trim();
}
