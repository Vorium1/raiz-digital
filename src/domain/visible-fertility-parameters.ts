/** Parâmetros principais exigem classificação corrente; dados brutos continuam no detalhe técnico. */
export function visibleFertilityParameters(input: { available: string[]; classified: string[] }) {
  const available = new Set(input.available.filter(Boolean));
  return [...new Set(input.classified.filter((code) => available.has(code)))];
}
