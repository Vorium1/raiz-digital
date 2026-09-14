export type AnalysisDepthId =
  | "interpretacao-rapida"
  | "recomendacao-manejo"
  | "analise-completa-campo"
  | "diagnostico-360"
  | "personalizada";

export type AnalysisDepth = {
  id: AnalysisDepthId;
  order: number;
  title: string;
  shortTitle: string;
  intent: string;
  description: string;
  layers: readonly number[];
  minimumInputs: readonly string[];
  helpfulInputs: readonly string[];
  outputs: readonly string[];
  note?: string;
};

export const ANALYSIS_DEPTHS: readonly AnalysisDepth[] = [
  {
    id: "interpretacao-rapida",
    order: 1,
    title: "Interpretação rápida",
    shortTitle: "Entender meu solo",
    intent: "Quero entender meu laudo.",
    description:
      "Leitura técnica do laudo para mostrar como está o solo, seus principais limitantes, pontos positivos e o que ainda não pode ser concluído.",
    layers: [1],
    minimumInputs: [
      "1 laudo atual de análise de solo. A análise química é suficiente para iniciar; a físico-química melhora a leitura quando disponível.",
    ],
    helpfulInputs: [
      "Profundidade de amostragem, método/extrator e unidades descritos no laudo.",
      "Laudo anterior da mesma área para comparação temporal.",
    ],
    outputs: [
      "Interpretação integrada dos parâmetros que puderem ser validados.",
      "Principais limitantes, pontos favoráveis e prioridades de atenção.",
      "Indicação explícita do que não pode ser avaliado com segurança.",
      "Sem inventar dose quando faltar cultura, meta produtiva ou contexto obrigatório.",
    ],
  },
  {
    id: "recomendacao-manejo",
    order: 2,
    title: "Recomendação de manejo",
    shortTitle: "Planejar a próxima cultura",
    intent: "Quero saber o que corrigir e como manejar para a cultura.",
    description:
      "Cruza o laudo com a cultura e a meta produtiva para transformar a interpretação em prioridades e recomendações de manejo.",
    layers: [1, 2],
    minimumInputs: [
      "Laudo atual de análise de solo; análise física quando disponível.",
      "Cultura pretendida.",
      "Meta de produtividade com unidade.",
      "Sistema básico de produção: sequeiro ou irrigado; plantio direto ou convencional.",
      "Profundidade de amostragem.",
      "Histórico recente de calagem, adubação e gessagem, quando conhecido. Se não houver registro, informar que é desconhecido.",
    ],
    helpfulInputs: [
      "Laudos anteriores.",
      "Culturas e produtividades das safras recentes.",
      "Análise em mais de uma profundidade.",
    ],
    outputs: [
      "Prioridades de correção e manejo para a cultura escolhida.",
      "Doses determinísticas somente quando método, contexto e regra estiverem suficientemente definidos.",
      "Itens que exigem revisão profissional ou mais dados ficam claramente separados.",
    ],
  },
  {
    id: "analise-completa-campo",
    order: 3,
    title: "Análise completa do campo",
    shortTitle: "Entender o campo em profundidade",
    intent: "Quero considerar solo, cultura, histórico, clima e manejo.",
    description:
      "Adiciona o contexto real da área para explicar por que o solo está assim e escolher evidências agronômicas mais comparáveis ao campo.",
    layers: [1, 2, 3],
    minimumInputs: [
      "Laudo atual de solo, preferencialmente com mais de uma profundidade.",
      "Cultura e meta de produtividade.",
      "Histórico recente de manejo: calcário, fertilizantes, gesso, coberturas e rotações.",
      "Contexto do solo: classe/tipo ou, no mínimo, textura/teor de argila e profundidade efetiva conhecida.",
      "Histórico recente de produtividade.",
      "Contexto hídrico básico: sequeiro/irrigado e histórico relevante de seca, excesso de chuva ou encharcamento.",
    ],
    helpfulInputs: [
      "Avaliações de compactação, infiltração ou estrutura.",
      "Análise foliar/tecidual.",
      "Indicadores biológicos ou microbiológicos com método identificado.",
      "Imagens de satélite, mapas de produtividade ou outros mapas agronômicos.",
    ],
    outputs: [
      "Diagnóstico contextual de solo, cultura, histórico, água e manejo.",
      "Recomendação com justificativa e prioridade agronômica.",
      "Uso de evidência regional, nacional ou internacional conforme a similaridade agronômica do ambiente.",
      "Nível de confiança, limitações e necessidade de revisão profissional quando aplicável.",
    ],
  },
  {
    id: "diagnostico-360",
    order: 4,
    title: "Diagnóstico avançado / 360°",
    shortTitle: "Usar todos os dados disponíveis",
    intent: "Quero a análise mais completa possível.",
    description:
      "Integra contexto espacial, histórico de várias safras e resposta do próprio talhão para apoiar decisões agronômicas mais individualizadas.",
    layers: [1, 2, 3, 4],
    minimumInputs: [
      "Todos os dados mínimos da Análise completa do campo.",
      "Limite georreferenciado do talhão quando houver análise espacial.",
      "Pontos de amostragem georreferenciados quando houver interpretação espacial ou taxa variável.",
      "Histórico de manejo, aplicações e produtividade de múltiplas safras, na extensão em que estiver disponível.",
      "Mapas, imagens ou mapas de produtividade quando existirem.",
      "Dados ou contexto meteorológico suficiente para caracterizar a safra e eventos relevantes.",
    ],
    helpfulInputs: [
      "Análises estratificadas, por exemplo 0–10, 10–20 e 20–40 cm.",
      "Análise foliar/tecidual.",
      "Indicadores de biologia/microbiologia do solo com método identificado.",
      "Séries de sensoriamento remoto.",
      "Logs de máquinas e aplicações.",
      "Custos, preços e outras informações econômicas para cenários.",
    ],
    outputs: [
      "Diagnóstico 360° com rastreabilidade das evidências usadas.",
      "Comparação entre condição inicial, manejo, clima, produtividade e resposta do solo ao longo do tempo.",
      "Cenários e recomendações individualizadas dentro dos limites dos dados disponíveis.",
      "Taxa variável somente quando os pré-requisitos espaciais e de validação estiverem satisfeitos; caso contrário, a análise 360° continua sem VRA.",
    ],
    note:
      "O 360° não exige taxa variável. A ausência de georreferenciamento bloqueia apenas conclusões espaciais que dependam dele; o restante do diagnóstico pode continuar.",
  },
  {
    id: "personalizada",
    order: 5,
    title: "Personalizar análise",
    shortTitle: "Escolher o que quero avaliar",
    intent: "Quero escolher objetivo e dados disponíveis.",
    description:
      "A RAIZ combina os módulos necessários a partir do objetivo e calcula a profundidade efetiva da análise.",
    layers: [1, 2, 3, 4],
    minimumInputs: [
      "Objetivo da análise.",
      "Dados e documentos que o usuário já possui.",
    ],
    helpfulInputs: [
      "Quanto mais contexto confiável for fornecido, maior pode ser a profundidade do diagnóstico.",
    ],
    outputs: [
      "Escopo personalizado.",
      "Lista objetiva dos dados faltantes que realmente mudariam a análise.",
      "Profundidade efetiva e limitações declaradas antes das conclusões.",
    ],
    note:
      "Não existe pacote mínimo fixo além do objetivo e dos dados disponíveis. Cada cálculo continua respeitando seus próprios pré-requisitos e falha de forma segura quando faltar contexto obrigatório.",
  },
] as const;

export const PREDEFINED_ANALYSIS_DEPTHS = ANALYSIS_DEPTHS.filter(
  (depth) => depth.id !== "personalizada",
);

export function isAnalysisDepthId(value: unknown): value is AnalysisDepthId {
  return typeof value === "string" && ANALYSIS_DEPTHS.some((depth) => depth.id === value);
}

export function getAnalysisDepthById(id: string | undefined | null): AnalysisDepth | null {
  if (!id) return null;
  return ANALYSIS_DEPTHS.find((depth) => depth.id === id) ?? null;
}

export function getRequestedAnalysisLayer(id: AnalysisDepthId): 1 | 2 | 3 | 4 | null {
  if (id === "personalizada") return null;
  const depth = getAnalysisDepthById(id);
  return depth ? (Math.max(...depth.layers) as 1 | 2 | 3 | 4) : null;
}
