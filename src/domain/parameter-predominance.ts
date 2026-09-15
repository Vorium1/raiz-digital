/**
 * Categoria "Padrão" do cockpit técnico (Fase 3, Bloco B) -- correção semântica do fechamento técnico
 * (achado real do diretor): este módulo calcula PREDOMINÂNCIA DE CLASSIFICAÇÃO entre os pontos já
 * classificados de uma mesma coleta -- uma simples contagem/proporção. Ele NUNCA lê coordenada,
 * proximidade, vizinhança nem qualquer geometria dos pontos -- por isso não pode ser chamado de "padrão
 * espacial" nem apresentado como evidência de distribuição geográfica. O nome anterior deste arquivo
 * (`parameter-patterns.ts`, `computeSpatialPatterns`, `SpatialPattern`) e os textos que o usavam
 * afirmavam exatamente isso, o que o algoritmo nunca sustentou -- corrigido em toda a base (tipos,
 * função, textos da UI e testes).
 *
 * Regra explícita e deliberadamente simples (sem significância estatística, sem geoestatística
 * improvisada): dado um parâmetro com N pontos JÁ CLASSIFICADOS nesta coleta, a classificação mais
 * frequente só é reportada como "predominância observada" quando, ao mesmo tempo:
 *   1. aparece em MAIS DA METADE dos N pontos avaliados (maioria real, não só pluralidade); e
 *   2. aparece em pelo menos MIN_MATCHING_COUNT pontos (piso absoluto -- 1 ou 2 pontos batendo por
 *      coincidência não vira "predominância", mesmo que sejam 100% de uma amostra pequena).
 * As duas condições aqui resolvem uma divergência real encontrada entre o texto da UI ("pelo menos 3
 * pontos com a mesma classificação") e a regra antiga (MIN_OBSERVATIONS=3 total + MIN_SHARE=0.6 de
 * proporção, que permitia reportar com só 2 pontos concordando de 3) -- agora o mínimo de pontos
 * concordantes é sempre explícito e igual ao que a UI afirma.
 *
 * Um padrão ESPACIAL de verdade (ex.: pontos vizinhos entre si tendendo à mesma classificação, ou uma
 * tendência ao longo do talhão) exigiria geometria real dos pontos (latitude/longitude), uma definição
 * de vizinhança e um método espacial validado (ex.: autocorrelação espacial/Moran's I, interpolação
 * geoestatística com variograma) -- nada disso está implementado nesta instância. Enquanto isso não
 * existir, este módulo deliberadamente não tenta -- é só contagem/proporção sobre a mesma coleta.
 */
export type ParameterPredominance = {
  parameterCode: string;
  classification: string;
  matchingCount: number;
  totalCount: number;
  observationCodes: string[];
};

/** Piso mínimo de pontos concordantes para reportar predominância -- nunca 1 ou 2 pontos batendo por
 * coincidência, mesmo que sejam maioria de uma amostra minúscula. Coerente com o texto da UI. */
const MIN_MATCHING_COUNT = 3;

export function computeParameterPredominance(
  interpretation: Array<{ sampleCode: string; parameterCode: string; interpretable: boolean; classification?: string }>,
): ParameterPredominance[] {
  const byParameter = new Map<string, Array<{ sampleCode: string; classification: string }>>();
  for (const item of interpretation) {
    if (!item.interpretable || !item.classification) continue;
    const list = byParameter.get(item.parameterCode) ?? [];
    list.push({ sampleCode: item.sampleCode, classification: item.classification });
    byParameter.set(item.parameterCode, list);
  }

  const results: ParameterPredominance[] = [];
  for (const [parameterCode, observations] of byParameter) {
    const countByClass = new Map<string, string[]>();
    for (const obs of observations) countByClass.set(obs.classification, [...(countByClass.get(obs.classification) ?? []), obs.sampleCode]);
    let bestClass: string | null = null;
    let bestCodes: string[] = [];
    for (const [classification, codes] of countByClass) {
      if (codes.length > bestCodes.length) { bestClass = classification; bestCodes = codes; }
    }
    // Maioria real (mais da metade) E piso absoluto de pontos concordantes -- as duas condições juntas,
    // nunca uma sozinha (ver regra documentada acima).
    const isRealMajority = bestCodes.length > observations.length / 2;
    if (bestClass && isRealMajority && bestCodes.length >= MIN_MATCHING_COUNT) {
      results.push({ parameterCode, classification: bestClass, matchingCount: bestCodes.length, totalCount: observations.length, observationCodes: bestCodes });
    }
  }
  return results.sort((a, b) => a.parameterCode.localeCompare(b.parameterCode));
}
