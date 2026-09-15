/**
 * Normalização de nome de MÉTODO/UNIDADE na ingestão -- nunca dentro do motor determinístico
 * (`agronomic-engine.ts` continua fazendo só comparação exata de string, de propósito: nenhuma
 * correspondência frouxa dentro da regra agronômica, inclusive a checagem de `unitExpected`). Existe
 * porque um laboratório pode escrever um nome abreviado/diferente para o MESMO método/unidade já
 * homologado num perfil de cultura -- sem essa tradução na ingestão, o motor rejeita um resultado
 * tecnicamente compatível.
 *
 * Auditoria Cabeda 2026-09-11/12:
 * - os PDFs originais Mondial (Relatórios de Ensaio 1414-1429/2026) foram reencontrados na biblioteca;
 * - eles mostram P e K literalmente na coluna `mg/L` e citam como método geral Tedesco, M. J. et al.,
 *   Boletim técnico n° 5 - Análises de Solo, Plantas e Outros Materiais, 2ª ed., Porto Alegre, 1995;
 * - para solo, `mg/L` e `mg/dm³` representam a mesma concentração por volume de solo, pois 1 L = 1 dm³;
 *   portanto a normalização de P/K é só CANONIZAÇÃO DE NOTAÇÃO, com fator 1, nunca conversão numérica;
 * - o texto bruto do laudo deve continuar preservado em `original_payload.rawUnit`/`rawMethod`.
 *
 * Quanto a método analítico, só CTC é normalizado automaticamente: é a MESMA fórmula escrita de forma
 * abreviada. S/B/MN ficam explicitamente pendentes porque o laudo informa uma descrição menos específica
 * do que a usada no cadastro técnico; não vamos completar detalhe de método por suposição.
 */

export type MethodAlias = {
  parameterCode: string;
  /** Texto exatamente como o laboratório escreveu. */
  rawMethod: string;
  /** Texto canônico usado no perfil técnico. */
  canonicalMethod: string;
  /** Por que as duas strings são o mesmo método técnico. */
  note: string;
};

/** APLICADAS de verdade (`normalizeAnalyticalMethod` traduz). */
export const ANALYTICAL_METHOD_ALIASES: MethodAlias[] = [
  {
    parameterCode: "CTC",
    rawMethod: "Calculado: Ca+Mg+K+(H+Al)",
    canonicalMethod: "Calculado: CTCpH7,0 = Ca + Mg + K + (H+Al)",
    note: "Mesma fórmula, numericamente idêntica; muda apenas a notação, sem substituir técnica analítica.",
  },
];

/**
 * PENDENTES DE CONFIRMAÇÃO DOCUMENTAL ESPECÍFICA DO MÉTODO -- documentadas para rastreabilidade, mas
 * `normalizeAnalyticalMethod` NUNCA aplica estas equivalências até existir evidência explícita suficiente.
 */
export const PENDING_METHOD_EQUIVALENCES: MethodAlias[] = [
  {
    parameterCode: "S",
    rawMethod: "Turbidimetria",
    canonicalMethod: "Ca(H2PO4)2 500mg P/L, turbidimetria",
    note: "O laudo confirma turbidimetria, mas não explicita neste campo o extrator completo exigido pelo cadastro técnico. Pendente.",
  },
  {
    parameterCode: "B",
    rawMethod: "Água quente",
    canonicalMethod: "Água quente, colorimetria com curcumina",
    note: "O laudo confirma extração em água quente, mas não explicita neste campo a técnica de leitura. Pendente.",
  },
  {
    parameterCode: "MN",
    rawMethod: "KCl 1 mol/L",
    canonicalMethod: "KCl 1 mol/L (acidificado com HCl 2%)",
    note: "O laudo confirma KCl 1 mol/L, mas não explicita neste campo a acidificação adicional exigida pelo cadastro. Pendente.",
  },
];

export type UnitAlias = { parameterCode: string; rawUnit: string; canonicalUnit: string; note: string };

/**
 * Canonização de notação, não conversão numérica. Nos laudos Mondial Cabeda 1414-1429/2026, P e K são
 * impressos como `mg/L`. O perfil CQFS usa `mg/dm³`. Como 1 L = 1 dm³, o valor numérico é preservado
 * exatamente; `rawUnit` deve permanecer no payload de origem para auditoria.
 */
export const UNIT_ALIASES: UnitAlias[] = [
  {
    parameterCode: "P",
    rawUnit: "mg/L",
    canonicalUnit: "mg/dm³",
    note: "Laudo Mondial Cabeda 1414-1429/2026: P em mg/L; canonizado para mg/dm³ por identidade de volume (1 L = 1 dm³), sem alterar numeric_value.",
  },
  {
    parameterCode: "K",
    rawUnit: "mg/L",
    canonicalUnit: "mg/dm³",
    note: "Laudo Mondial Cabeda 1414-1429/2026: K em mg/L; canonizado para mg/dm³ por identidade de volume (1 L = 1 dm³), sem alterar numeric_value.",
  },
];

/** Traduz apenas correspondências de método explicitamente aprovadas acima. */
export function normalizeAnalyticalMethod(parameterCode: string, rawMethod: string): string {
  const alias = ANALYTICAL_METHOD_ALIASES.find((a) => a.parameterCode === parameterCode && a.rawMethod === rawMethod);
  return alias ? alias.canonicalMethod : rawMethod;
}

/** Canoniza unidade conhecida sem alterar o valor numérico. */
export function normalizeUnit(parameterCode: string, rawUnit: string): string {
  const alias = UNIT_ALIASES.find((a) => a.parameterCode === parameterCode && a.rawUnit === rawUnit);
  return alias ? alias.canonicalUnit : rawUnit;
}
