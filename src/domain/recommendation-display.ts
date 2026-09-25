const RECOMMENDATION_INPUT_LABELS: Record<string, string> = {
  N: "Nitrogênio (N)",
  P2O5: "Fósforo (P₂O₅)",
  K2O: "Potássio (K₂O)",
  S: "Enxofre (S)",
  B: "Boro (B)",
  ZN: "Zinco (Zn)",
  CU: "Cobre (Cu)",
  MN: "Manganês (Mn)",
  MO: "Molibdênio (Mo)",
  CO: "Cobalto (Co)",
  GESSO: "Gesso agrícola",
  GYPSUM: "Gesso agrícola",
  CALCARIO_PRNT100: "Calcário — necessidade equivalente PRNT 100%",
  LIME_PRNT100: "Calcário — necessidade equivalente PRNT 100%",
};

export function recommendationInputLabel(inputType: string | null | undefined) {
  const normalized = (inputType ?? "").trim().toUpperCase();
  if (!normalized) return "Insumo";
  return RECOMMENDATION_INPUT_LABELS[normalized] ?? inputType!.trim();
}


export function producerFacingRecommendationText(value: string | null | undefined) {
  return (value ?? "")
    .replace(/\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+\b/g, "")
    .replace(/\s+([,.;:])/g, "$1")
    .replace(/:\s*[.;]/g, ".")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+\./g, ".")
    .trim();
}
