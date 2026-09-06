/**
 * Motor de interpretação de FÓSFORO RELATIVO (PR) via P-remanescente (P-rem)
 * -- MÓDULO SEPARADO da classificação de P já existente em `agronomic-engine.ts`
 * (que classifica por classe de argila, fonte CQFS-RS/SC). Este módulo é a
 * metodologia de Minas Gerais (CFSEMG/Alvarez V.): em vez de estratificar por
 * classe de argila, usa o P-remanescente (capacidade de adsorção do solo,
 * medida em laboratório) pra achar um nível crítico de P específico daquele
 * solo. São dois sistemas de classificação DIFERENTES, não intercambiáveis --
 * um laudo classificado por este módulo não deve ser comparado direto com um
 * classificado pelo módulo de classe de argila. Mantido zero-import (mesma
 * disciplina de `liming-engine.ts` e `agronomic-engine.ts`, ver notas lá).
 *
 * FONTE PRIMÁRIA CONFIRMADA (a tabela, não a equação -- ver nota abaixo):
 * ALVAREZ V., V.H.; NOVAIS, R.F.; BARROS, N.F.; CANTARUTTI, R.B.; LOPES, A.S.
 * "Interpretação dos resultados das análises de solos". In: RIBEIRO, A.C.;
 * GUIMARÃES, P.T.G.; ALVAREZ V., V.H. (eds.). Recomendações para o uso de
 * corretivos e fertilizantes em Minas Gerais -- 5ª Aproximação. Viçosa, MG:
 * Comissão de Fertilidade do Solo do Estado de Minas Gerais (CFSEMG), 1999,
 * p.25-32. Tabela reproduzida (Tabela 3) por: FREIRE, F.M.; PITTA, G.V.E.;
 * ALVES, V.M.C.; FRANÇA, G.E.; COELHO, A.M. "Fertilidade de Solos", Sistema
 * de Produção 1, Embrapa Milho e Sorgo -- atribuição explícita a Alvarez V.
 * et al. (1999), conferida.
 *
 * HISTÓRICO DE VALIDAÇÃO, vale registrar: duas rodadas de validação externa
 * (2026-09-06) confirmaram esta tabela como fonte primária citável. A
 * "equação contínua" abaixo (NC = 4,62 + 0,324731×P-rem + 0,00160568×P-rem²),
 * às vezes atribuída a "Alvarez V. et al., 2000", NÃO teve publicação
 * primária localizada nas duas rodadas -- só uma fonte secundária não
 * revisada. Por outro lado, ela foi verificada numericamente duas vezes: (1)
 * reproduz os 6 pontos de fronteira da tabela oficial de 1999 com desvio
 * máximo de 0,27 mg/dm³; (2) reproduz EXATAMENTE (2 casas decimais) os 4
 * pontos de uma tabela real de laudo (ver `docs/PROJECT_STATE.md`,
 * 2026-09-06). Por isso ela é mantida aqui como cálculo CONTÍNUO auxiliar
 * (granularidade mais fina que os 6 degraus da tabela), mas sempre rotulada
 * como não-oficial -- a classificação por TABELA (função
 * `classifyPhosphorusCFSEMG1999`) é a fonte primária e deve ser preferida
 * quando as duas divergirem perto de uma fronteira de faixa de P-rem (isso
 * acontece -- tabela e equação contínua não são numericamente idênticas em
 * todos os pontos, só nas 6 fronteiras onde a tabela foi ajustada).
 */

export type PhosphorusClass = "MUITO_BAIXO" | "BAIXO" | "MEDIO" | "BOM" | "MUITO_BOM";

type PRemBracket = {
  pRemMax: number;
  muitoBaixoMax: number;
  baixoMax: number;
  medioMax: number;
  bomMax: number;
};

/**
 * Tabela 3 (Alvarez V. et al., 1999) -- Mehlich-1, conferida número a número
 * contra a reprodução da Embrapa Milho e Sorgo. Cada linha cobre uma faixa
 * de P-rem (mg/L) até `pRemMax`; a linha usada é a primeira cujo `pRemMax`
 * seja >= P-rem medido (faixas ordenadas ascendente, sem sobreposição).
 * `medioMax` é o NÍVEL CRÍTICO (NC) daquela faixa de P-rem -- é o limite
 * superior da classe "Médio", conforme o rodapé da tabela original.
 */
const P_REM_TABLE_CFSEMG_1999: ReadonlyArray<PRemBracket> = [
  { pRemMax: 4, muitoBaixoMax: 3.0, baixoMax: 4.3, medioMax: 6.0, bomMax: 9.0 },
  { pRemMax: 10, muitoBaixoMax: 4.0, baixoMax: 6.0, medioMax: 8.3, bomMax: 12.5 },
  { pRemMax: 19, muitoBaixoMax: 6.0, baixoMax: 8.3, medioMax: 11.4, bomMax: 17.5 },
  { pRemMax: 30, muitoBaixoMax: 8.0, baixoMax: 11.4, medioMax: 15.8, bomMax: 24.0 },
  { pRemMax: 44, muitoBaixoMax: 11.0, baixoMax: 15.8, medioMax: 21.8, bomMax: 33.0 },
  { pRemMax: 60, muitoBaixoMax: 15.0, baixoMax: 21.8, medioMax: 30.0, bomMax: 45.0 },
];

const CFSEMG_1999_SOURCE =
  "Alvarez V., V.H. et al. (1999), 'Interpretação dos resultados das análises de solos', in Recomendações para o uso de corretivos e fertilizantes em Minas Gerais -- 5ª Aproximação, CFSEMG. Tabela 3 reproduzida por Freire et al., Sistema de Produção 1, Embrapa Milho e Sorgo. Extrator Mehlich-1.";

const ALVAREZ_2000_CONTINUOUS_SOURCE =
  "Equação contínua NC = 4,62 + 0,324731×P-rem + 0,00160568×P-rem² -- fonte primária (Alvarez V. et al., 2000) NÃO localizada em duas rodadas de validação externa (2026-09-06); mantida por verificação numérica própria contra a tabela CFSEMG 1999 (desvio máx. 0,27 mg/dm³ nas 6 fronteiras) e contra um laudo real de referência (4/4 pontos batendo em 2 casas decimais). Tratar como cálculo auxiliar, não como citação confirmada.";

/**
 * Acha a faixa de P-rem (mg/L) aplicável na Tabela 3. Fora do intervalo
 * coberto pela tabela (P-rem < 0 ou > 60 mg/L) retorna `null` -- não inventa
 * extrapolação além do que a fonte cobre.
 */
function findPRemBracket(pRemMgL: number): PRemBracket | null {
  if (pRemMgL < 0 || pRemMgL > 60) return null;
  for (const bracket of P_REM_TABLE_CFSEMG_1999) {
    if (pRemMgL <= bracket.pRemMax) return bracket;
  }
  return null;
}

/**
 * Classificação de P (Mehlich-1) pela Tabela 3 (CFSEMG 1999) -- método
 * PRIMÁRIO e preferencial deste módulo. `pRemMgL` é o P-remanescente (mg/L)
 * do mesmo laudo.
 */
export function classifyPhosphorusCFSEMG1999(
  pMehlichMgDm3: number,
  pRemMgL: number,
): { classification: PhosphorusClass; nivelCriticoMgDm3: number; source: string } | { classification: null; reason: string } {
  const bracket = findPRemBracket(pRemMgL);
  if (!bracket) {
    return { classification: null, reason: `P-rem ${pRemMgL} mg/L fora do intervalo coberto pela Tabela 3 (0-60 mg/L) -- não é possível classificar sem extrapolar a fonte.` };
  }
  let classification: PhosphorusClass;
  if (pMehlichMgDm3 <= bracket.muitoBaixoMax) classification = "MUITO_BAIXO";
  else if (pMehlichMgDm3 <= bracket.baixoMax) classification = "BAIXO";
  else if (pMehlichMgDm3 <= bracket.medioMax) classification = "MEDIO";
  else if (pMehlichMgDm3 <= bracket.bomMax) classification = "BOM";
  else classification = "MUITO_BOM";
  return { classification, nivelCriticoMgDm3: bracket.medioMax, source: CFSEMG_1999_SOURCE };
}

/**
 * Nível crítico de P (mg/dm³) por interpolação contínua em função do P-rem.
 * Ver nota de topo do arquivo sobre o status desta equação (auxiliar, não
 * citação primária confirmada).
 */
export function computeNivelCriticoP_ContinuousApprox(pRemMgL: number): number {
  return 4.62 + 0.324731 * pRemMgL + 0.00160568 * pRemMgL * pRemMgL;
}

export type FosforoRelativoResult = {
  nivelCriticoMgDm3: number;
  fosforoRelativoPercent: number;
  source: string;
};

/**
 * Fósforo Relativo: PR (%) = 100 × P_Mehlich / NC, usando a equação contínua
 * pra achar NC (granularidade mais fina que os degraus da Tabela 3).
 */
export function computeFosforoRelativo(pMehlichMgDm3: number, pRemMgL: number): FosforoRelativoResult {
  const nivelCriticoMgDm3 = computeNivelCriticoP_ContinuousApprox(pRemMgL);
  const fosforoRelativoPercent = (100 * pMehlichMgDm3) / nivelCriticoMgDm3;
  return {
    nivelCriticoMgDm3: Math.round(nivelCriticoMgDm3 * 100) / 100,
    fosforoRelativoPercent: Math.round(fosforoRelativoPercent * 100) / 100,
    source: ALVAREZ_2000_CONTINUOUS_SOURCE,
  };
}

const FOSFORO_RELATIVO_BANDS_SOURCE =
  "Faixas de classificação do PR(%) NÃO são uma tabela publicada -- são derivação própria a partir das razões entre os limites da Tabela 3 (CFSEMG 1999) e o nível crítico de cada faixa de P-rem (razões observadas: Muito baixo/Baixo ~0,48-0,53; Baixo/Médio ~0,72-0,73; Bom/Médio ~1,50-1,54). Verificada em duas rodadas de validação externa (2026-09-06) com resultado convergente. Pode divergir da classificação por Tabela 3 perto de fronteiras de faixa de P-rem -- ver nota de topo do arquivo.";

/**
 * Classifica o PR(%) em faixas (Muito baixo/Baixo/Médio/Bom/Muito bom).
 * Ver `FOSFORO_RELATIVO_BANDS_SOURCE` -- não é tabela oficial publicada,
 * é derivação verificada. Preferir `classifyPhosphorusCFSEMG1999` quando
 * disponível; esta função serve pra quando só se tem o PR(%) já calculado.
 */
export function classifyFosforoRelativoPercent(prPercent: number): { classification: PhosphorusClass; source: string } {
  let classification: PhosphorusClass;
  if (prPercent <= 50) classification = "MUITO_BAIXO";
  else if (prPercent <= 72) classification = "BAIXO";
  else if (prPercent <= 100) classification = "MEDIO";
  else if (prPercent <= 150) classification = "BOM";
  else classification = "MUITO_BOM";
  return { classification, source: FOSFORO_RELATIVO_BANDS_SOURCE };
}

export const PHOSPHORUS_RELATIVO_SOURCES = {
  cfsemg1999Table: CFSEMG_1999_SOURCE,
  continuousApprox: ALVAREZ_2000_CONTINUOUS_SOURCE,
  relativeBands: FOSFORO_RELATIVO_BANDS_SOURCE,
};
