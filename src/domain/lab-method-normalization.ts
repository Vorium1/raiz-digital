/**
 * Normalização de nome de MÉTODO/UNIDADE na ingestão -- nunca dentro do motor determinístico
 * (`agronomic-engine.ts` continua fazendo só comparação exata de string, de propósito: nenhuma
 * correspondência frouxa dentro da regra agronômica, inclusive a checagem de `unitExpected` -- item 3 do
 * fechamento técnico). Existe porque um laboratório pode escrever um nome abreviado/diferente para o
 * MESMO método/unidade já homologado num perfil de cultura -- sem essa tradução na ingestão, o motor
 * rejeita um resultado tecnicamente compatível, mesmo sendo, na prática, o mesmo método/unidade.
 *
 * Revisão do fechamento técnico (RAIZ_2.0/Cabeda, 2026-09-11, item 4/5): a primeira versão deste arquivo
 * tratava TODAS as 4 correspondências de método como igualmente certas. Revisão honesta: só uma é
 * defensável sem o documento-fonte (CTC -- é reescrita da MESMA fórmula, nenhum termo muda). As outras 3
 * (S, B, MN) assumiam que o laboratório usou o método MAIS ESPECÍFICO do que escreveu -- suposição
 * plausível, mas não confirmada contra o texto literal dos PDFs originais do Mondial (fora deste
 * repositório, não acessíveis nesta auditoria). Por isso ficam em `PENDING_METHOD_EQUIVALENCES`
 * (documentadas, mas NÃO aplicadas por `normalizeAnalyticalMethod`) até alguém confirmar contra o
 * documento -- "não inventar detalhe de método pra fazer cadastro bater". Como CTC/S/B/MN continuam
 * `DRAFT` no cadastro (nenhum foi homologado pra ACTIVE), essa distinção não muda nenhum resultado de
 * classificação hoje -- é só sobre não gravar uma afirmação mais forte do que a evidência sustenta.
 */

export type MethodAlias = {
  parameterCode: string;
  /** Texto exatamente como um laboratório pode escrever (variante conhecida, já confirmada). */
  rawMethod: string;
  /** Texto exatamente como está homologado em `crop_profile_parameters.analytical_method_allowed`. */
  canonicalMethod: string;
  /** Por que as duas strings são o mesmo método técnico, não um método diferente. */
  note: string;
};

/** APLICADAS de verdade (`normalizeAnalyticalMethod` traduz). Só a que é reescrita da MESMA fórmula,
 *  sem nenhuma suposição sobre qual técnica específica o laboratório realmente usou. */
export const ANALYTICAL_METHOD_ALIASES: MethodAlias[] = [
  {
    parameterCode: "CTC",
    rawMethod: "Calculado: Ca+Mg+K+(H+Al)",
    canonicalMethod: "Calculado: CTCpH7,0 = Ca + Mg + K + (H+Al)",
    note: "Mesma fórmula (soma de bases trocáveis + acidez potencial), numericamente idêntica -- só a notação está abreviada (falta o 'pH7,0' e o sinal de igualdade), sem alterar nenhum termo da soma. Defensável sem o PDF original porque é notação, não substituição de técnica.",
  },
];

/**
 * PENDENTES DE CONFIRMAÇÃO DOCUMENTAL -- documentadas aqui pra rastreabilidade e pra ficarem prontas
 * pra promoção assim que alguém confirmar contra o PDF original do Mondial, mas `normalizeAnalyticalMethod`
 * NUNCA aplica estas (só o método bruto do laboratório é gravado). Cada uma pressupõe que o laboratório
 * usou a técnica MAIS ESPECÍFICA do que escreveu de forma abreviada -- plausível (é a técnica padrão
 * associada ao mesmo extrator no CQFS-RS/SC), mas não é a mesma certeza matemática de CTC acima.
 */
export const PENDING_METHOD_EQUIVALENCES: MethodAlias[] = [
  {
    parameterCode: "S",
    rawMethod: "Turbidimetria",
    canonicalMethod: "Ca(H2PO4)2 500mg P/L, turbidimetria",
    note: "Turbidimetria é só a técnica de LEITURA (precipitado de sulfato de bário). O extrator padrão CQFS-RS/SC pra enxofre disponível costuma ser fosfato de cálcio 500mg P/L -- mas o laudo não confirma literalmente que o Mondial usou ESSE extrator específico, só a leitura. Pendente.",
  },
  {
    parameterCode: "B",
    rawMethod: "Água quente",
    canonicalMethod: "Água quente, colorimetria com curcumina",
    note: "Água quente é a etapa de EXTRAÇÃO do boro; colorimetria com curcumina é a leitura mais comum associada a esse extrator no padrão CQFS-RS/SC -- mas o laudo não confirma literalmente qual técnica de leitura o Mondial usou. Pendente.",
  },
  {
    parameterCode: "MN",
    rawMethod: "KCl 1 mol/L",
    canonicalMethod: "KCl 1 mol/L (acidificado com HCl 2%)",
    note: "Mesmo extrator base (KCl 1mol/L); a acidificação com HCl 2% é o detalhe que distingue o método 2016 do Mehlich-1 usado em 2004 -- mas o laudo não confirma literalmente a acidificação. Pendente.",
  },
];

/**
 * Unidade -- mesma lógica, mas a equivalência aqui tem uma parte matematicamente incondicional (1 L = 1
 * dm³, identidade do SI) e uma parte de convenção de laboratório (P/K por Mehlich-1 são reportados, por
 * padrão de mercado no Brasil, na base do volume de SOLO -- nunca da solução extratora -- porque é a
 * única base comparável às tabelas de suficiência publicadas). A parte matemática é certa; a parte de
 * convenção NÃO foi confirmada contra o texto literal do PDF original do Mondial nesta auditoria.
 * Aplicada (mantida no banco -- "não precisamos entrar em pânico", mas fica marcada aqui como o que é:
 * alta confiança, não prova documental).
 */
export type UnitAlias = { parameterCode: string; rawUnit: string; canonicalUnit: string; note: string };
export const UNIT_ALIASES: UnitAlias[] = [
  {
    parameterCode: "P",
    rawUnit: "mg/L",
    canonicalUnit: "mg/dm³",
    note: "1 L = 1 dm³ (identidade do SI, incondicional). Convenção do setor: Mehlich-1/CQFS-RS/SC reporta P sempre na base do volume de SOLO -- PENDENTE de confirmação literal contra o PDF original do Mondial (fora deste repositório).",
  },
  {
    parameterCode: "K",
    rawUnit: "mg/L",
    canonicalUnit: "mg/dm³",
    note: "Mesma justificativa do P acima.",
  },
];

/**
 * Traduz o método como o laboratório escreveu para o texto canônico homologado, quando existe uma
 * correspondência APLICADA (ver `ANALYTICAL_METHOD_ALIASES` -- nunca `PENDING_METHOD_EQUIVALENCES`). Sem
 * correspondência conhecida, devolve o texto original sem alteração -- nunca inventa uma equivalência não
 * confirmada.
 */
export function normalizeAnalyticalMethod(parameterCode: string, rawMethod: string): string {
  const alias = ANALYTICAL_METHOD_ALIASES.find((a) => a.parameterCode === parameterCode && a.rawMethod === rawMethod);
  return alias ? alias.canonicalMethod : rawMethod;
}

export function normalizeUnit(parameterCode: string, rawUnit: string): string {
  const alias = UNIT_ALIASES.find((a) => a.parameterCode === parameterCode && a.rawUnit === rawUnit);
  return alias ? alias.canonicalUnit : rawUnit;
}
