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
 * O manual descreve DOIS métodos pra estimar a dose de calcário -- (a)
 * tabela de lookup por índice SMP (Tabela 5.2) e (b) fórmula por saturação
 * de bases (item 5.2.1, equação NC = [(V1-V2)/100] × CTCpH7,0). Os dois
 * estão implementados aqui.
 *
 * HISTÓRICO REAL, vale registrar: a primeira extração do PDF oficial pra
 * conferência (`pdftotext -layout`) saiu com a Tabela 5.2 DESALINHADA --
 * os rótulos de índice SMP ficaram deslocados ~3 linhas em relação aos
 * valores de dose (confirmado comparando número por número com uma
 * segunda extração). Rodar `pdftotext -table` (otimizado pra tabela, em
 * vez de `-layout`) nas mesmas páginas produziu uma extração limpa e
 * consistente. Por isso o método (a) só foi implementado depois de
 * reextrair com `-table` -- a versão `-layout` não era confiável o
 * suficiente pra virar dado agronômico.
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

/**
 * Tabela 5.2 do manual -- dose de calcário (t/ha, PRNT 100%) por índice SMP,
 * pra cada pH-alvo (5,5/6,0/6,5). Reextraída e conferida número-a-número
 * contra o PDF oficial (ver nota de topo do arquivo). O índice SMP=4,4 é o
 * próprio manual que trata como faixa aberta pra baixo ("=4,4", ou seja,
 * "≤4,4") -- todo SMP menor ou igual a 4,4 usa essa linha. O extremo
 * superior (SMP=7,1) já mostra dose zero nas três colunas.
 */
const SMP_LIMING_TABLE: ReadonlyArray<{ smp: number; dose55: number; dose60: number; dose65: number }> = [
  { smp: 4.4, dose55: 15.0, dose60: 21.0, dose65: 29.0 },
  { smp: 4.5, dose55: 12.5, dose60: 17.3, dose65: 24.0 },
  { smp: 4.6, dose55: 10.9, dose60: 15.1, dose65: 20.0 },
  { smp: 4.7, dose55: 9.6, dose60: 13.3, dose65: 17.5 },
  { smp: 4.8, dose55: 8.5, dose60: 11.9, dose65: 15.7 },
  { smp: 4.9, dose55: 7.7, dose60: 10.7, dose65: 14.2 },
  { smp: 5.0, dose55: 6.6, dose60: 9.9, dose65: 13.3 },
  { smp: 5.1, dose55: 6.0, dose60: 9.1, dose65: 12.3 },
  { smp: 5.2, dose55: 5.3, dose60: 8.3, dose65: 11.3 },
  { smp: 5.3, dose55: 4.8, dose60: 7.5, dose65: 10.4 },
  { smp: 5.4, dose55: 4.2, dose60: 6.8, dose65: 9.5 },
  { smp: 5.5, dose55: 3.7, dose60: 6.1, dose65: 8.6 },
  { smp: 5.6, dose55: 3.2, dose60: 5.4, dose65: 7.8 },
  { smp: 5.7, dose55: 2.8, dose60: 4.8, dose65: 7.0 },
  { smp: 5.8, dose55: 2.3, dose60: 4.2, dose65: 6.3 },
  { smp: 5.9, dose55: 2.0, dose60: 3.7, dose65: 5.6 },
  { smp: 6.0, dose55: 1.6, dose60: 3.2, dose65: 4.9 },
  { smp: 6.1, dose55: 1.3, dose60: 2.7, dose65: 4.3 },
  { smp: 6.2, dose55: 1.0, dose60: 2.2, dose65: 3.7 },
  { smp: 6.3, dose55: 0.8, dose60: 1.8, dose65: 3.1 },
  { smp: 6.4, dose55: 0.6, dose60: 1.4, dose65: 2.6 },
  { smp: 6.5, dose55: 0.4, dose60: 1.1, dose65: 2.1 },
  { smp: 6.6, dose55: 0.2, dose60: 0.8, dose65: 1.6 },
  { smp: 6.7, dose55: 0, dose60: 0.5, dose65: 1.2 },
  { smp: 6.8, dose55: 0, dose60: 0.3, dose65: 0.8 },
  { smp: 6.9, dose55: 0, dose60: 0.2, dose65: 0.5 },
  { smp: 7.0, dose55: 0, dose60: 0, dose65: 0.2 },
  { smp: 7.1, dose55: 0, dose60: 0, dose65: 0 },
];

const SMP_TABLE_SOURCE =
  "Manual de Calagem e Adubação CQFS-RS/SC, 11ª ed. (2016), item 5.2.1, Tabela 5.2 (Murdock et al., 1969; Kaminski, 1974; Scherer, 1976; Ernani & Almeida, 1986; Anjos et al., 1987; Ciprandi et al., 1994). Calcário com PRNT 100%, correção da camada 0-20cm.";

/**
 * Dose de calcário (t/ha, PRNT 100%) pelo método do índice SMP (Tabela 5.2).
 * SMP <= 4,4 usa a linha de 4,4 (o próprio manual trata como faixa aberta);
 * SMP >= 7,1 usa a linha de 7,1 (dose zero). Entre pontos tabelados,
 * INTERPOLA linearmente -- isso é decisão de implementação nossa (o manual
 * só tabela de 0,1 em 0,1), não um valor literal da fonte; documentado aqui
 * pra deixar claro que não é a mesma coisa que "valor tabelado direto".
 */
export function computeLimingDoseBySmpIndex(smpIndex: number, targetPh: LimingTargetPh): { doseTonPerHaPrnt100: number; interpolated: boolean; source: string } {
  const key = targetPh === "5.5" ? "dose55" : targetPh === "6.0" ? "dose60" : "dose65";
  const table = SMP_LIMING_TABLE;
  if (smpIndex <= table[0].smp) {
    return { doseTonPerHaPrnt100: table[0][key], interpolated: false, source: SMP_TABLE_SOURCE };
  }
  const last = table[table.length - 1];
  if (smpIndex >= last.smp) {
    return { doseTonPerHaPrnt100: last[key], interpolated: false, source: SMP_TABLE_SOURCE };
  }
  for (let i = 0; i < table.length - 1; i++) {
    const a = table[i];
    const b = table[i + 1];
    if (smpIndex >= a.smp && smpIndex <= b.smp) {
      if (smpIndex === a.smp) return { doseTonPerHaPrnt100: a[key], interpolated: false, source: SMP_TABLE_SOURCE };
      if (smpIndex === b.smp) return { doseTonPerHaPrnt100: b[key], interpolated: false, source: SMP_TABLE_SOURCE };
      const fraction = (smpIndex - a.smp) / (b.smp - a.smp);
      const dose = a[key] + fraction * (b[key] - a[key]);
      return { doseTonPerHaPrnt100: Math.round(dose * 100) / 100, interpolated: true, source: SMP_TABLE_SOURCE };
    }
  }
  throw new Error(`índice SMP ${smpIndex} fora do intervalo esperado da Tabela 5.2 -- revisão necessária.`);
}

/**
 * NOTA (2026-09-06): um terceiro método de calagem por "saturação específica
 * de Ca a 60%" (Moreira et al., artigo real em Soil & Tillage Research v.255,
 * DOI 10.1016/j.still.2025.106816, UFLA) foi pesquisado e chegou a ser
 * implementado nesta versão do arquivo, depois REMOVIDO. Duas validações
 * externas independentes discordaram sobre a fórmula: uma confirmou a
 * fórmula completa (incluindo a constante 5600 e o denominador %CaO×%PRNT);
 * a segunda achou apenas a FORMA do método no resumo do artigo (não a
 * fórmula literal) e levantou uma suspeita técnica real de dupla contagem
 * ao usar %CaO e %PRNT juntos no denominador (o PRNT já deriva do poder de
 * neutralização, que por sua vez já considera o equivalente CaO+MgO -- a
 * versão sem dupla contagem seria %CaO × %RE, reatividade, não %PRNT). Além
 * disso ficou sem resposta clara qual meta usar na camada 20-40cm (0,6 como
 * a camada superior, ou algo mais perto de 0,39 -- os dois materiais
 * discordam, e reproduzir os números de exemplo do material de marketing só
 * bateu com ~0,39, não com 0,6). Some-se a isso que o próprio manual
 * CQFS-RS/SC (2016), já em uso nesta base, afirma que a relação Ca/Mg de
 * 0,5 a mais de 10 não afeta o rendimento da maioria das culturas -- ou
 * seja, este método entra em tensão direta com a fonte regional que já
 * usamos. Dado tudo isso, e a regra do projeto de nunca publicar
 * recomendação agronômica sem fonte confiável, decisão: NÃO implementar
 * este método até ler o texto completo do artigo (hoje atrás de paywall da
 * Elsevier). Ver `docs/PROJECT_STATE.md` pra histórico completo da pesquisa.
 */

export const LIMING_FORMULA_SOURCES = {
  hAlFromSmp: H_AL_FORMULA_SOURCE,
  necessidadeDeCalcario: NC_FORMULA_SOURCE,
  smpTable: SMP_TABLE_SOURCE,
};
