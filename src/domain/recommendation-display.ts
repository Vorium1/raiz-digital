const RECOMMENDATION_INPUT_LABELS: Record<string, string> = {
  P2O5: "Fósforo (P₂O₅)",
  K2O: "Potássio (K₂O)",
  S: "Enxofre (S)",
  CALCARIO_PRNT100: "Calcário — necessidade equivalente PRNT 100%",
  LIME_PRNT100: "Calcário — necessidade equivalente PRNT 100%",
};

export function recommendationInputLabel(inputType: string | null | undefined) {
  const normalized = (inputType ?? "").trim().toUpperCase();
  if (!normalized) return "Insumo";
  return RECOMMENDATION_INPUT_LABELS[normalized] ?? inputType!.trim();
}
