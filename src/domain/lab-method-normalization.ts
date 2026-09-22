/**
 * Normalização de protocolo/método/unidade na ingestão.
 *
 * Regra estrutural:
 * - o laboratório entrega a MEDIÇÃO + o protocolo/método usado;
 * - o RAIZ identifica o protocolo no documento inteiro (cabeçalho, rodapé, observações etc.);
 * - somente depois traduz a nomenclatura do laboratório para a chave canônica que o motor conhece;
 * - o motor agronômico continua determinístico e com comparação exata: não faz fuzzy-match nem inventa método.
 *
 * O texto bruto precisa permanecer no original_payload para auditoria.
 */

export type MethodAlias = {
  parameterCode: string;
  rawMethod: string;
  canonicalMethod: string;
  note: string;
};

export type LabProtocolId = "TEDESCO_1995";

export type LabProtocolDefinition = {
  id: LabProtocolId;
  canonicalLabel: string;
  aliases: RegExp[];
  methods: Record<string, string>;
};

/**
 * Tedesco et al. (1995), Boletim Técnico n° 5, 2ª ed.
 *
 * Os PDFs Mondial/Cabeda 1414–1429/2026 declaram esse protocolo de forma global no rodapé.
 * Por isso o documento NÃO precisa repetir o procedimento analítico completo em cada célula.
 *
 * Mapeamento por parâmetro:
 * - P/K: Mehlich-1;
 * - Al/Ca/Mg/Mn: extração KCl 1 mol/L (Mn mantido com rótulo próprio Tedesco, sem fingir que
 *   a etapa de leitura/acidificação é idêntica à redação CQFS 2016);
 * - Cu/Zn: HCl 0,1 mol/L;
 * - B: água quente + colorimetria com curcumina;
 * - S: Ca(H2PO4)2 500 mg P/L + turbidimetria.
 *
 * Fontes técnicas registradas na base do projeto: Tedesco et al. 1995 e manuais CQFS-RS/SC.
 */
export const LAB_PROTOCOLS: Record<LabProtocolId, LabProtocolDefinition> = {
  TEDESCO_1995: {
    id: "TEDESCO_1995",
    canonicalLabel: "Tedesco et al. (1995) · Boletim Técnico nº 5 · 2ª ed.",
    aliases: [
      /tedesco[\s\S]*1995/i,
      /boletim\s+t[eé]cnico\s*(?:n[º°o.]*)?\s*5[\s\S]*1995/i,
      /an[aá]lises?\s+de\s+solo[\s\S]*plantas[\s\S]*outros\s+materiais[\s\S]*1995/i,
    ],
    methods: {
      CLAY: "Densímetro",
      PH: "H2O",
      SMP: "Índice SMP",
      P: "Mehlich-1",
      K: "Mehlich-1",
      MO: "Oxidação sulfocrômica",
      AL: "KCl 1 mol/L",
      CA: "KCl 1 mol/L",
      MG: "KCl 1 mol/L",
      H_AL: "SMP",
      CTC: "Calculado: CTCpH7,0 = Ca + Mg + K + (H+Al)",
      S: "Ca(H2PO4)2 500mg P/L, turbidimetria",
      B: "Água quente, colorimetria com curcumina",
      MN: "KCl 1 mol/L (Tedesco 1995)",
      CU: "HCl 0,1 mol/L (Tedesco 1995)",
      ZN: "HCl 0,1 mol/L (Tedesco 1995)",
    },
  },
};

export function identifyLabProtocol(rawProtocol: string | null | undefined): LabProtocolId | null {
  const raw = rawProtocol?.trim();
  if (!raw) return null;
  for (const protocol of Object.values(LAB_PROTOCOLS)) {
    if (protocol.aliases.some((pattern) => pattern.test(raw))) return protocol.id;
  }
  return null;
}

export function protocolMethodFor(parameterCode: string, rawProtocol: string | null | undefined): string | null {
  const protocolId = identifyLabProtocol(rawProtocol);
  if (!protocolId) return null;
  return LAB_PROTOCOLS[protocolId].methods[parameterCode.toUpperCase()] ?? null;
}

/** Equivalências de texto comprovadamente idênticas, mesmo sem protocolo global. */
export const ANALYTICAL_METHOD_ALIASES: MethodAlias[] = [
  {
    parameterCode: "CTC",
    rawMethod: "Calculado: Ca+Mg+K+(H+Al)",
    canonicalMethod: "Calculado: CTCpH7,0 = Ca + Mg + K + (H+Al)",
    note: "Mesma fórmula, numericamente idêntica; muda apenas a notação.",
  },
];

/**
 * Normaliza um método.
 *
 * Prioridade:
 * 1. método explícito canônico/alias conhecido;
 * 2. se o campo veio vazio ou abreviado e existe protocolo global reconhecido, usa o método definido
 *    por esse protocolo para o parâmetro;
 * 3. caso contrário preserva exatamente o texto informado.
 *
 * Um método explícito e não-vazio nunca é sobrescrito por outro protocolo só para 'fazer bater'.
 */
export function normalizeAnalyticalMethod(
  parameterCode: string,
  rawMethod: string,
  rawProtocol?: string | null,
): string {
  const code = parameterCode.toUpperCase();
  const method = rawMethod?.trim() ?? "";
  const alias = ANALYTICAL_METHOD_ALIASES.find((a) => a.parameterCode === code && a.rawMethod === method);
  if (alias) return alias.canonicalMethod;

  const protocolMethod = protocolMethodFor(code, rawProtocol);
  if (!protocolMethod) return method;

  if (!method || method === "NÃO INFORMADO") return protocolMethod;

  // Abreviações que o próprio documento usa continuam rastreadas como rawMethod, mas o protocolo
  // global resolve de forma determinística a técnica completa aplicável àquele parâmetro.
  const protocolAbbreviations: Record<string, string[]> = {
    B: ["Água quente"],
    S: ["Turbidimetria"],
    MN: ["KCl 1 mol/L"],
    CU: ["HCl 0,1 mol/L"],
    ZN: ["HCl 0,1 mol/L"],
  };
  if ((protocolAbbreviations[code] ?? []).includes(method)) return protocolMethod;

  return method;
}

export type UnitAlias = { parameterCode: string; rawUnit: string; canonicalUnit: string; note: string };

/** Canonização de notação; 1 L = 1 dm³, sem mudar numeric_value. */
export const UNIT_ALIASES: UnitAlias[] = [
  {
    parameterCode: "P",
    rawUnit: "mg/L",
    canonicalUnit: "mg/dm³",
    note: "Notação volumétrica equivalente; valor numérico preservado.",
  },
  {
    parameterCode: "K",
    rawUnit: "mg/L",
    canonicalUnit: "mg/dm³",
    note: "Notação volumétrica equivalente; valor numérico preservado.",
  },
];

export function normalizeUnit(parameterCode: string, rawUnit: string): string {
  const alias = UNIT_ALIASES.find((a) => a.parameterCode === parameterCode && a.rawUnit === rawUnit);
  return alias ? alias.canonicalUnit : rawUnit;
}
