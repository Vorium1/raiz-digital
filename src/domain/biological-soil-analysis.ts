export type BiologicalSoilParameterCode =
  | "BIOAS_BETA_GLUCOSIDASE"
  | "BIOAS_ARYLSULFATASE"
  | "BIOAS_IQS_BIO"
  | "BIOAS_IQS_QUIM"
  | "BIOAS_IQS_FERTBIO"
  | "BIOAS_CYCLING_SCORE"
  | "BIOAS_STORAGE_SCORE"
  | "BIOAS_SUPPLY_SCORE";

export type BiologicalSoilRegionScope = "CERRADO" | "SOUTH_BRAZIL" | "OTHER_BRAZIL";
export type BiologicalSoilCropGroup =
  | "ANNUAL_GRAIN_FIBER"
  | "COFFEE"
  | "SUGARCANE"
  | "PASTURE"
  | "EUCALYPTUS"
  | "HORTICULTURE"
  | "FRUIT"
  | "OTHER";

export type BiologicalSoilObservation = {
  parameterCode: string;
  value: number;
  unit: string;
  method: string;
  depthFromCm?: number | null;
  depthToCm?: number | null;
  sourceKind?: "LAB_MEASURED" | "LAB_DERIVED_INDEX";
};

export type BiologicalSoilEvidenceInput = {
  regionScope: BiologicalSoilRegionScope;
  cropGroup: BiologicalSoilCropGroup;
  observations: BiologicalSoilObservation[];
  officialLabInterpretationAvailable?: boolean;
  sourceVersion?: string | null;
};

const CORE_ENZYMES = new Set(["BIOAS_BETA_GLUCOSIDASE", "BIOAS_ARYLSULFATASE"]);
const BIOAS_INDEXES = new Set([
  "BIOAS_IQS_BIO",
  "BIOAS_IQS_QUIM",
  "BIOAS_IQS_FERTBIO",
  "BIOAS_CYCLING_SCORE",
  "BIOAS_STORAGE_SCORE",
  "BIOAS_SUPPLY_SCORE",
]);

export function isBiologicalSoilParameter(parameterCode: string) {
  return CORE_ENZYMES.has(parameterCode) || BIOAS_INDEXES.has(parameterCode);
}

/**
 * Camada de evidência biológica do solo.
 *
 * Regras centrais:
 * - importar biologia é sempre opcional para o laudo agronômico principal;
 * - ausência de BioAS nunca transforma uma análise químico/física válida em incompleta;
 * - índices entregues pelo laboratório são preservados como evidência; a RAIZ não
 *   recalcula IQS sem algoritmo/versionamento homologado;
 * - atividade biológica, isoladamente, não gera crédito automático de N/P/S, nem
 *   reduz/aumenta doses determinísticas de fertilizante/corretivo.
 */
export function evaluateBiologicalSoilEvidence(
  input: BiologicalSoilEvidenceInput,
) {
  const observations = input.observations.filter((item) => isBiologicalSoilParameter(item.parameterCode));
  const codes = new Set(observations.map((item) => item.parameterCode));

  const beta = observations.find((item) => item.parameterCode === "BIOAS_BETA_GLUCOSIDASE") ?? null;
  const aryl = observations.find((item) => item.parameterCode === "BIOAS_ARYLSULFATASE") ?? null;
  const iqBio = observations.find((item) => item.parameterCode === "BIOAS_IQS_BIO") ?? null;
  const iqQuim = observations.find((item) => item.parameterCode === "BIOAS_IQS_QUIM") ?? null;
  const iqFertBio = observations.find((item) => item.parameterCode === "BIOAS_IQS_FERTBIO") ?? null;

  const hasAnyBiology = observations.length > 0;
  const hasCoreEnzymes = Boolean(beta && aryl);
  const hasLabIndexes = Boolean(iqBio || iqQuim || iqFertBio);

  const warnings: string[] = [];
  if (hasAnyBiology && !hasCoreEnzymes) warnings.push("BIOAS_CORE_ENZYME_PAIR_INCOMPLETE");

  for (const item of [beta, aryl]) {
    if (!item) continue;
    if (
      item.depthFromCm != null
      && item.depthToCm != null
      && !(item.depthFromCm === 0 && item.depthToCm === 10)
    ) {
      warnings.push("BIOAS_ENZYME_DEPTH_DIFFERS_FROM_STANDARD_0_10_CM");
      break;
    }
  }

  // A Rede BioAS é nacional e a interpretação oficial considera condições
  // regionais, textura e uso do solo. Portanto, um laudo oficial BioAS pode ser
  // preservado como evidência em qualquer região coberta pela rede.
  //
  // O que a RAIZ NÃO pode fazer é reconstruir silenciosamente IQS/classes a
  // partir das duas enzimas sem receber o algoritmo oficial versionado e as
  // variáveis de contexto exigidas. Assim, valores brutos sempre entram como
  // resultado; índices/classes oficiais entram quando vierem no laudo; e a
  // recomputação própria permanece bloqueada.
  const officialNationalInterpretationUsable = Boolean(input.officialLabInterpretationAvailable);
  const automaticRaizInterpretationAllowed = false;

  if (hasCoreEnzymes && !officialNationalInterpretationUsable && !hasLabIndexes) {
    warnings.push("BIOAS_RAW_ENZYMES_REQUIRE_OFFICIAL_OR_VERSIONED_INTERPRETATION");
  }
  if (hasLabIndexes && !input.officialLabInterpretationAvailable) {
    warnings.push("LAB_BIOAS_INDEX_IMPORTED_WITHOUT_OFFICIAL_INTERPRETATION_METADATA");
  }

  return {
    hasAnyBiology,
    coreBioAs: {
      betaGlucosidase: beta,
      arylsulfatase: aryl,
      complete: hasCoreEnzymes,
    },
    labProvidedIndexes: {
      iqsBio: iqBio,
      iqsQuim: iqQuim,
      iqsFertBio: iqFertBio,
      cyclingScore: observations.find((item) => item.parameterCode === "BIOAS_CYCLING_SCORE") ?? null,
      storageScore: observations.find((item) => item.parameterCode === "BIOAS_STORAGE_SCORE") ?? null,
      supplyScore: observations.find((item) => item.parameterCode === "BIOAS_SUPPLY_SCORE") ?? null,
    },
    interpretation: {
      sourceVersion: input.sourceVersion ?? null,
      officialLabInterpretationAvailable: Boolean(input.officialLabInterpretationAvailable),
      automaticRaizInterpretationAllowed,
      officialNationalBioAsInterpretationUsable: officialNationalInterpretationUsable,
      labReportedInterpretationCanBePreserved: officialNationalInterpretationUsable,
      nationalBioAsNetworkEvidenceAllowed: true as const,
      raizRecomputationOfOfficialIndexesAllowed: false as const,
      crossRegionAlgorithmTransferAllowed: false as const,
      labIndexesMustBePreservedNotRecomputed: true as const,
    },
    analysisPolicy: {
      biologyRequiredForBaseSoilOpinion: false as const,
      missingBiologyBlocksAnalysis: false as const,
      missingBiologyBlocksOfficialReport: false as const,
      automaticNutrientCreditAllowed: false as const,
      automaticDoseReductionAllowed: false as const,
      automaticDoseIncreaseAllowed: false as const,
    },
    warnings: [...new Set(warnings)],
  };
}

export const BIOLOGICAL_SOIL_PARAMETER_METADATA: Record<
  BiologicalSoilParameterCode,
  { label: string; category: "BIOAS_CORE" | "BIOAS_INDEX"; defaultUnit: string }
> = {
  BIOAS_BETA_GLUCOSIDASE: {
    label: "β-glicosidase",
    category: "BIOAS_CORE",
    defaultUnit: "mg p-nitrofenol kg⁻¹ solo h⁻¹",
  },
  BIOAS_ARYLSULFATASE: {
    label: "Arilsulfatase",
    category: "BIOAS_CORE",
    defaultUnit: "mg p-nitrofenol kg⁻¹ solo h⁻¹",
  },
  BIOAS_IQS_BIO: { label: "IQS Biológico", category: "BIOAS_INDEX", defaultUnit: "índice" },
  BIOAS_IQS_QUIM: { label: "IQS Químico", category: "BIOAS_INDEX", defaultUnit: "índice" },
  BIOAS_IQS_FERTBIO: { label: "IQS FertBio", category: "BIOAS_INDEX", defaultUnit: "índice" },
  BIOAS_CYCLING_SCORE: { label: "Ciclagem de nutrientes", category: "BIOAS_INDEX", defaultUnit: "índice" },
  BIOAS_STORAGE_SCORE: { label: "Armazenamento de nutrientes", category: "BIOAS_INDEX", defaultUnit: "índice" },
  BIOAS_SUPPLY_SCORE: { label: "Suprimento de nutrientes", category: "BIOAS_INDEX", defaultUnit: "índice" },
};
