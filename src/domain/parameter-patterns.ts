/**
 * Categoria "Padrão" do cockpit técnico (Fase 3, Bloco B): repetição espacial sustentada por dados
 * comparáveis DENTRO da mesma coleta -- nunca gerada a partir de uma única observação, e nunca uma
 * tendência temporal inventada (comparar entre safras exigiria garantir compatibilidade de profundidade/
 * método/época entre coletas diferentes, o que este motor não verifica; por isso o padrão aqui é
 * deliberadamente só espacial, dentro da mesma ordem de coleta).
 */
export type SpatialPattern = {
  parameterCode: string;
  classification: string;
  matchingCount: number;
  totalCount: number;
  observationCodes: string[];
};

const MIN_OBSERVATIONS = 3;
const MIN_SHARE = 0.6;

export function computeSpatialPatterns(
  interpretation: Array<{ sampleCode: string; parameterCode: string; interpretable: boolean; classification?: string }>,
): SpatialPattern[] {
  const byParameter = new Map<string, Array<{ sampleCode: string; classification: string }>>();
  for (const item of interpretation) {
    if (!item.interpretable || !item.classification) continue;
    const list = byParameter.get(item.parameterCode) ?? [];
    list.push({ sampleCode: item.sampleCode, classification: item.classification });
    byParameter.set(item.parameterCode, list);
  }

  const patterns: SpatialPattern[] = [];
  for (const [parameterCode, observations] of byParameter) {
    if (observations.length < MIN_OBSERVATIONS) continue; // uma ou duas observações não sustentam padrão
    const countByClass = new Map<string, string[]>();
    for (const obs of observations) countByClass.set(obs.classification, [...(countByClass.get(obs.classification) ?? []), obs.sampleCode]);
    let bestClass: string | null = null;
    let bestCodes: string[] = [];
    for (const [classification, codes] of countByClass) {
      if (codes.length > bestCodes.length) { bestClass = classification; bestCodes = codes; }
    }
    if (bestClass && bestCodes.length / observations.length >= MIN_SHARE) {
      patterns.push({ parameterCode, classification: bestClass, matchingCount: bestCodes.length, totalCount: observations.length, observationCodes: bestCodes });
    }
  }
  return patterns.sort((a, b) => a.parameterCode.localeCompare(b.parameterCode));
}
