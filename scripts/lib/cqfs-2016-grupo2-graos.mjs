/**
 * Faixas de suficiência do Manual de Calagem e Adubação para os Estados do
 * RS e de SC (CQFS-RS/SC, 11ª ed., 2016) que valem para QUALQUER cultura do
 * "Grupo 2" da própria classificação do manual (culturas de grãos, exceto
 * arroz irrigado, entre outras) -- não são exclusivas de uma cultura.
 *
 * Verificado direto contra o PDF oficial em 2026-09-04 (baixado de
 * sbcs-nrs.org.br, lido com pdftotext) e cross-validado contra uma segunda
 * pesquisa de IA independente (GPT) no mesmo dia -- ver docs/PROJECT_STATE.md
 * pelas duas entradas de 2026-09-04 pro histórico completo da verificação,
 * incluindo os 2 erros achados e corrigidos na pesquisa original e o bug de
 * fronteira encontrado no motor (`classifyValue`) durante o cruzamento.
 *
 * NÃO reutilizar isto pra ARROZ (irrigado) sem checar antes -- o manual trata
 * arroz irrigado por alagamento como caso à parte em vários pontos (P e S,
 * por exemplo, têm grupo próprio).
 */

export const SOURCE_2016 = "Manual de Calagem e Adubação para os Estados do Rio Grande do Sul e de Santa Catarina, 11ª ed. (2016)";
export const INSTITUTION_2016 = "CQFS-RS/SC - SBCS Núcleo Regional Sul";

const note = (extra) => `Fonte: ${SOURCE_2016}${extra ? `, ${extra}` : ""}. Verificado contra o PDF oficial em 2026-09-04, cross-validado com uma segunda pesquisa de IA independente no mesmo dia.`;

export const P_GRUPO2 = [
  {
    parameterCode: "P", parameterCategory: "QUIMICO", depthFromCm: 0, depthToCm: 20,
    analyticalMethodAllowed: ["Mehlich-1"], unitExpected: "mg/dm³",
    conditionParameterCode: "CLAY", conditionMin: 60.0001, conditionMax: null,
    sufficiencyRanges: [{ label: "Muito Baixo", max: 3.0 }, { label: "Baixo", min: 3.1, max: 6.0 }, { label: "Médio", min: 6.1, max: 9.0 }, { label: "Alto", min: 9.1, max: 18.0 }, { label: "Muito Alto", min: 18.0 }],
    criticality: "ALTA",
    technicalNotes: note("Tabela 6.4, p.93 -- Grupo 2 (culturas de grãos, exceto arroz irrigado), classe de argila 1 (>60%)"),
  },
  {
    parameterCode: "P", parameterCategory: "QUIMICO", depthFromCm: 0, depthToCm: 20,
    analyticalMethodAllowed: ["Mehlich-1"], unitExpected: "mg/dm³",
    conditionParameterCode: "CLAY", conditionMin: 41, conditionMax: 60,
    sufficiencyRanges: [{ label: "Muito Baixo", max: 4.0 }, { label: "Baixo", min: 4.1, max: 8.0 }, { label: "Médio", min: 8.1, max: 12.0 }, { label: "Alto", min: 12.1, max: 24.0 }, { label: "Muito Alto", min: 24.0 }],
    criticality: "ALTA",
    technicalNotes: note("Tabela 6.4, p.93 -- Grupo 2, classe de argila 2 (60-41%)"),
  },
  {
    parameterCode: "P", parameterCategory: "QUIMICO", depthFromCm: 0, depthToCm: 20,
    analyticalMethodAllowed: ["Mehlich-1"], unitExpected: "mg/dm³",
    conditionParameterCode: "CLAY", conditionMin: 21, conditionMax: 40,
    sufficiencyRanges: [{ label: "Muito Baixo", max: 6.0 }, { label: "Baixo", min: 6.1, max: 12.0 }, { label: "Médio", min: 12.1, max: 18.0 }, { label: "Alto", min: 18.1, max: 36.0 }, { label: "Muito Alto", min: 36.0 }],
    criticality: "ALTA",
    technicalNotes: note("Tabela 6.4, p.93 -- Grupo 2, classe de argila 3 (40-21%)"),
  },
  {
    parameterCode: "P", parameterCategory: "QUIMICO", depthFromCm: 0, depthToCm: 20,
    analyticalMethodAllowed: ["Mehlich-1"], unitExpected: "mg/dm³",
    conditionParameterCode: "CLAY", conditionMin: 0, conditionMax: 20,
    sufficiencyRanges: [{ label: "Muito Baixo", max: 10.0 }, { label: "Baixo", min: 10.1, max: 20.0 }, { label: "Médio", min: 20.1, max: 30.0 }, { label: "Alto", min: 30.1, max: 60.0 }, { label: "Muito Alto", min: 60.0 }],
    criticality: "ALTA",
    technicalNotes: note("Tabela 6.4, p.93 -- Grupo 2, classe de argila 4 (<=20%)"),
  },
];

export const K_GRUPO2 = [
  {
    parameterCode: "K", parameterCategory: "QUIMICO", depthFromCm: 0, depthToCm: 20,
    analyticalMethodAllowed: ["Mehlich-1"], unitExpected: "mg/dm³",
    conditionParameterCode: "CTC", conditionMin: 0, conditionMax: 7.5,
    sufficiencyRanges: [{ label: "Muito Baixo", max: 20 }, { label: "Baixo", min: 21, max: 40 }, { label: "Médio", min: 41, max: 60 }, { label: "Alto", min: 61, max: 120 }, { label: "Muito Alto", min: 120 }],
    criticality: "ALTA",
    technicalNotes: note("Tabela 6.9, p.95-96 -- Grupo 2 (culturas de grãos), CTCpH7,0 <= 7,5 cmolc/dm³"),
  },
  {
    parameterCode: "K", parameterCategory: "QUIMICO", depthFromCm: 0, depthToCm: 20,
    analyticalMethodAllowed: ["Mehlich-1"], unitExpected: "mg/dm³",
    conditionParameterCode: "CTC", conditionMin: 7.6, conditionMax: 15.0,
    sufficiencyRanges: [{ label: "Muito Baixo", max: 30 }, { label: "Baixo", min: 31, max: 60 }, { label: "Médio", min: 61, max: 90 }, { label: "Alto", min: 91, max: 180 }, { label: "Muito Alto", min: 180 }],
    criticality: "ALTA",
    technicalNotes: note("Tabela 6.9, p.95-96 -- Grupo 2, CTCpH7,0 7,6 a 15,0 cmolc/dm³"),
  },
  {
    parameterCode: "K", parameterCategory: "QUIMICO", depthFromCm: 0, depthToCm: 20,
    analyticalMethodAllowed: ["Mehlich-1"], unitExpected: "mg/dm³",
    conditionParameterCode: "CTC", conditionMin: 15.1, conditionMax: 30.0,
    sufficiencyRanges: [{ label: "Muito Baixo", max: 40 }, { label: "Baixo", min: 41, max: 80 }, { label: "Médio", min: 81, max: 120 }, { label: "Alto", min: 121, max: 240 }, { label: "Muito Alto", min: 240 }],
    criticality: "ALTA",
    technicalNotes: note("Tabela 6.9, p.95-96 -- Grupo 2, CTCpH7,0 15,1 a 30,0 cmolc/dm³"),
  },
  {
    parameterCode: "K", parameterCategory: "QUIMICO", depthFromCm: 0, depthToCm: 20,
    analyticalMethodAllowed: ["Mehlich-1"], unitExpected: "mg/dm³",
    conditionParameterCode: "CTC", conditionMin: 30.0001, conditionMax: null,
    sufficiencyRanges: [{ label: "Muito Baixo", max: 45 }, { label: "Baixo", min: 46, max: 90 }, { label: "Médio", min: 91, max: 135 }, { label: "Alto", min: 136, max: 270 }, { label: "Muito Alto", min: 270 }],
    criticality: "ALTA",
    technicalNotes: note("Tabela 6.9, p.95-96 -- Grupo 2, CTCpH7,0 > 30,0 cmolc/dm³"),
  },
];

/** Ca, Mg, MO, CTC, B, Cu, Zn, Mn -- tabelas gerais do manual, não específicas de cultura. S NÃO entra aqui porque o grupo de exigência (5 ou 10 mg/dm³) muda por cultura -- ver S_GERAL/S_GRUPO_EXIGENTE. */
export const SOLO_GERAL = [
  {
    parameterCode: "MO", parameterCategory: "QUIMICO", depthFromCm: 0, depthToCm: 20,
    analyticalMethodAllowed: ["Oxidação sulfocrômica"], unitExpected: "%",
    sufficiencyRanges: [{ label: "Baixo", max: 2.5 }, { label: "Médio", min: 2.6, max: 5.0 }, { label: "Alto", min: 5.0 }],
    criticality: "MEDIA", technicalNotes: note("Tabela 6.1, p.91"),
  },
  {
    parameterCode: "CTC", parameterCategory: "QUIMICO", depthFromCm: 0, depthToCm: 20,
    analyticalMethodAllowed: ["Calculado: CTCpH7,0 = Ca + Mg + K + (H+Al)"], unitExpected: "cmolc/dm³",
    sufficiencyRanges: [{ label: "Baixa", max: 7.5 }, { label: "Média", min: 7.6, max: 15.0 }, { label: "Alta", min: 15.1, max: 30.0 }, { label: "Muito alta", min: 30.0 }],
    criticality: "BAIXA", technicalNotes: note("Tabela 6.1, p.91"),
  },
  {
    parameterCode: "CA", parameterCategory: "QUIMICO", depthFromCm: 0, depthToCm: 20,
    analyticalMethodAllowed: ["KCl 1 mol/L"], unitExpected: "cmolc/dm³",
    sufficiencyRanges: [{ label: "Baixo", max: 2.0 }, { label: "Médio", min: 2.0, max: 4.0 }, { label: "Alto", min: 4.0 }],
    criticality: "MEDIA", technicalNotes: note("Tabela 6.11, p.97"),
  },
  {
    parameterCode: "MG", parameterCategory: "QUIMICO", depthFromCm: 0, depthToCm: 20,
    analyticalMethodAllowed: ["KCl 1 mol/L"], unitExpected: "cmolc/dm³",
    sufficiencyRanges: [{ label: "Baixo", max: 0.5 }, { label: "Médio", min: 0.5, max: 1.0 }, { label: "Alto", min: 1.0 }],
    criticality: "MEDIA", technicalNotes: note("Tabela 6.11, p.97"),
  },
  {
    parameterCode: "B", parameterCategory: "QUIMICO", depthFromCm: 0, depthToCm: 20,
    analyticalMethodAllowed: ["Água quente, colorimetria com curcumina"], unitExpected: "mg/dm³",
    sufficiencyRanges: [{ label: "Baixo", max: 0.1 }, { label: "Médio", min: 0.2, max: 0.3 }, { label: "Alto", min: 0.3 }],
    criticality: "BAIXA", technicalNotes: note("Tabela 6.12, p.98"),
  },
  {
    parameterCode: "CU", parameterCategory: "QUIMICO", depthFromCm: 0, depthToCm: 20,
    analyticalMethodAllowed: ["Mehlich-1"], unitExpected: "mg/dm³",
    sufficiencyRanges: [{ label: "Baixo", max: 0.2 }, { label: "Médio", min: 0.2, max: 0.4 }, { label: "Alto", min: 0.4 }],
    criticality: "BAIXA", technicalNotes: note("Tabela 6.12, p.98"),
  },
  {
    parameterCode: "ZN", parameterCategory: "QUIMICO", depthFromCm: 0, depthToCm: 20,
    analyticalMethodAllowed: ["Mehlich-1"], unitExpected: "mg/dm³",
    sufficiencyRanges: [{ label: "Baixo", max: 0.2 }, { label: "Médio", min: 0.2, max: 0.5 }, { label: "Alto", min: 0.5 }],
    criticality: "BAIXA", technicalNotes: note("Tabela 6.12, p.98"),
  },
  {
    parameterCode: "MN", parameterCategory: "QUIMICO", depthFromCm: 0, depthToCm: 20,
    analyticalMethodAllowed: ["KCl 1 mol/L (acidificado com HCl 2%)"], unitExpected: "mg/dm³",
    sufficiencyRanges: [{ label: "Baixo", max: 2.5 }, { label: "Médio", min: 2.5, max: 5.0 }, { label: "Alto", min: 5.0 }],
    criticality: "BAIXA", technicalNotes: note("Tabela 6.12, p.98"),
  },
];

/** S para culturas do grupo "comum" (a maioria) -- crítico > 5 mg/dm³. */
export const S_GERAL = {
  parameterCode: "S", parameterCategory: "QUIMICO", depthFromCm: 0, depthToCm: 20,
  analyticalMethodAllowed: ["Ca(H2PO4)2 500mg P/L, turbidimetria"], unitExpected: "mg/dm³",
  sufficiencyRanges: [{ label: "Baixo", max: 2.0 }, { label: "Médio", min: 2.0, max: 5.0 }, { label: "Alto", min: 5.0 }],
  criticality: "MEDIA", technicalNotes: note("Tabela 6.11, p.97 -- grupo geral (a maioria das culturas)"),
};

/** S para o grupo mais exigente -- arroz irrigado por alagamento, leguminosas (soja), liliáceas e brássicas (ex.: canola) -- crítico > 10 mg/dm³. */
export const S_GRUPO_EXIGENTE = {
  parameterCode: "S", parameterCategory: "QUIMICO", depthFromCm: 0, depthToCm: 20,
  analyticalMethodAllowed: ["Ca(H2PO4)2 500mg P/L, turbidimetria"], unitExpected: "mg/dm³",
  sufficiencyRanges: [{ label: "Baixo", max: 2.0 }, { label: "Médio", min: 2.0, max: 5.0 }, { label: "Alto", min: 10.0 }],
  criticality: "MEDIA", technicalNotes: note("Tabela 6.11, p.97, nota (1) -- grupo mais exigente (arroz irrigado por alagamento, leguminosas, liliáceas e brássicas): teor crítico >10 mg/dm³, não >5"),
};
