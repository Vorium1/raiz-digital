export type SoilMicrobiologyEvidenceFamily =
  | "BIOAS_SOIL_HEALTH"
  | "FUNCTIONAL_MICROORGANISM"
  | "INOCULANT_ORGANISM"
  | "MYCORRHIZA"
  | "MICROBIAL_BIOMASS"
  | "SOIL_RESPIRATION"
  | "SOIL_ENZYME_ACTIVITY"
  | "MOLECULAR_COMMUNITY_PROFILE"
  | "PATHOGEN_OR_DISEASE_RISK"
  | "OTHER";

export type SoilMicrobiologyFunctionalRole =
  | "BIOLOGICAL_N_FIXATION"
  | "PLANT_GROWTH_PROMOTION"
  | "PHOSPHORUS_SOLUBILIZATION"
  | "PHOSPHORUS_CYCLING"
  | "POTASSIUM_SOLUBILIZATION"
  | "SULFUR_CYCLING"
  | "MYCORRHIZAL_P_UPTAKE"
  | "ORGANIC_MATTER_CYCLING"
  | "DISEASE_SUPPRESSION"
  | "PATHOGEN"
  | "OTHER";

export type SoilMicrobiologySampleMatrix = "SOIL" | "ROOT" | "INOCULANT_PRODUCT" | "UNKNOWN";

export type SoilMicrobiologyMethodFamily =
  | "ENZYME_ACTIVITY"
  | "CULTURE_COUNT_CFU"
  | "MOST_PROBABLE_NUMBER"
  | "QPCR"
  | "METABARCODING_16S"
  | "METABARCODING_ITS"
  | "PLFA"
  | "MICROBIAL_BIOMASS_C"
  | "MICROBIAL_BIOMASS_N"
  | "BASAL_RESPIRATION"
  | "METABOLIC_QUOTIENT_QCO2"
  | "FDA_HYDROLYSIS"
  | "DEHYDROGENASE_ACTIVITY"
  | "PHOSPHATASE_ACTIVITY"
  | "MYCORRHIZAL_COLONIZATION"
  | "SPORE_COUNT"
  | "LAB_DERIVED_INDEX"
  | "OTHER"
  | "UNKNOWN";

export type SoilMicrobiologyObservation = {
  parameterName: string;
  family: SoilMicrobiologyEvidenceFamily;
  sampleMatrix?: SoilMicrobiologySampleMatrix;
  functionalRole?: SoilMicrobiologyFunctionalRole | null;
  organismOrTaxon?: string | null;
  value: number | null;
  unit: string | null;
  methodFamily: SoilMicrobiologyMethodFamily;
  methodText: string | null;
  protocolText?: string | null;
  depthFromCm?: number | null;
  depthToCm?: number | null;
  labInterpretation?: string | null;
  detectionLimit?: number | null;
  quantificationLimit?: number | null;
};

export type SoilMicrobiologyEvidenceInput = {
  observations: SoilMicrobiologyObservation[];
  cropCode?: string | null;
  regionCode?: string | null;
  validatedAgronomicRuleIds?: string[];
};

const NUTRIENT_MOBILIZATION_ROLES = new Set<SoilMicrobiologyFunctionalRole>([
  "BIOLOGICAL_N_FIXATION",
  "PHOSPHORUS_SOLUBILIZATION",
  "POTASSIUM_SOLUBILIZATION",
  "MYCORRHIZAL_P_UPTAKE",
  "SULFUR_CYCLING",
]);

function validObservationValue(item: SoilMicrobiologyObservation) {
  return item.value == null || (Number.isFinite(item.value) && item.value >= 0);
}

/**
 * Evidência microbiológica complementar.
 *
 * Esta camada NÃO substitui a BioAS e NÃO converte presença/abundância de um
 * microrganismo em crédito automático de fertilizante.
 *
 * Exemplos:
 * - Azospirillum/Bradyrhizobium: podem sustentar contexto de FBN/PGP, mas uma
 *   contagem no solo não vira automaticamente kg N/ha.
 * - solubilizadores de P/K: presença/capacidade funcional não autoriza reduzir
 *   P2O5/K2O sem regra agronômica validada para cultura, produto, dose e manejo.
 * - qPCR/metabarcoding: descrevem abundância/comunidade; não são equivalentes a
 *   atividade funcional em campo.
 *
 * Ausência desta camada nunca bloqueia a interpretação químico-física válida.
 */
export function evaluateSoilMicrobiologyEvidence(input: SoilMicrobiologyEvidenceInput) {
  const observations = input.observations.filter((item) => {
    if (!item.parameterName.trim()) return false;
    if (!validObservationValue(item)) {
      throw new Error(`Valor microbiológico inválido para ${item.parameterName}.`);
    }
    return true;
  });

  const warnings: string[] = [];
  const roles = new Set(
    observations
      .map((item) => item.functionalRole ?? null)
      .filter((item): item is SoilMicrobiologyFunctionalRole => item != null),
  );

  for (const item of observations) {
    if (item.methodFamily === "UNKNOWN" || !item.methodText?.trim()) {
      warnings.push("MICROBIOLOGY_METHOD_NOT_EXPLICIT");
    }
    if (item.organismOrTaxon && !item.organismOrTaxon.trim()) {
      warnings.push("MICROBIOLOGY_TAXON_EMPTY");
    }
    if (item.family === "MOLECULAR_COMMUNITY_PROFILE" && item.methodFamily !== "QPCR"
      && item.methodFamily !== "METABARCODING_16S" && item.methodFamily !== "METABARCODING_ITS") {
      warnings.push("MOLECULAR_PROFILE_METHOD_FAMILY_MISMATCH");
    }
    if (item.methodFamily === "MYCORRHIZAL_COLONIZATION" && item.sampleMatrix !== "ROOT") {
      warnings.push("MYCORRHIZAL_COLONIZATION_REQUIRES_ROOT_MATRIX");
    }
    if (item.methodFamily === "SPORE_COUNT" && item.family === "MYCORRHIZA" && item.sampleMatrix !== "SOIL") {
      warnings.push("MYCORRHIZAL_SPORE_COUNT_REQUIRES_SOIL_MATRIX");
    }
    if (item.sampleMatrix === "INOCULANT_PRODUCT" && item.family !== "INOCULANT_ORGANISM") {
      warnings.push("INOCULANT_PRODUCT_MATRIX_FAMILY_MISMATCH");
    }
  }

  const nutrientMobilizationEvidence = observations.filter(
    (item) => item.functionalRole != null && NUTRIENT_MOBILIZATION_ROLES.has(item.functionalRole),
  );

  const validatedRules = new Set((input.validatedAgronomicRuleIds ?? []).filter(Boolean));
  const automaticNutrientCreditAllowed = false;
  const automaticDoseAdjustmentAllowed = false;

  return {
    hasMicrobiologyEvidence: observations.length > 0,
    observations,
    detectedFunctionalRoles: [...roles],
    nutrientMobilizationEvidence,
    interpretationPolicy: {
      preserveLabMethodAndProtocol: true as const,
      preserveLabInterpretationWhenProvided: true as const,
      taxonomyIsNotFunction: true as const,
      abundanceIsNotFieldNutrientFlux: true as const,
      molecularPresenceIsNotAutomaticActivityProof: true as const,
    },
    agronomicPolicy: {
      biologyRequiredForBaseSoilOpinion: false as const,
      missingMicrobiologyBlocksAnalysis: false as const,
      missingMicrobiologyBlocksOfficialReport: false as const,
      automaticNutrientCreditAllowed,
      automaticDoseAdjustmentAllowed,
      validatedAgronomicRuleCount: validatedRules.size,
      specificRuleRequiredForNutrientCredit: true as const,
      specificRuleRequiredForProductRecommendation: true as const,
    },
    warnings: [...new Set(warnings)],
  };
}

export const NATIONAL_SOIL_BIOLOGY_METHOD_REFERENCES = {
  BIOAS_EMBRAPA: {
    scope: "SOIL_HEALTH" as const,
    methodFamily: "ENZYME_ACTIVITY" as const,
    status: "ROUTINE_TECHNOLOGY" as const,
    description:
      "BioAS/Embrapa: atividade de beta-glicosidase e arilsulfatase como bioindicadores da saúde do solo; integra química e biologia em índices de qualidade.",
    sourceTitle: "Tecnologia BioAS — Embrapa Cerrados",
    standardSamplingDepthCm: { from: 0, to: 10 },
    automaticCrossRegionInterpretationAllowed: false as const,
    nutrientDoseCreditAllowedByMethodAlone: false as const,
  },
  MICROBIAL_BIOMASS_C_FUMIGATION_EXTRACTION: {
    scope: "MICROBIAL_BIOMASS" as const,
    methodFamily: "MICROBIAL_BIOMASS_C" as const,
    status: "CLASSICAL_REFERENCE_METHOD" as const,
    description:
      "Carbono da biomassa microbiana por fumigação-extração: quantifica o compartimento microbiano de C; protocolo e fator de conversão devem ser preservados do laboratório.",
    sourceTitle: "Embrapa Agrobiologia — determinação do carbono da biomassa microbiana do solo por fumigação-extração",
    nutrientDoseCreditAllowedByMethodAlone: false as const,
  },
  MICROBIAL_BIOMASS_N_FUMIGATION_EXTRACTION: {
    scope: "MICROBIAL_BIOMASS" as const,
    methodFamily: "MICROBIAL_BIOMASS_N" as const,
    status: "CLASSICAL_REFERENCE_METHOD" as const,
    description:
      "Nitrogênio da biomassa microbiana por fumigação-extração: descreve o compartimento microbiano de N; método, unidade e fator de conversão precisam acompanhar o resultado.",
    sourceTitle: "Embrapa Agrobiologia — determinação do nitrogênio da biomassa microbiana do solo (BMS-N)",
    nutrientDoseCreditAllowedByMethodAlone: false as const,
  },
  BASAL_RESPIRATION_AND_QCO2: {
    scope: "MICROBIAL_ACTIVITY" as const,
    methodFamily: "BASAL_RESPIRATION" as const,
    status: "CLASSICAL_REFERENCE_METHOD" as const,
    description:
      "Respiração basal quantifica CO2 liberado pela atividade microbiana; qCO2 relaciona respiração e biomassa e é indicador de eficiência/estresse, dependente do protocolo.",
    sourceTitle: "Embrapa Agrobiologia — respiração basal do solo e quociente metabólico qCO2",
    nutrientDoseCreditAllowedByMethodAlone: false as const,
  },
  FDA_HYDROLYSIS: {
    scope: "MICROBIAL_ACTIVITY" as const,
    methodFamily: "FDA_HYDROLYSIS" as const,
    status: "CLASSICAL_REFERENCE_METHOD" as const,
    description:
      "Hidrólise de diacetato de fluoresceína (FDA) estima atividade microbiana/enzimática ampla; valores dependem fortemente do protocolo e não devem ser comparados entre métodos distintos sem validação.",
    sourceTitle: "Embrapa — método de hidrólise de diacetato de fluoresceína como indicador de atividade microbiana",
    nutrientDoseCreditAllowedByMethodAlone: false as const,
  },
  DEHYDROGENASE_ACTIVITY: {
    scope: "MICROBIAL_ACTIVITY" as const,
    methodFamily: "DEHYDROGENASE_ACTIVITY" as const,
    status: "CLASSICAL_REFERENCE_METHOD" as const,
    description:
      "Atividade de desidrogenase é indicador bioquímico de atividade microbiana; substrato, incubação e unidade precisam acompanhar o resultado.",
    sourceTitle: "Embrapa — Indicadores biológicos e bioquímicos da qualidade do solo: manual técnico",
    nutrientDoseCreditAllowedByMethodAlone: false as const,
  },
  PHOSPHATASE_ACTIVITY: {
    scope: "PHOSPHORUS_CYCLING" as const,
    methodFamily: "PHOSPHATASE_ACTIVITY" as const,
    status: "CLASSICAL_REFERENCE_METHOD" as const,
    description:
      "Fosfatases ácida/alcalina descrevem atividade enzimática ligada à ciclagem de P; não equivalem a fósforo disponível nem autorizam crédito automático de P2O5.",
    sourceTitle: "Embrapa — Indicadores biológicos e bioquímicos da qualidade do solo: manual técnico",
    nutrientDoseCreditAllowedByMethodAlone: false as const,
  },
  MAPA_INOCULANT_OFFICIAL_METHODS: {
    scope: "INOCULANT_PRODUCT_QUALITY" as const,
    methodFamily: "CULTURE_COUNT_CFU" as const,
    status: "PRODUCT_QUALITY_METHOD" as const,
    description:
      "Métodos oficiais MAPA para contagem, identificação e pureza de inoculantes. Servem ao controle/qualidade do produto e não equivalem, por si, a diagnóstico quantitativo de fertilidade do solo.",
    sourceTitle: "Métodos oficiais de controle de inoculantes — MAPA",
    nutrientDoseCreditAllowedByMethodAlone: false as const,
  },
} as const;
