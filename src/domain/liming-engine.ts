/**
 * Motor de cálculo de calagem (correção de acidez do solo) -- MÓDULO SEPARADO
 * de propósito de `agronomic-engine.ts`: aquele classifica um resultado de
 * laboratório em faixa (Baixo/Médio/Alto); este calcula uma DOSE contínua
 * (t/ha de calcário), categoria de problema diferente. Mantido zero-import
 * (mesma disciplina do motor principal, ver nota de dual-runtime lá) para
 * poder ser testado tanto pelo bundler do Next quanto por `node` puro.
 *
 * Fonte: Manual de Calagem e Adubação CQFS-RS/SC, 11ª ed. (2016), Capítulo 5
 * ("Diagnóstico da acidez e recomendação da calagem"), conferido diretamente
 * no PDF oficial.
 *
 * DECISÃO DE ESCOPO: o manual descreve DOIS métodos pra estimar a dose de
 * calcário -- (a) tabela de lookup por índice SMP (Tabela 5.2) e (b) fórmula
 * por saturação de bases (item 5.2.1, equação NC = [(V1-V2)/100] × CTCpH7,0).
 * Só o método (b) está implementado aqui. Motivo: a Tabela 5.2 tem ~25 linhas
 * de valores numéricos e o texto extraído do PDF pra conferência (pdftotext)
 * saiu com a formatação de colunas degradada o suficiente pra tornar a
 * transcrição de célula-por-célula arriscada -- e o próprio manual autoriza
 * o método (b) como alternativa equivalente ("as doses ... são semelhantes"),
 * então prefiro implementar a fórmula limpa e citável a arriscar digitar
 * errado uma tabela de 75 números a partir de um texto degradado. Tabela 5.2
 * fica pendente até eu conseguir conferir célula-por-célula direto contra o
 * PDF (não contra o .txt extraído).
 */

export type LimingTargetPh = "5.5" | "6.0" | "6.5";

/**
 * Correspondência pH-alvo -> saturação por bases (V%) alvo, conforme o
 * manual: "neste Manual se assume uma provável correspondência entre o
 * valor do pH de referência das culturas com o valor V%, sendo: pH 5,5 =
 * V 65%; pH 6,0 = V 75% e pH 6,5 = V 85%." O próprio manual avisa que essa
 * correspondência é aproximada (± ~5 pontos percentuais em CTCpH7,0 muito
 * baixa ou muito alta) e ainda não foi calibrada para as culturas do RS/SC.
 */
const TARGET_BASE_SATURATION_PERCENT: Record<LimingTargetPh, number> = {
  "5.5": 65,
  "6.0": 75,
  "6.5": 85,
};

const NC_FORMULA_SOURCE =
  "Manual de Calagem e Adubação CQFS-RS/SC, 11ª ed. (2016), item 5.2.1 -- NC = [(V1-V2)/100] × CTCpH7,0 (Quaggio et al., 1986). Calcário com PRNT 100%, correção da camada 0-20cm.";

const H_AL_FORMULA_SOURCE =
  "Manual de Calagem e Adubação CQFS-RS/SC, 11ª ed. (2016), item 4.1.1-f -- H+Al (cmolc/dm³) = e^(10,665 - 1,1483×SMP)/10 (Kaminski et al., 2001).";

export function targetBaseSaturationForPh(targetPh: LimingTargetPh): number {
  return TARGET_BASE_SATURATION_PERCENT[targetPh];
}

/**
 * Acidez potencial (H+Al, cmolc/dm³) estimada a partir do índice SMP --
 * usado quando o laudo traz SMP mas não traz CTCpH7,0 calculada.
 */
export function estimateHAlFromSmpIndex(smpIndex: number): number {
  return Math.exp(10.665 - 1.1483 * smpIndex) / 10;
}

/**
 * CTC a pH 7,0 (cmolc/dm³) = Ca2+ + Mg2+ + K+ + (H+Al). Ca, Mg e K devem
 * já estar em cmolc/dm³ (o K do laudo em mg/dm³ precisa ser convertido antes:
 * K (cmolc/dm³) = mg/dm³ ÷ 391 -- conversão fica a cargo de quem chama, este
 * módulo não assume unidade de entrada implícita).
 */
export function computeCtcPh7(cationsCmolc: { ca: number; mg: number; k: number }, hAl: number): number {
  return cationsCmolc.ca + cationsCmolc.mg + cationsCmolc.k + hAl;
}

/**
 * Saturação da CTCpH7,0 por bases (V%) = (S/CTCpH7,0) × 100, S = Ca+Mg+K
 * (cmolc/dm³, sem Al).
 */
export function computeBaseSaturationPercent(cationsCmolc: { ca: number; mg: number; k: number }, ctcPh7: number): number {
  const s = cationsCmolc.ca + cationsCmolc.mg + cationsCmolc.k;
  return (s / ctcPh7) * 100;
}

export type LimingDoseInput = {
  targetPh: LimingTargetPh;
  measuredBaseSaturationPercent: number;
  ctcPh7: number;
};

export type LimingDoseResult =
  | {
      needed: true;
      doseTonPerHaPrnt100: number;
      targetBaseSaturationPercent: number;
      measuredBaseSaturationPercent: number;
      source: string;
    }
  | {
      needed: false;
      reason: string;
    };

/**
 * Necessidade de calcário (NC, t/ha, PRNT 100%, camada 0-20cm) pelo método
 * da saturação por bases. Alternativa citada e autorizada pelo manual ao
 * método de tabela por índice SMP (não implementado aqui, ver nota de topo).
 */
export function computeLimingDoseByBaseSaturation(input: LimingDoseInput): LimingDoseResult {
  const v1 = targetBaseSaturationForPh(input.targetPh);
  const v2 = input.measuredBaseSaturationPercent;
  if (v2 >= v1) {
    return {
      needed: false,
      reason: `Saturação por bases medida (${v2.toFixed(1)}%) já atinge ou supera a meta de ${v1}% para pH ${input.targetPh} -- calagem não é indicada por este critério.`,
    };
  }
  const doseTonPerHaPrnt100 = ((v1 - v2) / 100) * input.ctcPh7;
  return {
    needed: true,
    doseTonPerHaPrnt100: Math.round(doseTonPerHaPrnt100 * 100) / 100,
    targetBaseSaturationPercent: v1,
    measuredBaseSaturationPercent: v2,
    source: NC_FORMULA_SOURCE,
  };
}

export const LIMING_FORMULA_SOURCES = {
  hAlFromSmp: H_AL_FORMULA_SOURCE,
  necessidadeDeCalcario: NC_FORMULA_SOURCE,
};
