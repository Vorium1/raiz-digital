export type NationalSoilBiologyMethodId =
  | "BIOAS_BETA_GLUCOSIDASE"
  | "BIOAS_ARYLSULFATASE"
  | "MICROBIAL_BIOMASS_C_FUMIGATION_EXTRACTION"
  | "MICROBIAL_BIOMASS_N_FUMIGATION_EXTRACTION"
  | "BASAL_RESPIRATION"
  | "METABOLIC_QUOTIENT_QCO2"
  | "FDA_HYDROLYSIS"
  | "DEHYDROGENASE_ACTIVITY"
  | "ACID_PHOSPHATASE_ACTIVITY"
  | "ALKALINE_PHOSPHATASE_ACTIVITY"
  | "MYCORRHIZAL_ROOT_COLONIZATION"
  | "MYCORRHIZAL_SPORE_COUNT"
  | "QPCR_TARGET_QUANTIFICATION"
  | "METABARCODING_16S"
  | "METABARCODING_ITS"
  | "MAPA_INOCULANT_COUNT_IDENTIFICATION_PURITY";

export type SoilBiologySampleMatrix = "SOIL" | "ROOT" | "INOCULANT_PRODUCT";
export type SoilBiologyMethodMaturity =
  | "NATIONAL_ROUTINE_TECHNOLOGY"
  | "EMBRAPA_REFERENCE_PROTOCOL"
  | "MAPA_OFFICIAL_PRODUCT_CONTROL"
  | "RESEARCH_OR_LAB_SPECIFIC";

export type SoilBiologyMethodRegistryEntry = {
  id: NationalSoilBiologyMethodId;
  label: string;
  sampleMatrix: SoilBiologySampleMatrix;
  maturity: SoilBiologyMethodMaturity;
  referenceInstitution: "EMBRAPA" | "MAPA";
  referenceTitle: string;
  standardDepthCm: { from: number; to: number } | null;
  protocolTextRequiredForInterpretation: boolean;
  unitMustComeFromLab: boolean;
  universalNationalInterpretiveThresholdsAvailable: boolean;
  comparableAcrossDifferentProtocols: boolean;
  automaticNutrientCreditAllowed: false;
  notes: string;
};

export const NATIONAL_SOIL_BIOLOGY_METHOD_REGISTRY: Record<
  NationalSoilBiologyMethodId,
  SoilBiologyMethodRegistryEntry
> = {
  BIOAS_BETA_GLUCOSIDASE: {
    id: "BIOAS_BETA_GLUCOSIDASE",
    label: "β-glicosidase — BioAS",
    sampleMatrix: "SOIL",
    maturity: "NATIONAL_ROUTINE_TECHNOLOGY",
    referenceInstitution: "EMBRAPA",
    referenceTitle: "Tecnologia BioAS / Rede Embrapa de BioAnálise do Solo",
    standardDepthCm: { from: 0, to: 10 },
    protocolTextRequiredForInterpretation: true,
    unitMustComeFromLab: false,
    universalNationalInterpretiveThresholdsAvailable: false,
    comparableAcrossDifferentProtocols: false,
    automaticNutrientCreditAllowed: false,
    notes: "Bioindicador de atividade ligada à ciclagem de C. Índices/classes oficiais do laboratório podem ser preservados; a RAIZ não recalcula IQS sem algoritmo/versionamento oficial.",
  },
  BIOAS_ARYLSULFATASE: {
    id: "BIOAS_ARYLSULFATASE",
    label: "Arilsulfatase — BioAS",
    sampleMatrix: "SOIL",
    maturity: "NATIONAL_ROUTINE_TECHNOLOGY",
    referenceInstitution: "EMBRAPA",
    referenceTitle: "Tecnologia BioAS / Rede Embrapa de BioAnálise do Solo",
    standardDepthCm: { from: 0, to: 10 },
    protocolTextRequiredForInterpretation: true,
    unitMustComeFromLab: false,
    universalNationalInterpretiveThresholdsAvailable: false,
    comparableAcrossDifferentProtocols: false,
    automaticNutrientCreditAllowed: false,
    notes: "Bioindicador de atividade ligada à ciclagem de S. Não equivale a enxofre disponível nem autoriza crédito automático de S.",
  },
  MICROBIAL_BIOMASS_C_FUMIGATION_EXTRACTION: {
    id: "MICROBIAL_BIOMASS_C_FUMIGATION_EXTRACTION",
    label: "Carbono da biomassa microbiana — fumigação-extração",
    sampleMatrix: "SOIL",
    maturity: "EMBRAPA_REFERENCE_PROTOCOL",
    referenceInstitution: "EMBRAPA",
    referenceTitle: "Determinação do carbono da biomassa microbiana do solo: método da fumigação-extração",
    standardDepthCm: null,
    protocolTextRequiredForInterpretation: true,
    unitMustComeFromLab: true,
    universalNationalInterpretiveThresholdsAvailable: false,
    comparableAcrossDifferentProtocols: false,
    automaticNutrientCreditAllowed: false,
    notes: "O protocolo, forma de determinação do C no extrato e fator de conversão precisam acompanhar o resultado para comparabilidade técnica.",
  },
  MICROBIAL_BIOMASS_N_FUMIGATION_EXTRACTION: {
    id: "MICROBIAL_BIOMASS_N_FUMIGATION_EXTRACTION",
    label: "Nitrogênio da biomassa microbiana — fumigação-extração",
    sampleMatrix: "SOIL",
    maturity: "EMBRAPA_REFERENCE_PROTOCOL",
    referenceInstitution: "EMBRAPA",
    referenceTitle: "Determinação do nitrogênio da biomassa microbiana do solo (BMS-N)",
    standardDepthCm: null,
    protocolTextRequiredForInterpretation: true,
    unitMustComeFromLab: true,
    universalNationalInterpretiveThresholdsAvailable: false,
    comparableAcrossDifferentProtocols: false,
    automaticNutrientCreditAllowed: false,
    notes: "BMS-N descreve o compartimento microbiano de N; não representa N mineral disponível nem kg N/ha para crédito de adubação.",
  },
  BASAL_RESPIRATION: {
    id: "BASAL_RESPIRATION",
    label: "Respiração basal do solo",
    sampleMatrix: "SOIL",
    maturity: "EMBRAPA_REFERENCE_PROTOCOL",
    referenceInstitution: "EMBRAPA",
    referenceTitle: "Determinação da respiração basal (RBS) e quociente metabólico do solo (qCO2)",
    standardDepthCm: null,
    protocolTextRequiredForInterpretation: true,
    unitMustComeFromLab: true,
    universalNationalInterpretiveThresholdsAvailable: false,
    comparableAcrossDifferentProtocols: false,
    automaticNutrientCreditAllowed: false,
    notes: "Resultado depende de preparo, umidade, temperatura, massa e tempo de incubação; respiração maior não é universalmente 'melhor'.",
  },
  METABOLIC_QUOTIENT_QCO2: {
    id: "METABOLIC_QUOTIENT_QCO2",
    label: "Quociente metabólico qCO₂",
    sampleMatrix: "SOIL",
    maturity: "EMBRAPA_REFERENCE_PROTOCOL",
    referenceInstitution: "EMBRAPA",
    referenceTitle: "Determinação da respiração basal (RBS) e quociente metabólico do solo (qCO2)",
    standardDepthCm: null,
    protocolTextRequiredForInterpretation: true,
    unitMustComeFromLab: true,
    universalNationalInterpretiveThresholdsAvailable: false,
    comparableAcrossDifferentProtocols: false,
    automaticNutrientCreditAllowed: false,
    notes: "Índice derivado da respiração em relação à biomassa microbiana. Não deve ser recalculado combinando resultados de protocolos/amostras incompatíveis.",
  },
  FDA_HYDROLYSIS: {
    id: "FDA_HYDROLYSIS",
    label: "Hidrólise de diacetato de fluoresceína (FDA)",
    sampleMatrix: "SOIL",
    maturity: "EMBRAPA_REFERENCE_PROTOCOL",
    referenceInstitution: "EMBRAPA",
    referenceTitle: "Método de hidrólise de diacetato de fluoresceína como indicador de atividade microbiana no solo",
    standardDepthCm: null,
    protocolTextRequiredForInterpretation: true,
    unitMustComeFromLab: true,
    universalNationalInterpretiveThresholdsAvailable: false,
    comparableAcrossDifferentProtocols: false,
    automaticNutrientCreditAllowed: false,
    notes: "Indicador amplo de atividade hidrolítica; condições de incubação e curva analítica precisam ser preservadas.",
  },
  DEHYDROGENASE_ACTIVITY: {
    id: "DEHYDROGENASE_ACTIVITY",
    label: "Atividade de desidrogenase",
    sampleMatrix: "SOIL",
    maturity: "RESEARCH_OR_LAB_SPECIFIC",
    referenceInstitution: "EMBRAPA",
    referenceTitle: "Indicadores biológicos e bioquímicos da qualidade do solo — referências Embrapa",
    standardDepthCm: null,
    protocolTextRequiredForInterpretation: true,
    unitMustComeFromLab: true,
    universalNationalInterpretiveThresholdsAvailable: false,
    comparableAcrossDifferentProtocols: false,
    automaticNutrientCreditAllowed: false,
    notes: "Substrato, incubação, extração e unidade podem variar entre protocolos; preservar integralmente o método do laboratório.",
  },
  ACID_PHOSPHATASE_ACTIVITY: {
    id: "ACID_PHOSPHATASE_ACTIVITY",
    label: "Atividade de fosfatase ácida",
    sampleMatrix: "SOIL",
    maturity: "RESEARCH_OR_LAB_SPECIFIC",
    referenceInstitution: "EMBRAPA",
    referenceTitle: "Indicadores bioquímicos da qualidade do solo — fosfatase ácida",
    standardDepthCm: null,
    protocolTextRequiredForInterpretation: true,
    unitMustComeFromLab: true,
    universalNationalInterpretiveThresholdsAvailable: false,
    comparableAcrossDifferentProtocols: false,
    automaticNutrientCreditAllowed: false,
    notes: "Atividade ligada à ciclagem de P orgânico; não equivale a P disponível por extrator químico.",
  },
  ALKALINE_PHOSPHATASE_ACTIVITY: {
    id: "ALKALINE_PHOSPHATASE_ACTIVITY",
    label: "Atividade de fosfatase alcalina",
    sampleMatrix: "SOIL",
    maturity: "RESEARCH_OR_LAB_SPECIFIC",
    referenceInstitution: "EMBRAPA",
    referenceTitle: "Indicadores bioquímicos da qualidade do solo — fosfatase alcalina",
    standardDepthCm: null,
    protocolTextRequiredForInterpretation: true,
    unitMustComeFromLab: true,
    universalNationalInterpretiveThresholdsAvailable: false,
    comparableAcrossDifferentProtocols: false,
    automaticNutrientCreditAllowed: false,
    notes: "Preservar pH/tampão, substrato, incubação e unidade do laboratório.",
  },
  MYCORRHIZAL_ROOT_COLONIZATION: {
    id: "MYCORRHIZAL_ROOT_COLONIZATION",
    label: "Colonização micorrízica radicular",
    sampleMatrix: "ROOT",
    maturity: "RESEARCH_OR_LAB_SPECIFIC",
    referenceInstitution: "EMBRAPA",
    referenceTitle: "Metodologias para análise de solo e raízes e avaliações de micorriza arbuscular",
    standardDepthCm: null,
    protocolTextRequiredForInterpretation: true,
    unitMustComeFromLab: true,
    universalNationalInterpretiveThresholdsAvailable: false,
    comparableAcrossDifferentProtocols: false,
    automaticNutrientCreditAllowed: false,
    notes: "É medida em raiz, não no solo. Percentual de colonização depende de hospedeiro, manejo, época e protocolo.",
  },
  MYCORRHIZAL_SPORE_COUNT: {
    id: "MYCORRHIZAL_SPORE_COUNT",
    label: "Contagem de esporos de fungos micorrízicos arbusculares",
    sampleMatrix: "SOIL",
    maturity: "RESEARCH_OR_LAB_SPECIFIC",
    referenceInstitution: "EMBRAPA",
    referenceTitle: "Metodologias para análise de solo e raízes e avaliações de micorriza arbuscular",
    standardDepthCm: null,
    protocolTextRequiredForInterpretation: true,
    unitMustComeFromLab: true,
    universalNationalInterpretiveThresholdsAvailable: false,
    comparableAcrossDifferentProtocols: false,
    automaticNutrientCreditAllowed: false,
    notes: "Contagem de esporos não é equivalente a colonização radicular, função micorrízica ou crédito de P.",
  },
  QPCR_TARGET_QUANTIFICATION: {
    id: "QPCR_TARGET_QUANTIFICATION",
    label: "qPCR de alvo microbiano",
    sampleMatrix: "SOIL",
    maturity: "RESEARCH_OR_LAB_SPECIFIC",
    referenceInstitution: "EMBRAPA",
    referenceTitle: "Aplicações moleculares em microbiologia do solo",
    standardDepthCm: null,
    protocolTextRequiredForInterpretation: true,
    unitMustComeFromLab: true,
    universalNationalInterpretiveThresholdsAvailable: false,
    comparableAcrossDifferentProtocols: false,
    automaticNutrientCreditAllowed: false,
    notes: "Exige alvo/primers, eficiência, padrão/calibração e base da unidade. Cópias de gene não equivalem automaticamente a células viáveis ou atividade em campo.",
  },
  METABARCODING_16S: {
    id: "METABARCODING_16S",
    label: "Metabarcoding 16S",
    sampleMatrix: "SOIL",
    maturity: "RESEARCH_OR_LAB_SPECIFIC",
    referenceInstitution: "EMBRAPA",
    referenceTitle: "Aplicações de microbioma/metabarcoding em solos agrícolas",
    standardDepthCm: null,
    protocolTextRequiredForInterpretation: true,
    unitMustComeFromLab: false,
    universalNationalInterpretiveThresholdsAvailable: false,
    comparableAcrossDifferentProtocols: false,
    automaticNutrientCreditAllowed: false,
    notes: "Preservar região alvo, primers, plataforma, pipeline e banco taxonômico. Abundância relativa entre pipelines diferentes não é diretamente comparável.",
  },
  METABARCODING_ITS: {
    id: "METABARCODING_ITS",
    label: "Metabarcoding ITS",
    sampleMatrix: "SOIL",
    maturity: "RESEARCH_OR_LAB_SPECIFIC",
    referenceInstitution: "EMBRAPA",
    referenceTitle: "Aplicações de microbioma/metabarcoding em solos agrícolas",
    standardDepthCm: null,
    protocolTextRequiredForInterpretation: true,
    unitMustComeFromLab: false,
    universalNationalInterpretiveThresholdsAvailable: false,
    comparableAcrossDifferentProtocols: false,
    automaticNutrientCreditAllowed: false,
    notes: "Preservar região ITS, primers, plataforma, pipeline e banco taxonômico; diversidade/abundância não implica função agronômica específica.",
  },
  MAPA_INOCULANT_COUNT_IDENTIFICATION_PURITY: {
    id: "MAPA_INOCULANT_COUNT_IDENTIFICATION_PURITY",
    label: "Contagem, identificação e pureza de inoculante — MAPA",
    sampleMatrix: "INOCULANT_PRODUCT",
    maturity: "MAPA_OFFICIAL_PRODUCT_CONTROL",
    referenceInstitution: "MAPA",
    referenceTitle: "Instrução Normativa nº 30/2010 — métodos oficiais para análise de inoculantes",
    standardDepthCm: null,
    protocolTextRequiredForInterpretation: true,
    unitMustComeFromLab: true,
    universalNationalInterpretiveThresholdsAvailable: false,
    comparableAcrossDifferentProtocols: false,
    automaticNutrientCreditAllowed: false,
    notes: "Método oficial de controle de produto. Não deve ser usado como se fosse uma análise quantitativa da microbiota do solo.",
  },
};

export type SoilBiologyMethodObservationContext = {
  methodId: NationalSoilBiologyMethodId;
  sampleMatrix: SoilBiologySampleMatrix;
  unit?: string | null;
  protocolText?: string | null;
  depthFromCm?: number | null;
  depthToCm?: number | null;
};

export function assessNationalSoilBiologyMethodContext(
  input: SoilBiologyMethodObservationContext,
) {
  const method = NATIONAL_SOIL_BIOLOGY_METHOD_REGISTRY[input.methodId];
  const warnings: string[] = [];
  let compatible = true;

  if (input.sampleMatrix !== method.sampleMatrix) {
    compatible = false;
    warnings.push("SOIL_BIOLOGY_SAMPLE_MATRIX_MISMATCH");
  }
  if (method.protocolTextRequiredForInterpretation && !input.protocolText?.trim()) {
    warnings.push("SOIL_BIOLOGY_PROTOCOL_REQUIRED_FOR_INTERPRETATION");
  }
  if (method.unitMustComeFromLab && !input.unit?.trim()) {
    warnings.push("SOIL_BIOLOGY_UNIT_REQUIRED_FROM_LAB");
  }

  if (method.standardDepthCm) {
    if (input.depthFromCm == null || input.depthToCm == null) {
      warnings.push("SOIL_BIOLOGY_STANDARD_DEPTH_NOT_REPORTED");
    } else if (
      input.depthFromCm !== method.standardDepthCm.from
      || input.depthToCm !== method.standardDepthCm.to
    ) {
      warnings.push("SOIL_BIOLOGY_DEPTH_DIFFERS_FROM_METHOD_STANDARD");
    }
  }

  return {
    method,
    compatible,
    directNationalThresholdInterpretationAllowed:
      method.universalNationalInterpretiveThresholdsAvailable
      && compatible
      && warnings.length === 0,
    crossProtocolNumericComparisonAllowed: method.comparableAcrossDifferentProtocols,
    automaticNutrientCreditAllowed: false as const,
    warnings: [...new Set(warnings)],
  };
}

export function canCompareSoilBiologyObservations(input: {
  left: SoilBiologyMethodObservationContext;
  right: SoilBiologyMethodObservationContext;
}) {
  const left = assessNationalSoilBiologyMethodContext(input.left);
  const right = assessNationalSoilBiologyMethodContext(input.right);

  if (!left.compatible || !right.compatible) {
    return { comparable: false, reason: "SAMPLE_MATRIX_OR_METHOD_CONTEXT_INCOMPATIBLE" as const };
  }
  if (input.left.methodId !== input.right.methodId) {
    return { comparable: false, reason: "DIFFERENT_METHOD_IDS" as const };
  }
  if (!left.method.comparableAcrossDifferentProtocols) {
    const leftProtocol = input.left.protocolText?.trim() ?? "";
    const rightProtocol = input.right.protocolText?.trim() ?? "";
    if (!leftProtocol || !rightProtocol || leftProtocol !== rightProtocol) {
      return { comparable: false, reason: "PROTOCOL_IDENTITY_REQUIRED" as const };
    }
  }
  const leftUnit = input.left.unit?.trim() ?? "";
  const rightUnit = input.right.unit?.trim() ?? "";
  if (leftUnit && rightUnit && leftUnit !== rightUnit) {
    return { comparable: false, reason: "UNIT_MISMATCH" as const };
  }
  return { comparable: true, reason: "SAME_METHOD_PROTOCOL_AND_UNIT" as const };
}
